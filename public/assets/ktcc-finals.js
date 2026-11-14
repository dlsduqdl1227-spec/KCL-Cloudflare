/* KTCC-only final team selection and manager-owned advancement metadata. */
var _ktccFinalTeams={token:'',list:[],loaded:false,loading:false,request:0};
function ktccCanDecide_(){return isAdminRole()||isTeamLeaderForCode_('KTCC');}
var _ktccStageNames=['8강','4강','결승','순위결정','미지정','기타'];
var _ktccReviewStage='',_ktccReviewStageScope='';
function ktccStageKey_(item){var stage=String(item&&item['토너먼트 단계']||'').trim();return !stage?'미지정':_ktccStageNames.slice(0,4).indexOf(stage)>=0?stage:'기타';}
function ktccStageNavigation_(id,selected,counts,onSelect){
 var nav=document.createElement('div');nav.id=id;nav.className='ktcc-stage-navigation no-print';nav.setAttribute('role','group');nav.setAttribute('aria-label','KTCC 결선 경기 단계');
 [''].concat(_ktccStageNames).forEach(function(stage){
  if((stage==='미지정'||stage==='기타')&&!counts[stage]&&stage!==selected)return;
  var button=document.createElement('button');button.type='button';button.className='ktcc-stage-choice';button.textContent=stage||'전체';button.dataset.stage=stage;button.setAttribute('aria-pressed',String(stage===selected));
  button.onclick=function(){onSelect(stage);};nav.appendChild(button);
 });return nav;
}
function ktccRenderStageReview_(items,wrap){
 document.getElementById('pReview').classList.add('ktcc-stage-review');
 var scope=String(_judge.judgeToken||'')+'::'+_reviewState.finalRound;
 if(scope!==_ktccReviewStageScope){_ktccReviewStageScope=scope;_ktccReviewStage='';}
 var counts={};items.forEach(function(item){var stage=ktccStageKey_(item);counts[stage]=(counts[stage]||0)+1;});
 var old=document.getElementById('ktcc-review-stages');if(old)old.remove();
 var nav=ktccStageNavigation_('ktcc-review-stages',_ktccReviewStage,counts,function(stage){_ktccReviewStage=stage;renderFinalEvaluationList_(_reviewState.list||[],'KTCC');});
 wrap.before(nav);wrap.textContent='';
 var selected=_ktccReviewStage?items.filter(function(item){return ktccStageKey_(item)===_ktccReviewStage;}):items;
 document.getElementById('review-stat').textContent='결선 · '+(_ktccReviewStage||'전체 경기')+' · 평가완료 '+selected.filter(function(item){return item.status!=='반려';}).length+'건 · 반려 '+selected.filter(function(item){return item.status==='반려';}).length+'건';
 document.getElementById('review-count-val').textContent=selected.length+'건';
 if(!selected.length){var empty=document.createElement('p');empty.className='ktcc-stage-empty';empty.textContent=_ktccReviewStage?_ktccReviewStage+'에 표시할 평가가 없습니다.':reviewManageScopeForCode_('KTCC')?'이 회차에 제출된 평가가 없습니다.':'반려된 평가가 없습니다.';wrap.appendChild(empty);return;}
 _ktccStageNames.forEach(function(stage){
  var group=selected.filter(function(item){return ktccStageKey_(item)===stage;});if(!group.length)return;
  var section=document.createElement('section'),title=document.createElement('h3'),body=document.createElement('div');section.className='ktcc-stage-review-section';
  title.textContent=(stage==='미지정'?'경기 단계 미지정':stage==='기타'?'기타 경기':stage)+' · '+group.length+'건';section.appendChild(title);section.appendChild(body);wrap.appendChild(section);renderFinalEvaluationRows_(group,'KTCC',body);
 });
}
function ktccRenderRankingStages_(code,round,stage,counts){
 var old=document.getElementById('ktcc-ranking-stages');if(old)old.remove();
 if(code!=='KTCC'||round!=='결선')return;
 var nav=ktccStageNavigation_('ktcc-ranking-stages',stage||'',counts||{},function(value){if(_rankingContext&&_rankingContext.code==='KTCC')goRankingByCode('KTCC',_rankingContext.name,'결선',value);});
 document.querySelector('#pRanking .rank-summary').before(nav);
}
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
 ktccAddHiddenMissionAction_(row,item);
}
var _ktccMissionUi={dialog:null,loaded:null,ticket:0,saving:false,opener:null};
function ktccMissionLabel_(result){return result==='correct'?'정답 · +4점':result==='incorrect'?'오답 · 0점':'미기록';}
function ktccMissionSelected_(){var selected=_ktccMissionUi.dialog.querySelector('input[name="ktcc-hidden-result"]:checked');return selected?selected.value:'';}
function ktccMissionPreview_(){
 var state=_ktccMissionUi,res=state.loaded;if(!res)return;
 var result=ktccMissionSelected_(),points=result==='correct'?4:0;
 state.dialog.querySelector('[data-mission-total]').textContent='기존 '+res.baseScore+'점 + 히든미션 '+points+'점 = '+(res.disqualified?0:res.baseScore+points)+'점'+(res.disqualified?' · 실격':result?'':' · 히든미션 미기록');
}
function ktccMissionClose_(){
 var state=_ktccMissionUi;if(state.saving)return;
 if(state.loaded&&ktccMissionSelected_()!==state.loaded.result&&!confirm('저장하지 않은 히든미션 결과를 닫을까요?'))return;
 state.ticket++;state.dialog.close();state.loaded=null;if(state.opener&&state.opener.isConnected)state.opener.focus();
}
function ktccOpenHiddenMission_(item,opener){
 if(!ktccCanDecide_()||item.round!=='결선')return;
 var state=_ktccMissionUi;if(state.saving)return;
 if(!state.dialog){
  var dialog=document.createElement('dialog');dialog.id='ktcc-mission-dialog';dialog.setAttribute('aria-labelledby','ktcc-mission-title');
  dialog.innerHTML='<header><h2 id="ktcc-mission-title">결선 히든미션</h2><button type="button" data-mission-close>닫기</button></header><div class="ktcc-mission-content"><strong data-mission-team></strong><p class="ktcc-final-note" data-mission-summary></p><fieldset><legend>5컵 중 다른 컵 1개 찾기</legend><label><input type="radio" name="ktcc-hidden-result" value="">미기록</label><label><input type="radio" name="ktcc-hidden-result" value="correct">정답 <b>+4점</b></label><label><input type="radio" name="ktcc-hidden-result" value="incorrect">오답 <b>0점</b></label></fieldset><p data-mission-total></p><p class="ktcc-final-note">기존 평가 점수·종료시간·서명은 그대로 유지됩니다. 저장한 결과는 순위와 디브리핑에 반영됩니다.</p><p role="status" aria-live="polite" data-mission-message></p></div><footer><button type="button" data-mission-reload>다시 불러오기</button><button type="button" data-mission-save>결과 저장</button></footer>';
  document.body.appendChild(dialog);state.dialog=dialog;
  dialog.querySelector('[data-mission-close]').onclick=ktccMissionClose_;
  dialog.addEventListener('cancel',function(e){e.preventDefault();ktccMissionClose_();});
  dialog.querySelectorAll('input').forEach(function(input){input.onchange=ktccMissionPreview_;});
  dialog.querySelector('[data-mission-reload]').onclick=function(){if(!state.loaded||ktccMissionSelected_()===state.loaded.result||confirm('입력 중인 결과 대신 저장된 결과를 불러올까요?'))ktccLoadHiddenMission_(state.rowIndex);};
  dialog.querySelector('[data-mission-save]').onclick=ktccSaveHiddenMission_;
 }
 state.rowIndex=item.rowIndex;state.opener=opener;state.loaded=null;state.dialog.showModal();ktccLoadHiddenMission_(state.rowIndex);
}
function ktccLoadHiddenMission_(rowIndex){
 var state=_ktccMissionUi,dialog=state.dialog,ticket=++state.ticket,token=_judge.judgeToken;
 dialog.querySelectorAll('button').forEach(function(n){n.disabled=false;});
 state.loaded=null;dialog.querySelectorAll('input,[data-mission-save]').forEach(function(n){n.disabled=true;});
 dialog.querySelector('[data-mission-team]').textContent='';dialog.querySelector('[data-mission-summary]').textContent='';dialog.querySelector('[data-mission-total]').textContent='';dialog.querySelectorAll('input').forEach(function(n){n.checked=false;});
 dialog.querySelector('[data-mission-message]').textContent='최신 평가와 히든미션 결과를 확인하는 중…';
 function finish(res){
  if(ticket!==state.ticket||!dialog.open||!_judge||_judge.judgeToken!==token)return;
  if(!res||!res.success){dialog.querySelector('[data-mission-message]').textContent=res&&res.message||'불러오지 못했습니다. 다시 불러오기를 눌러주세요.';return;}
  state.loaded=res;dialog.querySelector('[data-mission-team]').textContent=res.teamName||'팀명 미입력';
  dialog.querySelector('[data-mission-summary]').textContent=[res.stage,res.opponent?'상대팀 '+res.opponent:'',res.endTime,res.returned?'반려 중 · 재제출 후 순위 반영':''].filter(Boolean).join(' · ');
  dialog.querySelectorAll('input').forEach(function(n){n.disabled=false;n.checked=n.value===res.result;});dialog.querySelector('[data-mission-save]').disabled=false;
  dialog.querySelector('[data-mission-message]').textContent='';ktccMissionPreview_();
 }
 google.script.run.withSuccessHandler(finish).withFailureHandler(function(){finish(null);}).getKtccHiddenMission({rowIndex:rowIndex},{judgeToken:token});
}
function ktccSaveHiddenMission_(){
 var state=_ktccMissionUi;if(state.saving||!state.loaded||!ktccCanDecide_())return;
 var dialog=state.dialog,ticket=state.ticket,token=_judge.judgeToken,loaded=state.loaded,result=ktccMissionSelected_();
 state.saving=true;dialog.querySelectorAll('button,input').forEach(function(n){n.disabled=true;});dialog.querySelector('[data-mission-message]').textContent='저장 중…';
 function finish(res){
  state.saving=false;if(ticket!==state.ticket)return;
  if(!_judge||_judge.judgeToken!==token){dialog.close();state.loaded=null;return;}
  dialog.querySelectorAll('button,input').forEach(function(n){n.disabled=false;});
  if(!res||!res.success){state.loaded=null;dialog.querySelector('[data-mission-save]').disabled=true;dialog.querySelector('[data-mission-message]').textContent=res&&res.message||'저장 상태를 확인하지 못했습니다. 다시 불러와 확인해주세요.';return;}
  state.loaded=res;dialog.querySelector('[data-mission-message]').textContent=res.message;ktccMissionPreview_();
  (_reviewState.list||[]).forEach(function(item){if(String(item.rowIndex)===String(res.rowIndex))item.ktccHiddenMission=res.recorded?{recorded:true,result:res.result,points:res.points,baseScore:res.baseScore,totalScore:res.totalScore}:null;});
  document.querySelectorAll('.ktcc-mission-btn').forEach(function(button){if(button.dataset.rowIndex===String(res.rowIndex)){button.textContent='히든미션 · '+ktccMissionLabel_(res.result);var summary=button.closest('.review-item').querySelector('.ktcc-mission-summary');if(summary)summary.textContent=res.recorded?'기존 '+res.baseScore+'점 + 히든미션 '+res.points+'점 = '+res.totalScore+'점':'';}});
 }
 google.script.run.withSuccessHandler(finish).withFailureHandler(function(){finish(null);}).setKtccHiddenMission({rowIndex:loaded.rowIndex,result:result,revision:loaded.revision},{judgeToken:token});
}
function ktccAddHiddenMissionAction_(row,item){
 if(!ktccCanDecide_()||item.round!=='결선')return;
 var result=item.ktccHiddenMission,summary=document.createElement('div');summary.className='review-info-sub ktcc-mission-summary';
 if(result)summary.textContent='기존 '+result.baseScore+'점 + 히든미션 '+result.points+'점 = '+result.totalScore+'점';
 row.firstElementChild.appendChild(summary);
 var button=document.createElement('button');button.type='button';button.className='review-edit-btn ktcc-mission-btn';button.dataset.rowIndex=String(item.rowIndex);button.textContent='히든미션 · '+ktccMissionLabel_(result&&result.result);button.onclick=function(){ktccOpenHiddenMission_(item,button);};row.querySelector('.review-actions').appendChild(button);
}
