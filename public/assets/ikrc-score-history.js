// Historical IKRC evaluations remain intact; one selected record supplies each judge/cup vote.
function appendIkrcHistoryButton_(row, item) {
  if (_reviewState.code !== 'IKRC' || !reviewManageScopeForCode_('IKRC')) return;
  var items = finalCorrectionItems_(item).filter(function(x){ return Number(x.ikrcHistoryCount || 0) > 1 || x.ikrcSelectionMissing; });
  if (!items.length) return;
  var actions = row.querySelector('.review-actions');
  if (!actions) return;
  var button = document.createElement('button');
  button.type = 'button'; button.className = 'review-edit-btn'; button.textContent = '과거 평가 비교·선택';
  button.onclick = function(){ openIkrcScoreHistory_(items); };
  actions.appendChild(button);
  var note = document.createElement('p');
  note.className = 'review-info-sub';
  note.textContent = items.some(function(x){ return x.ikrcSelectionMissing; }) ? '반영할 평가를 다시 선택해주세요.' : '같은 심사위원·같은 샘플은 선택된 평가 1건만 반영합니다.';
  row.firstElementChild.appendChild(note);
}
function openIkrcScoreHistory_(items) {
  if (_reviewState.code !== 'IKRC' || !reviewManageScopeForCode_('IKRC') || activePanelId_() !== 'pReview') return;
  var previous = document.getElementById('ikrc-score-history-dialog');
  if (previous) { if (previous.open) previous.close(); previous.remove(); }
  var dialog = document.createElement('dialog'); dialog.id = 'ikrc-score-history-dialog';
  dialog.style.cssText = 'width:min(760px,calc(100% - 24px));max-height:85dvh;overflow:auto;padding:20px;border:1px solid var(--border-lt,#555);border-radius:12px;background:var(--bg,#151515);color:var(--text,#fff)';
  var title = document.createElement('h3'); title.textContent = 'IKRC 과거 평가 비교·선택'; dialog.appendChild(title);
  var help = document.createElement('p'); help.className = 'review-edit-help';
  help.textContent = '같은 라운드·같은 샘플·같은 심사위원의 평가 중 1건만 선택합니다. 다른 기록은 보존되며 중복 합산하지 않습니다. 반려된 기록은 수정·재제출 전까지 순위에서 제외됩니다.';
  dialog.appendChild(help);
  var sample = document.createElement('select'); sample.setAttribute('aria-label','과거 평가를 비교할 샘플');
  items.forEach(function(item,index){var option=document.createElement('option');option.value=String(index);option.textContent=(item.unit || item['샘플번호'] || '-')+' · '+(item.judgeName || item['심사위원명'] || '')+' · 기록 '+Number(item.ikrcHistoryCount || 1)+'건';sample.appendChild(option);});
  dialog.appendChild(sample);
  var status = document.createElement('p'); status.setAttribute('role','status'); dialog.appendChild(status);
  var list = document.createElement('div'); dialog.appendChild(list);
  var actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;margin-top:16px;flex-wrap:wrap';
  var save = document.createElement('button'); save.type='button';save.className='btn';save.textContent='이 평가 1건만 선택';save.disabled=true;actions.appendChild(save);
  var refresh = document.createElement('button');refresh.type='button';refresh.className='btn-outline';refresh.textContent='기록 다시 조회';actions.appendChild(refresh);
  var close = document.createElement('button');close.type='button';close.className='btn-outline';close.textContent='닫기';close.onclick=function(){dialog.close();};actions.appendChild(close);
  dialog.appendChild(actions);document.body.appendChild(dialog);
  dialog.addEventListener('close',function(){sequence++;dialog.remove();});dialog.showModal();
  var sequence=0,loaded=null,choice='',saving=false,token=_judge.judgeToken,round=_reviewState.finalRound;
  function current(request){return dialog.isConnected && request===sequence && token===_judge.judgeToken && _reviewState.code==='IKRC' && activePanelId_()==='pReview';}
  function showEntries(result,keepChoice){
    loaded=result;list.textContent='';choice='';
    result.entries.forEach(function(entry,index){
      var label=document.createElement('label');label.style.cssText='display:block;border:1px solid var(--border-lt,#555);border-radius:8px;padding:12px;margin-top:10px;cursor:pointer';
      var radio=document.createElement('input');radio.type='radio';radio.name='ikrc-history-choice';radio.value=String(entry.rowIndex);radio.disabled=!entry.canSelect;
      radio.checked=!!entry.canSelect && (keepChoice ? keepChoice===String(entry.rowIndex) : !!entry.isSelected);
      if(radio.checked)choice=radio.value;
      radio.onchange=function(){choice=radio.value;save.disabled=false;};label.appendChild(radio);
      var text=document.createElement('strong');var at=new Date(entry.submittedAt);
      text.textContent=' 평가 '+(index+1)+' · '+(isNaN(at.getTime())?entry.submittedAt:at.toLocaleString('ko-KR'))+' · '+entry.totalScore+'점'+(entry.isSelected?' · 현재 선택':'')+' · '+entry.status+(entry.canSelect?'':' · 비교용/순위 제외');label.appendChild(text);
      var detail=document.createElement('p');var scores=entry.scores||{};detail.textContent='Flavor '+scores.flavor+' · Clean Cup '+scores.cleanCup+' · Sweetness '+scores.sweetness+' · Acidity '+scores.acidity+' · Mouthfeel '+scores.mouthfeel;label.appendChild(detail);
      if(entry.comment){var comment=document.createElement('p');comment.style.whiteSpace='pre-wrap';comment.textContent=entry.comment;label.appendChild(comment);}
      list.appendChild(label);
    });
    save.disabled=!choice;status.textContent=result.unit+' · '+result.judgeName+' · 총 '+result.entries.length+'건 · 선택된 평가만 1회 반영';
  }
  function load(keepChoice){
    if(saving)return;var request=++sequence,item=items[Number(sample.value)||0];save.disabled=true;status.textContent='저장된 평가를 확인하는 중...';
    google.script.run.withSuccessHandler(function(result){if(!current(request))return;if(!result||!result.success){status.textContent=result&&result.message||'기록 조회에 실패했습니다. 다시 조회해주세요.';return;}showEntries(result,keepChoice);})
      .withFailureHandler(function(){if(current(request))status.textContent='기록을 불러오지 못했습니다. 평가 원본은 그대로입니다. 다시 조회해주세요.';})
      .getIkrcScoreHistory({round:round,rowIndex:item.rowIndex},reviewActorPayload_('IKRC'));
  }
  sample.onchange=function(){load('');};refresh.onclick=function(){load(choice);};
  save.onclick=function(){
    if(saving||!loaded||!choice)return;var request=sequence,item=items[Number(sample.value)||0];saving=true;save.disabled=true;sample.disabled=true;refresh.disabled=true;status.textContent='반영할 평가 1건을 선택하는 중...';
    google.script.run.withSuccessHandler(function(result){
      if(!current(request))return;saving=false;sample.disabled=false;refresh.disabled=false;
      if(!result||!result.success){status.textContent=result&&result.message||'선택하지 못했습니다. 기록을 다시 조회해주세요.';save.disabled=true;return;}
      dialog.close();toast(result.message);goReviewByCode('IKRC',_reviewState.name,_reviewState.backPanel);
    }).withFailureHandler(function(){if(!current(request))return;saving=false;sample.disabled=false;refresh.disabled=false;status.textContent='선택 결과를 확인하지 못했습니다. 기록을 다시 조회해 현재 선택을 확인해주세요.';save.disabled=true;})
      .selectIkrcOfficialScore({round:round,rowIndex:item.rowIndex,selectedRowIndex:choice,historyRevision:loaded.historyRevision},reviewActorPayload_('IKRC'));
  };
  load('');
}
