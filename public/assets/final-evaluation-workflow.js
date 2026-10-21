// Finals: submit -> ranking. KCR supports own corrections; other competitions require return.
function finalRoundForCode_(code) {
  var cfg=_selComp && _selComp.code===code?_selComp:(_configs||[]).find(function(c){return c.code===code;});
  return cfg && ['본선','결선'].includes(cfg.currentRound)?cfg.currentRound:'';
}
function participantCompletionForActiveArea_(code,item){
  if(code!=='KCAC'||!finalRoundForCode_(code)||!item||!Array.isArray(item.completedEvaluationScopes)||!_kcac.jars.length)return item;
  var area=_kcac.jars.some(function(j){return j.type==='final-pattern';})?'pattern':_kcac.finalArea||'sensory';
  var complete=item.completedEvaluationScopes.some(function(scope){var parts=String(scope).split('+');return parts.indexOf(area)>=0 || (/^sensory/.test(area)&&parts.indexOf('sensory')>=0);});
  return Object.assign({},item,{evaluationCompleted:complete,display:complete?item.display:String(item.display||'').replace(/\s*·\s*✓?\s*평가완료/g,'')});
}
function finalDraftKey_(item) {
  return ['kcl.finalCorrection',_judge.name||_judge.judgeName||'',_reviewState.code,item.rowIndex,item.finalRevision].join(':');
}
var _finalCorrectionDrafts={};
var _finalCorrectionSaving=false;
function canCorrectFinalItem_(item){return !!(item&&item.finalWorkflow&&!item.stationClosed&&(_reviewState.code==='KCR'||item.status==='반려'));}
function finalCorrectionSaveLabel_(){return _reviewState.code==='KCR'?'수정완료':'수정 후 재제출';}
function finalCorrectionItems_(item){var items=reviewGroupItems_(item);return items.length?items:[item];}
function readFinalDraft_(item){
  var key=finalDraftKey_(item);
  if(_finalCorrectionDrafts[key])return _finalCorrectionDrafts[key];
  try{return JSON.parse(localStorage.getItem(key)||'{}');}catch(e){return {};}
}
function saveFinalCorrectionDraft_(){
  var item=_reviewState.current;
  if(!canCorrectFinalItem_(item)||_finalCorrectionSaving)return false;
  syncReviewControlsFromDom_();if(!normalizeReviewNumbers())return false;
  var updates=collectReviewUpdates(),key=finalDraftKey_(item);
  _finalCorrectionDrafts[key]=updates;
  applyReviewSavedState_(item,_reviewState.headers,updates,null);
  _reviewDraftDirty=true;
  try{localStorage.setItem(key,JSON.stringify(updates));setReviewAutoSaveState('이 기기에 임시저장됨 · '+finalCorrectionSaveLabel_()+'를 눌러 저장하세요.','review-autosaved');}
  catch(e){setReviewAutoSaveState('화면에 변경 내용을 유지했습니다. 기기 저장 공간을 확인하고 '+finalCorrectionSaveLabel_()+'를 눌러주세요.','review-autosave-error');}
  return true;
}
function renderFinalEvaluationList_(list,code){
  var manager=reviewManageScopeForCode_(code),round=_reviewState.finalRound;
  var scoped=list.filter(function(item){return item.finalWorkflow&&item.round===round;});
  var returned=scoped.filter(function(item){return item.status==='반려';});
  var showSubmitted=manager||code==='KCR',visible=showSubmitted?scoped:returned;
  document.getElementById('review-title').textContent=(_reviewState.name||code)+' · '+(manager?'평가 관리':code==='KCR'?'내평가검수':'반려된 평가 수정');
  document.getElementById('review-stat').textContent=competitionRoundLabel_(code,round)+' · '+(showSubmitted?'평가완료 '+(scoped.length-returned.length)+'건 · ':'')+'반려 '+returned.length+'건';
  document.getElementById('review-total-label').textContent=showSubmitted?'제출':'반려';
  document.getElementById('review-count-val').textContent=(showSubmitted?scoped.length:returned.length)+'건';
  document.getElementById('review-nav-summary').textContent='제출 즉시 순위 반영';
  var wrap=document.getElementById('review-list');wrap.innerHTML='';
  if(!visible.length){wrap.innerHTML='<p style="padding:24px;text-align:center;color:var(--muted)">'+(showSubmitted?'이 회차에 제출된 평가가 없습니다.':'반려된 평가가 없습니다.')+'</p>';return;}
  if(code==='KCR'){
    renderKcrOfficialReviewOverview_(visible,code,_reviewState.headers,0,renderFinalEvaluationRows_);
    return;
  }
  renderFinalEvaluationRows_(visible,code,wrap);
}
function renderFinalEvaluationRows_(visible,code,wrap){
  var manager=reviewManageScopeForCode_(code);
  wrap.innerHTML='';
  buildGroupedReviewItems_(visible,code).forEach(function(item){
    var group=finalCorrectionItems_(item),pending=group.filter(function(x){return x.status==='반려';});
    var row=document.createElement('div');row.className='review-item review-actual';
    var title=code==='KCR'?'컵 '+(item.unit||item['컵번호']||'')+'번':reviewGroupTitle_(item,code),judge=item['심사위원명']||item.judgeName||'';
    var reason=Array.from(new Set(pending.map(function(x){return x.returnReason;}).filter(Boolean))).join(' / ');
    row.innerHTML='<div style="min-width:0;flex:1">'+reviewCategoryBadgeHtml_(item,code)+'<div class="review-info-name">'+escHtml(title)+'</div><div class="review-info-sub">'+escHtml(judge)+' · '+escHtml(String(item['총점'] ?? item.totalScore ?? '-'))+'점</div>'+(reason?'<p class="final-return-reason" style="color:#ffbf80;white-space:pre-wrap;overflow-wrap:anywhere">반려 사유: '+escHtml(reason)+'</p>':'')+'</div><div class="review-actions"><button type="button" class="review-edit-btn">'+(code==='KCR'?'검수/수정':pending.length?'반려 내용 수정':'내용 확인')+'</button>'+(manager&&group.some(function(x){return x.status!=='반려';})?'<button type="button" class="review-status-btn final-return-btn">반려</button>':'')+'</div>';
    row.querySelector('.review-edit-btn').onclick=function(){
      var items=code==='KCR'?group:pending.length?pending:group,target=Object.assign({},items[0],{_reviewGroupItems:items});
      openFinalCorrection_(target);
    };
    var button=row.querySelector('.final-return-btn');if(button)button.onclick=function(){returnFinalEvaluationUi_(group.filter(function(x){return x.status!=='반려';}),button);};
    wrap.appendChild(row);
  });
}
function returnFinalEvaluationUi_(items,button){
  var reason=prompt('수정해야 할 내용을 적어주세요.\n반려된 평가는 재제출 전까지 순위에서 제외됩니다.');
  if(!reason||!reason.trim())return;
  button.disabled=true;
  var code=_reviewState.code,round=_reviewState.finalRound,name=_reviewState.name,back=_reviewState.backPanel,token=_judge.judgeToken;
  google.script.run.withSuccessHandler(function(res){
    button.disabled=false;if(!res||!res.success){toast(res&&res.message||'반려 실패',true);return;}
    toast(res.message);
    if(_judge.judgeToken===token&&_reviewState.code===code&&_reviewState.finalRound===round&&activePanelId_()==='pReview')goReviewByCode(code,name,back);
  }).withFailureHandler(function(){button.disabled=false;toast('처리 결과를 확인하지 못했습니다. 새로고침 후 확인해주세요.',true);})
    .returnFinalEvaluations({competitionCode:code,round:round,reason:reason.trim(),entries:items.map(function(x){return {rowIndex:x.rowIndex,revision:x.finalRevision};})},reviewActorPayload_(code));
}
function openFinalCorrection_(item){
  clearTimeout(_reviewAutoSaveTimer);_reviewAutoSaveTimer=null;_reviewDraftDirty=false;
  finalCorrectionItems_(item).forEach(function(x){if(canCorrectFinalItem_(x))applyReviewSavedState_(x,_reviewState.headers,readFinalDraft_(x),null);});
  if(canCorrectFinalItem_(item))applyReviewSavedState_(item,_reviewState.headers,readFinalDraft_(item),null);
  openReviewEdit(item);
}
function configureFinalCorrectionEditor_(item){
  var editable=canCorrectFinalItem_(item),kcr=_reviewState.code==='KCR';
  document.getElementById('review-edit-title').textContent=(_reviewState.name||_reviewState.code)+' · '+(editable?(kcr?'평가 검수/수정':'반려 내용 수정'):'제출된 평가');
  document.getElementById('review-edit-sub').textContent=reviewGroupTitle_(item,_reviewState.code)+' · '+competitionRoundLabel_(_reviewState.code,item.round)+' · '+item.status;
  if(_reviewState.code==='KCAC'&&['본선','결선'].includes(item.round))document.getElementById('review-edit-sub').textContent+=' · 창작 주제: '+(item['창작주제']||'동물');
  document.getElementById('review-edit-status-chip').textContent=item.status;
  document.getElementById('review-edit-help').textContent=editable?(kcr?'제출한 평가를 수정한 뒤 수정완료를 누르면 저장되고 순위에 반영됩니다.':'종이 평가표와 대조해 반려된 내용을 수정한 뒤 재제출해주세요.'):'제출된 종이 평가표 입력 내용입니다. 점수와 코멘트는 읽기 전용입니다.';
  document.getElementById('review-edit-help').style.display='block';
  ['review-edit-save-complete','review-edit-delete','review-edit-enable'].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display='none';});
  var save=document.getElementById('review-edit-save-only');if(save){save.style.display=editable?'block':'none';save.textContent=finalCorrectionSaveLabel_();}
  var sticky=document.getElementById('review-edit-sticky-actions');
  if(sticky){sticky.style.display=editable?'grid':'none';sticky.style.gridTemplateColumns='1fr';sticky.querySelectorAll('button').forEach(function(button){if(button.classList.contains('complete-primary'))button.style.display='none';else button.textContent=finalCorrectionSaveLabel_();});}
  if(!editable)document.querySelectorAll('#review-edit-fields input,#review-edit-fields textarea,#review-edit-fields select,#review-edit-fields button:not(.review-eval-like-tab)').forEach(function(el){el.disabled=true;});
  var previous=document.getElementById('final-return-editor-note');if(previous)previous.remove();
  if(item.returnReason){var note=document.createElement('p');note.id='final-return-editor-note';note.textContent='반려 사유: '+item.returnReason;note.style.cssText='padding:12px;color:#ffbf80;white-space:pre-wrap;overflow-wrap:anywhere';document.getElementById('review-edit-fields').prepend(note);}
  setReviewAutoSaveState(editable?'수정 내용은 이 기기에 임시저장되며 '+finalCorrectionSaveLabel_()+' 시 즉시 순위에 반영됩니다.':'평가완료 · 순위 반영 중 · 수정이 필요하면 팀장·관리자에게 반려를 요청해주세요.','review-autosaved');
}
function submitFinalCorrection_(){
  var item=_reviewState.current;if(!canCorrectFinalItem_(item)||_finalCorrectionSaving)return;
  if(!saveFinalCorrectionDraft_())return;
  var items=finalCorrectionItems_(item).filter(canCorrectFinalItem_);
  if(!confirm((_reviewState.code==='KCR'?'수정한 평가를 저장할까요?':'수정한 평가를 재제출할까요?')+'\n저장 즉시 순위에 반영됩니다.'))return;
  _finalCorrectionSaving=true;showOverlay();
  var code=_reviewState.code,round=item.round,name=_reviewState.name,back=_reviewState.backPanel,token=_judge.judgeToken;
  var draftKeys=items.map(finalDraftKey_);
  var entries=items.map(function(x){return {rowIndex:x.rowIndex,revision:x.finalRevision,updates:readFinalDraft_(x)};});
  google.script.run.withSuccessHandler(function(res){
    _finalCorrectionSaving=false;hideOverlay();
    if(!res||!res.success){toast(res&&res.message||'저장 실패 · 입력 내용은 유지됩니다.',true);return;}
    draftKeys.forEach(function(key){delete _finalCorrectionDrafts[key];try{localStorage.removeItem(key);}catch(e){}});
    toast(res.message);
    if(_judge.judgeToken===token&&_reviewState.code===code&&_reviewState.finalRound===round&&['pReview','pReviewEdit'].includes(activePanelId_())){_reviewDraftDirty=false;goReviewByCode(code,name,back);}
  }).withFailureHandler(function(){_finalCorrectionSaving=false;hideOverlay();toast('저장 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다. 목록에서 처리 결과를 확인해주세요.',true);})
    .resubmitFinalEvaluations({competitionCode:code,round:round,entries:entries},reviewActorPayload_(code));
}
