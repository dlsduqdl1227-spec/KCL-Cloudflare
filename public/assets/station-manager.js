(function(){
  'use strict';
  function value(row,key){var input=row.querySelector('[data-field="'+key+'"]');return input?input.value:'';}
  function summary(row){
    var code=row.dataset.competitionCode;
    var first=value(row,'start'),last=value(row,'end'),prefix=code==='IKRC'?value(row,'prefix')+'-':'';
    var purpose=value(row,'purpose');
    if(!purpose){
      var cal=row.querySelector('[data-field=useForCalibration]'),official=row.querySelector('[data-field=useForCompetition]');
      purpose=cal&&cal.checked?(official&&official.checked?'both':'calibration'):'competition';
    }
    var parts=[prefix+first+' ~ '+prefix+last];
    var count=Number(last)-Number(first)+1;
    if(first&&last&&count>0)parts.push(count+'명');
    parts.push({both:'대회평가 · 켈리브레이션',calibration:'켈리브레이션',competition:'대회평가'}[purpose]||'용도 미선택');
    var panel=row.closest('[data-kcr-station-manager]');
    if(code==='KCR'&&(!panel||panel.dataset.kcrRound==='예선')&&value(row,'prelimDay'))parts.push(value(row,'prelimDay')+'일차');
    if(code==='KCR'&&value(row,'process'))parts.push(value(row,'process'));
    var text=row.querySelector('[data-station-summary]');if(text)text.textContent=parts.join(' · ');
  }
  window.refreshStationEditorSummaries_=function(container){
    if(container)container.querySelectorAll('[data-ikrc-station-row]').forEach(summary);
  };
  window.markStationEditorDirty_=function(list){
    if(!list)return;
    list.dataset.stationDirty='true';
    var status=list.parentElement.querySelector('[data-station-edit-status]');
    if(status)status.textContent='변경사항이 있습니다. 설정 저장을 눌러 반영하세요.';
  };
  function changed(event){
    var row=event.target.closest('[data-ikrc-station-row]');
    if(!row)return;summary(row);
    window.markStationEditorDirty_(row.parentElement);
  }
  document.addEventListener('input',changed);
  document.addEventListener('change',changed);
  // Move existing controls, not copies, so permissions and handlers stay intact.
  window.compactStationActions_=function(card,code){
    if(!['KCR','IKRC'].includes(code)||!card||card.querySelector('.station-tools'))return;
    var actions=card.querySelector('.admin-comp-actions');if(!actions)return;
    var tools=document.createElement('details');tools.className='station-tools';
    tools.innerHTML='<summary>운영 도구 · 백업 / QR / 선수 연결</summary><div class="admin-comp-actions"></div>';
    var secondary=tools.querySelector('div');
    ['ikrc-blind','ikrc-seed','ikrc-head-input','score-backup','judge-qr'].forEach(function(act){
      var button=actions.querySelector('[data-act="'+act+'"]');if(button)secondary.appendChild(button);
    });
    if(!secondary.querySelector('[data-act="ikrc-blind"]'))tools.querySelector('summary').textContent='운영 도구 · 백업 / QR';
    if(secondary.children.length)actions.insertAdjacentElement('afterend',tools);
    var workflow=document.createElement('div');workflow.className='station-workflow-actions';
    ['kcr-cal-station','ikrc-cal-input','kcr-cal-result','ikrc-cal','ikrc-cal-result','eval','review'].forEach(function(act){
      var button=actions.querySelector('[data-act="'+act+'"]');if(button)workflow.appendChild(button);
    });
    if(workflow.children.length)actions.prepend(workflow);
  };
  // One expanded editor per list keeps long mobile station lists manageable.
  document.addEventListener('toggle',function(event){
    var row=event.target;
    if(!row.matches||!row.matches('details.station-editor[open]'))return;
    row.parentElement.querySelectorAll('details.station-editor[open]').forEach(function(other){if(other!==row)other.open=false;});
  },true);
})();
