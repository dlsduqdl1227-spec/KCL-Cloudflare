(function(){
  'use strict';
  window.parseKcrStationCupNumbers_=function(text){
    var values=String(text||'').trim().split(/[\s,，]+/).filter(Boolean);
    if(!values.length||values.length>20||values.some(function(n){return !/^\d+$/.test(n)||Number(n)<1||Number(n)>999;}))
      return {ok:false,message:'1~999 사이 컵번호를 1~20개 입력해주세요.'};
    var numbers=values.map(function(n){return String(Number(n));});
    if(new Set(numbers).size!==numbers.length)return {ok:false,message:'중복된 컵번호를 제거해주세요.'};
    return {ok:true,numbers:numbers};
  };
  function config(){return (_configs||[]).filter(function(c){return c.code==='KCR';})[0];}
  document.addEventListener('change',function(event){
    if(!event.target.matches('[data-kcr-edit-round]'))return;
    var panel=event.target.closest('[data-kcr-station-manager]'),cfg=config();
    if(cfg)ikrcRenderStationConfigForRound_(panel.dataset.kcrPrefix,cfg,event.target.value,true);
  });
  document.addEventListener('click',function(event){
    var button=event.target.closest('[data-kcr-save-stations]');if(!button)return;
    var panel=button.closest('[data-kcr-station-manager]'),cfg=config(),round=panel.dataset.kcrRound;
    if(!cfg||panel.dataset.saving==='true')return;
    var parsed=configSelectableOptionsPayload_('KCR',panel.dataset.kcrPrefix,cfg);if(!parsed)return;
    var stations=parsed.kcrStations.byRound[round],list=panel.querySelector('.ikrc-station-config-list');
    var previous=JSON.parse(panel.dataset.loadedStations||'[]'),owner=_judge.judgeToken;
    var revision=list.dataset.editRevision||'0',status=panel.querySelector('[data-station-edit-status]');
    panel.dataset.saving='true';button.disabled=true;status.textContent='스테이션 저장 중…';
    function finish(message,failed){
      panel.dataset.saving='false';button.disabled=false;
      if(panel.isConnected&&_judge&&_judge.judgeToken===owner){status.textContent=message;toast(message,!!failed);}
    }
    google.script.run.withSuccessHandler(function(res){
      if(!res||!res.success){finish(res&&res.message||'저장하지 못했습니다. 입력 내용은 유지됩니다.',true);return;}
      if(!_judge||_judge.judgeToken!==owner)return finish('저장 완료');
      // Update configuration references, never an active evaluation or its draft.
      [(_configs||[]),(_adminConsole&&_adminConsole.configs||[])].forEach(function(configs){
        configs.forEach(function(c){if(c.code==='KCR')c.optionSettings=res.optionSettings;});
      });
      if(panel.isConnected&&panel.dataset.kcrRound===round){
        var saved=kcrStationSettings_({code:'KCR',currentRound:round,optionSettings:res.optionSettings});
        panel.dataset.loadedStations=JSON.stringify(saved);
        if((list.dataset.editRevision||'0')===revision)list.dataset.stationDirty='false';
        if(typeof resetStationCupIdentity_==='function')resetStationCupIdentity_(panel.dataset.kcrPrefix,'KCR',round);
      }
      finish(res.message+((list.dataset.editRevision||'0')!==revision?' · 저장 중 바꾼 내용은 다시 저장해주세요.':''));
    }).withFailureHandler(function(){finish('연결을 확인한 뒤 다시 저장해주세요. 입력 내용은 유지됩니다.',true);})
      .saveKcrStationSettings({round:round,stations:stations,previousStations:previous},adminActorPayload_());
  });
  window.stationCupIdentityHtml_=function(code,prefix,round){
    if(!isAdminRole())return '';
    return '<details class="station-cup-identities" data-cup-code="'+code+'" data-cup-prefix="'+prefix+'" data-cup-round="'+escHtml(round)+'"><summary>컵번호 · 선수 확인</summary>'+
      '<p class="station-config-help">저장된 스테이션 기준입니다. 미연결·중복 항목을 확인해 주세요.</p>'+
      '<button type="button" class="btn-outline" data-cup-load>선수 연결 불러오기</button><div data-cup-result role="status"></div></details>';
  };
  window.resetStationCupIdentity_=function(prefix,code,round){
    document.querySelectorAll('[data-cup-code]').forEach(function(box){
      if(box.dataset.cupCode!==code||box.dataset.cupPrefix!==prefix)return;
      box.dataset.cupRound=round;box._request=(box._request||0)+1;box._data=null;
      box.querySelector('[data-cup-result]').textContent='';box.querySelector('[data-cup-load]').disabled=false;
    });
  };
  function renderCupStation(box){
    var select=box.querySelector('[data-cup-station]'),station=box._data.stations.find(function(s){return s.id===select.value;});
    var rows=box.querySelector('[data-cup-rows]');
    if(!station){rows.textContent='대회평가용 스테이션이 없습니다.';return;}
    rows.innerHTML=station.cups.map(function(cup){
      var label=cup.status==='duplicate'?'중복 연결 · 확인 필요':cup.status==='unassigned'?'선수 미연결':'';
      return '<div class="station-cup-person"><b>'+escHtml(cup.unit)+'번 컵</b><div>'+cup.participants.map(function(p){return '<strong>'+escHtml(p.name)+'</strong><span>'+escHtml(p.affiliation)+'</span>';}).join('')+
        (label?'<span class="station-cup-warning">'+label+'</span>':'')+'</div></div>';
    }).join('');
  }
  document.addEventListener('change',function(event){if(event.target.matches('[data-cup-station]'))renderCupStation(event.target.closest('[data-cup-code]'));});
  document.addEventListener('click',function(event){
    var button=event.target.closest('[data-cup-load]');if(!button)return;
    var box=button.closest('[data-cup-code]'),result=box.querySelector('[data-cup-result]');
    var token=box._request=(box._request||0)+1;
    button.disabled=true;result.textContent='선수 연결을 불러오는 중입니다.';
    function failed(message){if(token!==box._request||!box.isConnected)return;button.disabled=false;result.textContent=message||'불러오지 못했습니다. 다시 시도해주세요.';}
    google.script.run.withSuccessHandler(function(data){
      if(token!==box._request||!box.isConnected)return;
      if(!data||!data.success){failed(data&&data.message);return;}
      button.disabled=false;button.textContent='새로고침';box._data=data;
      result.innerHTML='<label class="station-cup-select">'+escHtml(data.currentRound)+' · 스테이션<select data-cup-station>'+data.stations.map(function(s){return '<option value="'+escHtml(s.id)+'">'+escHtml(s.label)+(s.prelimDay?' · '+escHtml(s.prelimDay)+'일차':'')+'</option>';}).join('')+'</select></label><div data-cup-rows></div>';
      renderCupStation(box);
    }).withFailureHandler(function(){failed('연결을 불러오지 못했습니다. 다시 시도해주세요.');}).getStationCupParticipants(box.dataset.cupCode,box.dataset.cupRound,adminActorPayload_());
  });
  function value(row,key){var input=row.querySelector('[data-field="'+key+'"]');return input?input.value:'';}
  function summary(row){
    var code=row.dataset.competitionCode;
    var first=value(row,'start'),last=value(row,'end'),prefix=code==='IKRC'?value(row,'prefix')+'-':'';
    var purpose=value(row,'purpose');
    if(!purpose){
      var cal=row.querySelector('[data-field=useForCalibration]'),official=row.querySelector('[data-field=useForCompetition]');
      purpose=cal&&cal.checked?(official&&official.checked?'both':'calibration'):'competition';
    }
    var individual=code==='KCR'&&value(row,'cupSelection')==='individual';
    row.querySelectorAll('.kcr-station-range-field').forEach(function(el){el.hidden=individual;});
    var field=row.querySelector('.kcr-cup-numbers');if(field)field.hidden=!individual;
    var selected=individual?parseKcrStationCupNumbers_(value(row,'cupNumbers')):null;
    var parts=[individual?(selected.ok?selected.numbers.join(', '):'컵번호 입력 필요'):prefix+first+' ~ '+prefix+last];
    var count=Number(last)-Number(first)+1;
    if(individual)count=selected.ok?selected.numbers.length:0;
    if(count>0)parts.push(count+'명');
    var status=row.querySelector('[data-cup-selection-status]');
    if(status)status.textContent=individual?(selected.ok?count+'컵 선택됨':selected.message):'';
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
    list.dataset.editRevision=String(Number(list.dataset.editRevision||0)+1);
    var status=list.parentElement.querySelector('[data-station-edit-status]');
    if(status)status.textContent='변경사항이 있습니다. 설정 저장을 눌러 반영하세요.';
  };
  function changed(event){
    var row=event.target.closest('[data-ikrc-station-row]');
    if(!row)return;
    if(event.target.matches('[data-field="cupSelection"]')&&event.target.value==='individual'){
      var input=row.querySelector('[data-field="cupNumbers"]');
      if(!input.value.trim()){
        var first=Number(value(row,'start')),last=Number(value(row,'end'));
        if(first>0&&last>=first&&last-first<20)input.value=Array.from({length:last-first+1},function(_,i){return first+i;}).join(', ');
      }
    }
    summary(row);
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
