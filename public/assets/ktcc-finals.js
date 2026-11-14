/* KTCC-only final team selection and manager-owned advancement metadata. */
var _ktccFinalTeams={token:'',list:[],loaded:false,loading:false,request:0};
function ktccCanDecide_(){return isAdminRole()||isTeamLeaderForCode_('KTCC');}
function ktccSyncSetup_(){
 var final=!!finalRoundForCode_('KTCC'),input=document.getElementById('ktccSetupSingleInput');if(input)input.style.display=final?'none':'';
 var title=document.getElementById('ktcc-setup-team-title');if(title)title.textContent=final?'결선팀 선택':'팀 번호 / 팀명 선택';
 var help=document.getElementById('ktcc-setup-team-help');if(help)help.textContent=final?'평가할 결선팀을 선택해 추가하세요. 팀명과 팀원 이름으로 확인할 수 있습니다.':'KTCC는 팀 단위 대회입니다. 팀번호와 팀명을 선택하면 팀원 이름도 함께 확인할 수 있습니다.';
 if(final)ktccLoadFinalTeams_();
}
function ktccOpponentName_(select){return select&&select.selectedOptions[0]?select.selectedOptions[0].dataset.teamName||'':'';}
function ktccOpponentId_(select){return select&&/^\d+$/.test(select.value)?select.value:'';}
function ktccOpponentChanged_(select){select.dataset.savedName=ktccOpponentName_(select);select.dataset.savedId=ktccOpponentId_(select);}
function ktccSetOpponent_(select,name,id,ownNumber){
 if(!select)return;name=String(name||'');id=String(id||'');select.dataset.savedName=name;select.dataset.savedId=id;select.dataset.ownNumber=String(ownNumber||'');
 select.textContent='';var empty=document.createElement('option');empty.value='';empty.textContent='상대팀을 선택하세요';select.appendChild(empty);
 var matched=null;
 _ktccFinalTeams.list.forEach(function(team){if(participantNumberMatches_(team.number,ownNumber))return;var option=document.createElement('option');option.value=String(team.id);option.dataset.teamName=team.name;option.textContent=team.name+(team.members?' · '+team.members:'');select.appendChild(option);if(id===String(team.id)||(!id&&name===team.name))matched=option;});
 if(matched){select.value=matched.value;ktccOpponentChanged_(select);}
 else if(name){var old=document.createElement('option');old.value=id||'legacy';old.dataset.teamName=name;old.textContent=name+' · 기존 기록';select.appendChild(old);select.value=old.value;}
}
function ktccLoadFinalTeams_(force){
 var token=_judge&&_judge.judgeToken||'';if(!token)return;
 if(_ktccFinalTeams.token!==token)_ktccFinalTeams={token:token,list:[],loaded:false,loading:false,request:0};
 if(_ktccFinalTeams.loading||(_ktccFinalTeams.loaded&&!force))return;
 _ktccFinalTeams.loading=true;var state=_ktccFinalTeams,request=++state.request;
 google.script.run.withSuccessHandler(function(res){if(state!==_ktccFinalTeams||request!==state.request||!_judge||_judge.judgeToken!==token)return;state.loading=false;
  var status=document.getElementById('ktcc-opponent-status');if(!res||!res.success){if(status)status.textContent=res&&res.message||'상대팀 목록을 확인하지 못했습니다. 기존 선택은 유지됩니다.';return;}
  state.list=res.teams||[];state.loaded=true;if(status)status.textContent='';
  document.querySelectorAll('select[data-ktcc-opponent]').forEach(function(select){ktccSetOpponent_(select,select.dataset.savedName,select.dataset.savedId,select.dataset.ownNumber);});
 }).withFailureHandler(function(){if(state!==_ktccFinalTeams)return;state.loading=false;var status=document.getElementById('ktcc-opponent-status');if(status)status.textContent='상대팀 목록 연결을 확인해주세요. 입력 내용은 유지됩니다.';}).getKtccFinalTeams({judgeToken:token});
}
function ktccOpponentReviewField_(wrap,obj){
 var field=document.createElement('div');field.className='review-field';var label=document.createElement('label');label.className='review-field-label';label.textContent='상대팀 선택';
 var select=document.createElement('select');select.dataset.ktccOpponent='1';select.disabled=!obj.editable;select.setAttribute('aria-label','상대팀 선택');label.appendChild(select);field.appendChild(label);
 var hidden=document.createElement('input');hidden.type='hidden';hidden.dataset.col=obj.idx;hidden.value=obj.val||'';field.appendChild(hidden);
 var idIndex=(_reviewState.headers||[]).indexOf('상대팀ID'),idInput=null,current=_reviewState.current||{};
 if(idIndex>=0){idInput=document.createElement('input');idInput.type='hidden';idInput.dataset.col=idIndex;idInput.value=current['상대팀ID']||'';field.appendChild(idInput);}
 ktccSetOpponent_(select,obj.val,current['상대팀ID'],current['팀번호']||current.unit||current._col7);
 select.onchange=function(){ktccOpponentChanged_(select);hidden.value=ktccOpponentName_(select);if(idInput)idInput.value=ktccOpponentId_(select);scheduleReviewAutoSave();};
 wrap.appendChild(field);ktccLoadFinalTeams_();
}
var _ktccDecisionUi={dialog:null,loaded:null,ticket:0,saving:false};
function ktccDecisionClose_(){var state=_ktccDecisionUi;if(state.saving)return;var select=state.dialog&&state.dialog.querySelector('select');if(state.loaded&&select.value!==state.loaded.result&&!confirm('저장하지 않은 진출 판정을 닫을까요?'))return;state.ticket++;if(state.dialog)state.dialog.close();state.loaded=null;}
function ktccOpenFinalDecision_(item){
 if(!ktccCanDecide_())return;
 var state=_ktccDecisionUi;if(state.saving)return;
 if(!state.dialog){var dialog=document.createElement('dialog');dialog.id='ktcc-decision-dialog';dialog.setAttribute('aria-labelledby','ktcc-decision-title');dialog.innerHTML='<header><h2 id="ktcc-decision-title">진출 판정</h2><button type="button" data-decision-close>닫기</button></header><div class="ktcc-decision-content"><div data-decision-team></div><p class="ktcc-final-note" data-decision-summary></p><label for="ktcc-decision-result">판정</label><select id="ktcc-decision-result"><option value="">미기록</option><option value="진출">진출</option><option value="탈락">탈락</option><option value="순위결정">순위결정</option></select><p class="ktcc-final-note">이 판정은 평가 점수·종료시간·순위를 변경하지 않습니다.</p><p role="status" data-decision-message></p></div><footer><button type="button" data-decision-reload>다시 불러오기</button><button type="button" data-decision-save>판정 저장</button></footer>';document.body.appendChild(dialog);state.dialog=dialog;
  dialog.querySelector('[data-decision-close]').onclick=ktccDecisionClose_;dialog.addEventListener('cancel',function(e){e.preventDefault();ktccDecisionClose_();});dialog.querySelector('[data-decision-save]').onclick=ktccSaveFinalDecision_;dialog.querySelector('[data-decision-reload]').onclick=function(){ktccLoadFinalDecision_(state.rowIndex);};
 }
 state.rowIndex=item.rowIndex;state.loaded=null;state.dialog.showModal();ktccLoadFinalDecision_(state.rowIndex);
}
function ktccLoadFinalDecision_(rowIndex){
 var state=_ktccDecisionUi,ticket=++state.ticket,token=_judge.judgeToken,dialog=state.dialog;state.loaded=null;dialog.querySelector('[data-decision-save]').disabled=true;dialog.querySelector('[data-decision-message]').textContent='최신 평가를 확인하는 중…';
 google.script.run.withSuccessHandler(function(res){if(ticket!==state.ticket||!dialog.open||!_judge||_judge.judgeToken!==token)return;
  if(!res||!res.success){dialog.querySelector('[data-decision-message]').textContent=res&&res.message||'불러오지 못했습니다. 다시 시도해주세요.';return;}
  state.loaded=res;dialog.querySelector('[data-decision-team]').textContent=res.teamName||'팀명 미입력';dialog.querySelector('[data-decision-summary]').textContent=[res.stage,res.opponent?'상대팀 '+res.opponent:'',res.total+'점',res.endTime].filter(Boolean).join(' · ');dialog.querySelector('select').value=res.result||'';dialog.querySelector('[data-decision-message]').textContent='';dialog.querySelector('[data-decision-save]').disabled=false;
 }).withFailureHandler(function(){if(ticket===state.ticket)dialog.querySelector('[data-decision-message]').textContent='연결을 확인한 뒤 다시 불러와주세요.';}).getKtccFinalDecision({rowIndex:rowIndex},{judgeToken:token});
}
function ktccSaveFinalDecision_(){
 var state=_ktccDecisionUi;if(state.saving||!state.loaded)return;var dialog=state.dialog,result=dialog.querySelector('select').value,ticket=state.ticket,token=_judge.judgeToken;
 state.saving=true;dialog.querySelectorAll('button,select').forEach(function(n){n.disabled=true;});dialog.querySelector('[data-decision-message]').textContent='저장 중…';
 function finish(res){state.saving=false;if(ticket!==state.ticket)return;if(!_judge||_judge.judgeToken!==token){dialog.close();state.loaded=null;return;}dialog.querySelectorAll('button,select').forEach(function(n){n.disabled=false;});dialog.querySelector('[data-decision-message]').textContent=res&&res.message||'저장 상태를 확인하지 못했습니다. 다시 불러와 확인해주세요.';if(res&&res.success){state.loaded=res;dialog.querySelector('select').value=res.result;(_reviewState.list||[]).forEach(function(item){if(String(item.rowIndex)===String(res.rowIndex)){item['진출판정']=res.result;item.finalRevision=res.revision;}});document.querySelectorAll('.ktcc-decision-btn').forEach(function(button){if(button.dataset.rowIndex===String(res.rowIndex))button.textContent='진출 판정'+(res.result?' · '+res.result:'');});}else if(res&&res.stale){state.loaded=null;dialog.querySelector('[data-decision-save]').disabled=true;}}
 google.script.run.withSuccessHandler(finish).withFailureHandler(function(){finish(null);}).setKtccFinalDecision({rowIndex:state.loaded.rowIndex,result:result,revision:state.loaded.revision},{judgeToken:_judge.judgeToken});
}
function ktccAddFinalDecisionAction_(row,item){
 if(!ktccCanDecide_())return;var button=document.createElement('button');button.type='button';button.className='review-edit-btn ktcc-decision-btn';button.dataset.rowIndex=String(item.rowIndex);button.textContent='진출 판정'+(item['진출판정']?' · '+item['진출판정']:'');button.onclick=function(){ktccOpenFinalDecision_(item);};row.querySelector('.review-actions').appendChild(button);
}

