/* Manager-owned paper transcription. Every judge uses an isolated original form. */
var _paperWorkspace={code:'',entries:[],frames:[],active:-1,actorToken:'',ticket:0,selectionTicket:0,participantTicket:0,config:null,participants:[],participant:null},_paperEntryFrameContext=null;
function paperRpc_(action,args){return new Promise(function(resolve,reject){var runner=google.script.run.withSuccessHandler(resolve).withFailureHandler(reject);runner[action].apply(runner,args);});}
function paperWorkspaceSave_(){_paperWorkspace.frames.forEach(function(frame){if(frame)try{if(frame.contentWindow._paperEntryFrameContext&&typeof frame.contentWindow.kclSaveActiveEvalDraftNow_==='function')frame.contentWindow.kclSaveActiveEvalDraftNow_(true);}catch(error){frame.contentWindow.postMessage({type:'kcl-paper-save'},location.origin);}});}
async function paperWorkspaceFlush_(){
 var deadline=Date.now()+3500;
 for(;;){
  var applying=_paperWorkspace.frames.some(function(frame){try{return !!frame?.contentWindow._paperEntryFrameContext&&!!frame.contentWindow._kclDraftApplying;}catch(error){return false;}});
  if(!applying){paperWorkspaceSave_();return;}
  if(Date.now()>deadline)throw new Error('작성 내용을 정리하는 중입니다. 잠시 후 다시 시도해주세요. 기존 입력 화면은 유지됩니다.');
  await new Promise(function(resolve){setTimeout(resolve,40);});
 }
}
function paperWorkspaceClose_(){paperWorkspaceSave_();showPanel(isAdminRole()?'pAdmin':'pTeam');}
function paperWorkspacePanel_(){
 var panel=document.getElementById('pPaperEntry');if(panel)return panel;
 panel=document.createElement('div');panel.id='pPaperEntry';panel.className='panel';panel.innerHTML=[
 '<div class="paper-title-row"><h2>팀장 전용 수기 입력</h2><button type="button" class="btn-outline" id="paper-close">닫기</button></div>',
 '<div id="paper-setup" class="paper-card"><p>선수를 먼저 선택한 뒤 심사위원을 선택하세요. 모든 평가표에 같은 선수가 자동 적용됩니다.</p>',
 '<div class="paper-grid"><label>평가 라운드<select id="paper-round"></select></label><label id="paper-day-wrap" hidden>본선 일차<select id="paper-day"><option value="1">1일차</option><option value="2">2일차</option></select></label>',
 '<label id="paper-stage-wrap" hidden>KTCC 경기 단계<select id="paper-stage"><option>8강</option><option>4강</option><option>결승</option><option>순위결정</option></select></label></div>',
 '<label class="paper-target-label" for="paper-participant">1. 선수·팀 선택</label><select id="paper-participant" disabled><option value="">선수 목록을 확인하는 중…</option></select><p id="paper-participant-status" class="paper-message" role="status"></p>',
 '<fieldset id="paper-judge-step" disabled><legend>2. 심사위원 선택</legend><div id="paper-roster"></div>',
 '<label class="paper-confirm"><input type="checkbox" id="paper-confirm">선택한 심사위원이 작성한 종이 평가표를 기준으로 입력합니다.</label>',
 '<div class="paper-actions"><button class="btn-outline" type="button" id="paper-select-all">전체 선택</button><button class="btn-outline" type="button" id="paper-clear-all">선택 해제</button><button class="btn" type="button" id="paper-start">이 선수의 평가 입력 시작</button></div></fieldset></div>',
 '<p id="paper-message" class="paper-message" role="status"></p><div id="paper-editor" hidden><div id="paper-player-summary" class="paper-player-summary"></div>',
 '<div class="paper-actions"><button type="button" class="btn-outline" id="paper-draft-save">모두 임시저장</button><button type="button" class="btn-outline" id="paper-reselect">선수·심사위원 변경</button></div>',
 '<p class="paper-message">각 심사위원의 평가표는 위 선수로 고정됩니다. 심사위원 이름을 눌러 입력하고 각 평가표에서 저장하세요.</p>',
 '<div id="paper-judge-tabs" role="group" aria-label="수기 입력 심사위원"></div><div id="paper-frames"></div></div>'
 ].join('');
 document.body.appendChild(panel);var replaceNote=document.createElement('p');replaceNote.className='paper-replace-note';replaceNote.textContent='예선·본선·결선 모두 팀장 입력이 우선 반영됩니다. 같은 심사위원·참가자·경기의 기존 평가는 저장 시 새 내용으로 교체되며, 다른 라운드와 심사위원의 평가는 유지됩니다.';panel.querySelector('.paper-confirm').before(replaceNote);panel.querySelector('.paper-confirm').lastChild.textContent='종이 평가표를 확인했으며, 저장 시 기존 평가를 교체하는 데 동의합니다.';panel.querySelector('#paper-close').onclick=paperWorkspaceClose_;panel.querySelector('#paper-draft-save').onclick=function(){paperWorkspaceSave_();document.getElementById('paper-message').textContent='각 심사위원의 작성 내용을 이 기기에 임시저장했습니다.';};
 panel.querySelector('#paper-select-all').onclick=function(){panel.querySelectorAll('#paper-roster input').forEach(function(input,index){input.checked=index<12;});};panel.querySelector('#paper-clear-all').onclick=function(){panel.querySelectorAll('#paper-roster input').forEach(function(input){input.checked=false;});};
 panel.querySelector('#paper-start').onclick=paperWorkspaceStart_;panel.querySelector('#paper-round').onchange=paperWorkspaceLoadParticipants_;panel.querySelector('#paper-day').onchange=paperWorkspaceLoadParticipants_;
 panel.querySelector('#paper-participant').onchange=paperWorkspaceParticipant_;panel.querySelector('#paper-stage').onchange=function(){++_paperWorkspace.selectionTicket;};
 panel.querySelector('#paper-reselect').onclick=function(){if(confirm('현재 작성 내용을 임시저장하고 선수·심사위원 선택으로 돌아갈까요?')){paperWorkspaceSave_();document.getElementById('paper-setup').hidden=false;document.getElementById('paper-editor').hidden=true;}};
 return panel;
}
function paperWorkspaceDay_(){
 var round=document.getElementById('paper-round').value;
 document.getElementById('paper-day-wrap').hidden=!(_paperWorkspace.code==='KBC'&&round==='본선');
 document.getElementById('paper-stage-wrap').hidden=!(_paperWorkspace.code==='KTCC'&&round==='결선');
}
function paperWorkspaceParticipant_(){
 ++_paperWorkspace.selectionTicket;
 var selected=_paperWorkspace.participants.find(function(item){return item.key===document.getElementById('paper-participant').value;});
 document.getElementById('paper-judge-step').disabled=!selected;
 document.getElementById('paper-start').disabled=!selected;
 document.getElementById('paper-confirm').checked=false;
 document.querySelectorAll('#paper-roster input').forEach(function(input){input.checked=false;});
}
async function paperWorkspaceLoadParticipants_(){
 paperWorkspaceDay_();
 var ticket=++_paperWorkspace.participantTicket,workspaceTicket=_paperWorkspace.ticket;++_paperWorkspace.selectionTicket;
 var select=document.getElementById('paper-participant'),status=document.getElementById('paper-participant-status');
 var round=document.getElementById('paper-round').value,day=document.getElementById('paper-day').value;
 _paperWorkspace.participants=[];select.disabled=true;select.innerHTML='<option value="">선수 목록을 확인하는 중…</option>';
 document.getElementById('paper-judge-step').disabled=true;document.getElementById('paper-start').disabled=true;document.getElementById('paper-confirm').checked=false;status.textContent='';
 try{
  var result=await paperRpc_('getPaperEntryParticipants',[{competitionCode:_paperWorkspace.code,round:round,day:day},{judgeToken:_judge.judgeToken}]);
  if(ticket!==_paperWorkspace.participantTicket||workspaceTicket!==_paperWorkspace.ticket)return;
  if(!result.success)throw new Error(result.message);
  _paperWorkspace.participants=result.participants||[];select.innerHTML='<option value="">선수·팀을 선택하세요</option>';
  _paperWorkspace.participants.forEach(function(item){var option=document.createElement('option');option.value=item.key;option.textContent=item.display;select.appendChild(option);});
  select.disabled=!_paperWorkspace.participants.length;
  status.textContent=result.message||(_paperWorkspace.participants.length?'선수를 선택하면 심사위원 선택이 열립니다.':'이 라운드에 입력 가능한 선수가 없습니다. 등록·번호·스테이션 배정을 확인해주세요.');
 }catch(error){if(ticket===_paperWorkspace.participantTicket&&workspaceTicket===_paperWorkspace.ticket){select.innerHTML='<option value="">선수 목록 확인 필요</option>';status.textContent=error.message||'선수 목록을 불러오지 못했습니다.';}}
}
async function openPaperEntry_(cfg){
 if(!isAdminRole()&&!isTeamLeaderForCode_(cfg.code))return;
 var panel=paperWorkspacePanel_();
 if(_paperWorkspace.entries.length&&_paperWorkspace.code===cfg.code&&_paperWorkspace.actorToken===_judge.judgeToken){showPanel('pPaperEntry');return;}
 if(_paperWorkspace.entries.length&&!confirm('작성 내용을 임시저장하고 다른 대회의 수기 입력을 열까요?'))return;
 try{await paperWorkspaceFlush_();}catch(error){toast(error.message,true);return;}
 _paperWorkspace.entries=[];_paperWorkspace.frames=[];_paperWorkspace.participant=null;document.getElementById('paper-frames').textContent='';_paperWorkspace.code=cfg.code;_paperWorkspace.config=cfg;_paperWorkspace.actorToken=_judge.judgeToken;var ticket=++_paperWorkspace.ticket;
 panel.querySelector('#paper-setup').hidden=false;panel.querySelector('#paper-editor').hidden=true;panel.querySelector('#paper-roster').textContent='';panel.querySelector('#paper-message').textContent='등록된 심사위원을 확인하는 중…';showPanel('pPaperEntry');
 panel.querySelector('#paper-participant').disabled=true;panel.querySelector('#paper-participant').innerHTML='<option value="">선수 목록을 확인하는 중…</option>';panel.querySelector('#paper-judge-step').disabled=true;panel.querySelector('#paper-round').disabled=true;
 try{var res=await paperRpc_('getPaperEntryRoster',[{competitionCode:cfg.code},{judgeToken:_judge.judgeToken}]);if(ticket!==_paperWorkspace.ticket)return;if(!res.success)throw new Error(res.message);
  var rounds=panel.querySelector('#paper-round');rounds.textContent='';res.rounds.forEach(function(round){var option=document.createElement('option');option.value=round;option.textContent=competitionRoundLabel_(cfg.code,round,cfg.optionSettings);rounds.appendChild(option);});rounds.value=res.rounds.indexOf(cfg.currentRound)>=0?cfg.currentRound:res.rounds[0];rounds.disabled=false;paperWorkspaceDay_();
  res.judges.forEach(function(judge){var label=document.createElement('label');label.className='paper-person';var input=document.createElement('input');input.type='checkbox';input.value=judge.id;var text=document.createElement('span'),name=document.createElement('strong'),role=document.createElement('small');name.textContent=judge.name;role.textContent=[judge.role,judge.team,judge.date||'상시'].filter(Boolean).join(' · ');text.append(name,role);label.append(input,text);panel.querySelector('#paper-roster').appendChild(label);});
  await paperWorkspaceLoadParticipants_();
  if(ticket!==_paperWorkspace.ticket)return;
  panel.querySelector('#paper-message').textContent=res.judges.length?'':'등록된 심사위원이 없습니다.';
 }catch(error){if(ticket===_paperWorkspace.ticket)panel.querySelector('#paper-message').textContent=error.message||'목록을 불러오지 못했습니다.';}
}
async function paperWorkspaceStart_(){
 var ids=Array.from(document.querySelectorAll('#paper-roster input:checked')).map(function(input){return Number(input.value);}),button=document.getElementById('paper-start');
 var participant=_paperWorkspace.participants.find(function(item){return item.key===document.getElementById('paper-participant').value;});
 if(!participant){document.getElementById('paper-message').textContent='선수를 먼저 선택해주세요.';return;}
 if(!ids.length||ids.length>12||!document.getElementById('paper-confirm').checked){document.getElementById('paper-message').textContent='심사위원을 1~12명 선택하고 종이 평가표 확인에 체크해주세요.';return;}
 button.disabled=true;var ticket=_paperWorkspace.ticket,selectionTicket=_paperWorkspace.selectionTicket,actorToken=_judge.judgeToken;
 var selectedRound=document.getElementById('paper-round').value,stage=document.getElementById('paper-stage').value;
 try{await paperWorkspaceFlush_();if(ticket!==_paperWorkspace.ticket||selectionTicket!==_paperWorkspace.selectionTicket||_judge.judgeToken!==actorToken)return;var res=await paperRpc_('createPaperEntrySessions',[{competitionCode:_paperWorkspace.code,round:selectedRound,day:document.getElementById('paper-day').value,workflow:'participant-first',participantKey:participant.key,ktccStage:stage,operatorIds:ids,paperConfirmed:true,replaceExisting:true},{judgeToken:actorToken}]);if(ticket!==_paperWorkspace.ticket||selectionTicket!==_paperWorkspace.selectionTicket||_judge.judgeToken!==actorToken)return;if(!res.success)throw new Error(res.message);
  _paperWorkspace.participant=res.participant;document.getElementById('paper-player-summary').textContent=selectedRound+' · '+res.participant.display+(_paperWorkspace.code==='KTCC'&&selectedRound==='결선'?' · '+stage:'');
  _paperWorkspace.entries=res.entries;_paperWorkspace.frames=[];document.getElementById('paper-frames').textContent='';var tabs=document.getElementById('paper-judge-tabs');tabs.textContent='';res.entries.forEach(function(entry,index){var tab=document.createElement('button');tab.type='button';tab.textContent=entry.name;var role=document.createElement('small');role.textContent=entry.role;tab.appendChild(role);tab.setAttribute('aria-pressed','false');tab.onclick=function(){paperWorkspaceSelect_(index);};tabs.appendChild(tab);});
  document.getElementById('paper-setup').hidden=true;document.getElementById('paper-editor').hidden=false;document.getElementById('paper-message').textContent='';paperWorkspaceSelect_(0);
 }catch(error){document.getElementById('paper-message').textContent=error.message||'입력 화면을 열지 못했습니다.';}finally{button.disabled=false;}
}
function paperWorkspaceSelect_(index){
 paperWorkspaceSave_();_paperWorkspace.active=index;
 if(!_paperWorkspace.frames[index]){var frame=document.createElement('iframe');frame.title=_paperWorkspace.entries[index].name+' · '+(_paperWorkspace.participant?.display||'심사위원 평가표');frame.src='/assessment/?paperEntry=1';_paperWorkspace.frames[index]=frame;document.getElementById('paper-frames').appendChild(frame);}
 _paperWorkspace.frames.forEach(function(frame,i){if(frame)frame.hidden=i!==index;});Array.from(document.getElementById('paper-judge-tabs').children).forEach(function(tab,i){tab.setAttribute('aria-pressed',String(i===index));});
}
async function paperEntryFrameBoot_(token){
 if(_paperEntryFrameContext)return;showOverlay();
 try{var res=await paperRpc_('getPaperEntryBootstrap',[token]);if(!res.success)throw new Error(res.message);_paperEntryFrameContext={draftScope:res.draftScope,participant:res.participant,ktccStage:res.ktccStage};
  var storageMethods={};['getItem','setItem','removeItem'].forEach(function(method){storageMethods[method]=Storage.prototype[method];Storage.prototype[method]=function(key,value){return storageMethods[method].call(this,'KCL_PAPER_ENTRY::'+res.draftScope+'::'+key,value);};});
  _judge=res.actor;_configs=[res.config];_selComp=res.config;document.body.classList.add('paper-entry-frame');stopRegistryLiveSync_();hideOverlay();goEval();paperEntryApplyParticipant_();
  document.querySelectorAll('button').forEach(function(button){if(/서명.*제출/.test(button.textContent))button.textContent='수기 평가 저장';});
 }catch(error){hideOverlay();document.body.classList.add('paper-entry-frame');var message=document.createElement('p');message.className='paper-message';message.textContent=error.message||'입력 권한을 확인해주세요.';document.body.appendChild(message);}
}
var _paperApplyingParticipant=false;
function paperEntryApplyParticipant_(){
 var context=_paperEntryFrameContext,target=context&&context.participant,code=_selComp&&_selComp.code;
 if(!target||!code||_paperApplyingParticipant)return;
 _paperApplyingParticipant=true;
 try{
  var active=function(id){return document.getElementById(id)?.classList.contains('active');};
  if(code==='KCR'&&active('pCuppingSetup')){
   var state=participantStateForCode_(code);
   if(_kcrCompletionState&&_kcrCompletionState.ownerToken===_judge.judgeToken&&state.loaded&&!state.loading)startKcrStation_(target.stationId);
  }else if(code==='IKRC'&&active('pIkrcSetup'))startIkrcStation_(target.stationId);
  else if((code==='MOC'&&active('pMocSetup'))||(code==='KTCC'&&active('pKtccSetup'))){
   var list=participantListForCode_(code),assignment=list.find(function(item){return participantNumberMatches_(item.number,target.unit);});
   if(!assignment)return;
   if(code==='MOC')initMocTargets([Number(target.unit)]);
   else initKtccTargets([{num:Number(target.unit),teamName:participantNameForAssignment_(assignment)}]);
  }
  if(!kclActiveEvalEl_()||kclActiveEvalCode_()!==code)return;
  participantControlsForCode_(code).forEach(function(control){
   var select=document.getElementById(control.selectId),number=document.getElementById(control.numId),name=document.getElementById(control.nameId);
   if(select&&number&&['KBC','MOB','KCAC'].indexOf(code)>=0){
    var list=participantListForCode_(code),index=list.findIndex(function(item){return participantNumberMatches_(item.number,target.unit);});
    if(index>=0&&(!context.formBound||!participantNumberMatches_(number.value,target.unit))){select.value=String(index);applyParticipantSelect_(code,control.selectId,control.numId,control.nameId);context.formBound=true;}
   }
   if(select)select.disabled=true;if(number)number.readOnly=true;if(name)name.readOnly=true;
  });
  document.querySelectorAll('.participant-list-refresh[data-code="'+code+'"]').forEach(function(button){button.disabled=true;});
  (code==='MOC'?['moc-player-num','moc-player-name']:code==='KTCC'?['ktcc-team-num','ktcc-team-name']:[]).forEach(function(id){var input=document.getElementById(id);if(input)input.readOnly=true;});
  var day=document.getElementById('kbc-main-day');if(code==='KBC'&&day)day.disabled=true;
  if(code==='KTCC'&&context.ktccStage){var stage=document.getElementById('ktcc-match-stage');if(stage){stage.value=context.ktccStage;stage.disabled=true;}}
 }finally{_paperApplyingParticipant=false;}
}
window.addEventListener('message',function(event){
 if(event.origin!==location.origin)return;var data=event.data||{};
 if(isPaperEntryFrame_()&&event.source===parent){if(data.type==='kcl-paper-init')paperEntryFrameBoot_(data.token);if(data.type==='kcl-paper-save'&&_paperEntryFrameContext)try{kclSaveActiveEvalDraftNow_(true);}catch(error){}return;}
 if(data.type==='kcl-paper-ready'){var index=_paperWorkspace.frames.findIndex(function(frame){return frame&&frame.contentWindow===event.source;});if(index>=0&&_paperWorkspace.actorToken===_judge.judgeToken)event.source.postMessage({type:'kcl-paper-init',token:_paperWorkspace.entries[index].token},location.origin);}
 if(data.type==='kcl-paper-submitted'){var savedIndex=_paperWorkspace.frames.findIndex(function(frame){return frame&&frame.contentWindow===event.source;});if(savedIndex>=0){var entry=_paperWorkspace.entries[savedIndex];entry.savedCount=(entry.savedCount||0)+Math.max(0,Number(data.inserted)||0);var tab=document.getElementById('paper-judge-tabs').children[savedIndex];if(tab)tab.querySelector('small').textContent=entry.role+' · 저장 '+entry.savedCount+'건';}}
});
async function paperAttachManagementTools_(){
 if(isPaperEntryFrame_())return;
 document.querySelectorAll('[data-paper-code]').forEach(function(card){var code=card.dataset.paperCode,cfg=(_configs||[]).find(function(item){return item.code===code;});if(!cfg||(!isAdminRole()&&!isTeamLeaderForCode_(code)))return;var actions=card.querySelector('.admin-comp-actions');if(!actions)return;
  if(!card.querySelector('[data-act=paper-entry]')){var button=document.createElement('button');button.type='button';button.dataset.act='paper-entry';button.textContent='팀장 전용 수기 입력';button.onclick=function(){openPaperEntry_(cfg);};actions.appendChild(button);}
  if(!isAdminRole()&&!card.querySelector('[data-act=debrief-preview]')){var preview=document.createElement('button');preview.type='button';preview.dataset.act='debrief-preview';preview.textContent='선수 디브리핑 미리보기';preview.onclick=function(){openAdminDebriefPreviewFromConsole_(cfg);};actions.appendChild(preview);}
 });
 if(isAdminRole()&&!document.getElementById('teamlead-preview-policy')){var section=document.getElementById('admin-section-config');if(section){var card=document.createElement('div');card.id='teamlead-preview-policy';card.innerHTML='<label><input type="checkbox" id="teamlead-preview-toggle">팀장 디브리핑 미리보기 허용</label><p>담당 대회만 미리볼 수 있습니다. 선수 공개 여부는 변경되지 않습니다.</p><p id="teamlead-preview-policy-message" role="status"></p>';section.prepend(card);var toggle=card.querySelector('input');toggle.disabled=true;try{var policy=await paperRpc_('getTeamLeadPreviewPolicy',[{judgeToken:_judge.judgeToken}]);toggle.checked=policy.enabled;toggle.disabled=!policy.success;}catch(error){card.querySelector('[role=status]').textContent='권한 설정을 불러오지 못했습니다.';}toggle.onchange=async function(){var next=toggle.checked;toggle.disabled=true;try{var result=await paperRpc_('setTeamLeadPreviewPolicy',[{enabled:next},{judgeToken:_judge.judgeToken}]);if(!result.success)throw new Error(result.message);card.querySelector('[role=status]').textContent='저장했습니다.';}catch(error){toggle.checked=!next;card.querySelector('[role=status]').textContent=error.message;}finally{toggle.disabled=false;}};}}
}
if(isPaperEntryFrame_()){document.body.classList.add('paper-entry-frame');parent.postMessage({type:'kcl-paper-ready'},location.origin);}
else{var pending=false;var observer=new MutationObserver(function(){if(pending)return;pending=true;setTimeout(function(){pending=false;paperAttachManagementTools_();},0);});['admin-comp-list','team-comp-list'].forEach(function(id){var root=document.getElementById(id);if(root)observer.observe(root,{childList:true});});paperAttachManagementTools_();}