// Current final hidden mission; historical records keep their original theme/rule.
(function(){
 var RULE='히든미션: 5컵 중 다른 컵 1개 찾기 (정답 4점 / 오답 0점)';
 function final(){return _ktcc.round==='final';}
 var counts=window.ktccSectionCupCounts_;window.ktccSectionCupCounts_=function(round){var value=counts(round);if(round!=='qual')value.section3=5;return value;};
 var max=window.ktccMaxForSection_;window.ktccMaxForSection_=function(section){return final()&&section==='section3'?1:max(section);};
 var set=window.ktccSetSectionCount_;window.ktccSetSectionCount_=function(section,count){return set(section,final()&&section==='section3'?Math.min(1,Number(count)):count);};
 var score=window.ktccSectionScore_;window.ktccSectionScore_=function(section){var n=score(section);return final()&&section==='section3'?(n===1?1:0):n;};
 var bonus=window.ktccBonusFromS3_;window.ktccBonusFromS3_=function(n,invalid){return final()?(!invalid&&Number(n)===1?3:0):bonus(n,invalid);};
 var render=window.renderKtccCups;window.renderKtccCups=function(section){
  if(!final()||section!=='section3')return render(section);
  var raw=ktccSectionRawCount_(section),invalid=ktccSectionInvalid_(section),locked=isCurrentKtccLocked_();
  document.getElementById('ktcc-section3-cups').innerHTML='<p>5컵 중 다른 컵 1개 찾기 · 정답 4점 / 오답 0점</p><div class="ktcc-group-count">'+[0,1].map(function(n){return '<button type="button" class="g-btn'+(!invalid&&raw===n?' on':'')+'" '+(locked?'disabled':'')+' onclick="ktccChooseHiddenMission_('+n+')">'+(n?'정답 · 4점':'오답 · 0점')+'</button>';}).join('')+'</div>'+(raw>1?'<p>기존 임시 기록입니다. 히든미션의 정답 또는 오답을 다시 선택해주세요.</p>':'');
 };
 window.ktccChooseHiddenMission_=function(n){if(isCurrentKtccLocked_())return;ktccSetSectionInvalid_('section3',false);setKtccSectionAnswerCount('section3',n);};
 var start=window.startKtcc;window.startKtcc=function(){var result=start.apply(this,arguments);if(final()){
  var theme=document.getElementById('ktcc-s3-theme');theme.value=RULE;theme.readOnly=true;
  document.getElementById('ktcc-s3-label').textContent='히든미션';document.getElementById('ktcc-rule-desc').textContent='Section 1·2는 기존 기준을 적용합니다. 히든미션은 5컵 중 다른 컵 1개 찾기: 정답 4점, 오답 0점입니다.';updateKtccScore();
 }return result;};
 var update=window.updateKtccScore;window.updateKtccScore=function(){var result=update.apply(this,arguments);if(final()&&!evalDisqualificationPayload_('KTCC',_ktcc.disqualified,'시간 초과').disqualified)document.getElementById('ktcc-final-sub').textContent='히든미션 '+(ktccSectionScore_('section3')===1?'정답 · 4점':'오답 · 0점')+' · Section 1·2 점수 합산';return result;};
 var sign=window.ktccRequestSign;window.ktccRequestSign=function(){if(final()&&ktccSectionRawCount_('section3')>1){toast('히든미션 정답 또는 오답을 다시 선택해주세요.',true);return;}return sign.apply(this,arguments);};
 var sync=window.syncMocKtccReviewTotal_;window.syncMocKtccReviewTotal_=function(){var result=sync.apply(this,arguments),item=_reviewState.current||{};
  if(_reviewState.code!=='KTCC'||item['Section3 주제']!==RULE)return result;
  var hidden=document.getElementById('review-derived-total-input');if(!hidden||hidden.value==='')return result;
  var s1=reviewKtccSectionWrong_(1)?0:reviewKtccSectionScoreValue_(1),s2=reviewKtccSectionWrong_(2)?0:reviewKtccSectionScoreValue_(2),correct=!reviewKtccSectionWrong_(3)&&reviewKtccSectionScoreValue_(3)===1;
  var i=(_reviewState.headers||[]).indexOf('Section3 가산점'),input=i>=0?document.querySelector('#review-edit-fields input[data-col="'+i+'"]'):null;if(input)input.value=correct?'3':'0';
  setReviewDerivedTotalDisplay_((_reviewState.headers||[]).indexOf('총점'),s1+s2+(correct?4:0),{hiddenId:'review-derived-total-input',digits:1,dq:false,blankOnDq:true});return result;
 };
})();
