/* Roster views only: round assignments and evaluation records are never rewritten here. */
(function(){
 'use strict';
 var phase='prelim',finalRound='본선',day='main',codeSeen='',queryUsed=false;
 var table=document.getElementById('partTable');if(!table)return;
 var controls=document.createElement('section');controls.id='registry-roster-views';controls.setAttribute('aria-label','선수 명단 회차 선택');
 controls.innerHTML='<div class="registry-phase-tabs" role="tablist" aria-label="선수 명단 구분">'+[['prelim','예선'],['finals','본·결선'],['all','전체 선수']].map(function(item){return '<button type="button" role="tab" data-roster-phase="'+item[0]+'">'+item[1]+' <span></span></button>';}).join('')+'</div><div class="registry-round-tabs" role="tablist" aria-label="본선·결선 회차"><button type="button" role="tab" data-roster-round="본선">본선 <span></span></button><button type="button" role="tab" data-roster-round="결선">결선 <span></span></button></div><p id="registry-roster-view-note" class="hint"></p>';
 document.getElementById('kbc-roster-tools').before(controls);
 var panel=document.getElementById('tab-players');panel.setAttribute('aria-describedby','registry-roster-view-note');
 function has(value){return String(value==null?'':value).trim()!=='';}
 function separateMain(code){return ['MOC','KBC'].includes(code);}
 function code(){return selectedCompetitionCode_();}
 function assigned(row,round){if(round==='예선')return (row.extra||{}).kcrPrelimPending!==true&&has(participantPrimaryNumber_(row.competitionCode||code(),row));return has(round==='본선'?row.mainCupNo:row.finalCupNo);}
 function round(){return phase==='prelim'?'예선':phase==='all'?'':finalRound;}
 function schedule(row,r){return ((row.extra||{}).roundSchedules||{})[r]||{};}
 function number(row,r){return r==='본선'?row.mainCupNo:r==='결선'?row.finalCupNo:participantPrimaryNumber_(row.competitionCode||code(),row);}
 function syncKbc(){kbcRosterView_=phase==='prelim'?'prelim':phase==='all'?'all':finalRound==='결선'?'final':day;}
 function prepare(selected){
  if(codeSeen===selected)return;codeSeen=selected;phase='prelim';finalRound=separateMain(selected)?'본선':'결선';day='main';
  if(!queryUsed&&selected==='KBC'){queryUsed=true;if(new URLSearchParams(location.search).get('kbcView')==='final'){phase='finals';finalRound='결선';}}
  syncKbc();
 }
 function viewLabel(){return phase==='all'?'전체 선수':phase==='prelim'?'예선':finalRound==='본선'&&code()==='KBC'&&day!=='main'?'본선 '+day+'일차':finalRound;}
 function clearSelection(){document.dispatchEvent(new CustomEvent('registry:roster-view-changed'));}
 function choose(nextPhase,nextRound,nextDay){
  if(kbcFinalSaving_){alert('결선 배정 저장 중입니다. 저장이 끝난 뒤 명단을 바꿔주세요.');return;}
  prepare(code());phase=nextPhase;if(nextRound)finalRound=nextRound;if(nextDay)day=nextDay;syncKbc();kbcRosterPlanRequest_++;clearSelection();renderParticipantList_(code(),{});
  if(code()==='KBC'&&phase==='finals'&&finalRound==='결선')loadKbcFinalRoster_();
 }
 controls.addEventListener('click',function(event){var p=event.target.closest('[data-roster-phase]'),r=event.target.closest('[data-roster-round]');if(p)choose(p.dataset.rosterPhase);else if(r)choose('finals',r.dataset.rosterRound);});
 controls.addEventListener('keydown',function(event){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||event.target.getAttribute('role')!=='tab')return;var buttons=Array.from(event.target.parentElement.querySelectorAll('[role=tab]')),i=buttons.indexOf(event.target);event.preventDefault();i=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length;buttons[i].click();buttons[i].focus();});
 window.registryRosterRound_=round;
 window.registryRosterPrepare_=prepare;
 window.registryRosterFilter_=function(selected,rows){prepare(selected);var r=round();return (rows||[]).filter(function(row){if(!r)return true;if(!assigned(row,r))return false;return !(selected==='KBC'&&r==='본선'&&day!=='main')||String(schedule(row,r).day||'').replace(/일차$/,'')===day;});};
 window.registryRosterRows_=function(selected,rows){
  var list=registryRosterFilter_(selected,rows),r=round();if(!r||r==='예선')return list;
  return list.slice().sort(function(a,b){var x=schedule(a,r),y=schedule(b,r),cmp=0;
   if(participantSortMode==='name')cmp=participantNaturalCompare_(a.name||a.teamName,b.name||b.teamName);
   else if(participantSortMode==='registered')cmp=Number(a.rowIndex)-Number(b.rowIndex);
   else if(participantSortMode==='schedule')cmp=participantNaturalCompare_(x.date,y.date)||participantNaturalCompare_(x.day,y.day)||participantNaturalCompare_(x.order||number(a,r),y.order||number(b,r));
   else{cmp=participantNaturalCompare_(number(a,r),number(b,r));if(participantSortMode==='number-desc')cmp=-cmp;}
   return cmp||participantNaturalCompare_(number(a,r),number(b,r))||Number(a.rowIndex)-Number(b.rowIndex);
  }).map(function(row,index){return Object.assign({},row,{kbcDisplayOrder:index+1});});
 };
 window.registryRosterNumber_=function(row){var r=round();if(r)return number(row,r);return ['예선','본선','결선'].filter(function(item){return assigned(row,item);}).map(function(item){return item+' '+number(row,item);}).join(' · ')||'미배정';};
 window.registryRosterSchedule_=function(row){
  var r=round();if(r==='예선')return participantPrelimDate_(row)||'일정 미정';
  if(code()==='KBC')return kbcParticipantRoundText_(row)||'일정 미정';
  function label(item){var s=schedule(row,item);return [item,s.date||'일정 미정',s.station?'스테이션 '+s.station:'',s.preparationTime?'준비 '+s.preparationTime:'',s.performanceTime?'시연 '+s.performanceTime:''].filter(Boolean).join(' · ');}
  return r?label(r):['예선','본선','결선'].filter(function(item){return assigned(row,item);}).map(function(item){return item==='예선'?'예선 · '+(participantPrelimDate_(row)||'일정 미정'):label(item);}).join(' / ')||'미배정';
 };
 window.registryRosterRender_=function(selected,rows){
  prepare(selected);var all=participantRows||[],r=round(),totals={prelim:all.filter(function(row){return assigned(row,'예선');}).length,finals:all.filter(function(row){return assigned(row,'본선')||assigned(row,'결선');}).length,all:all.length};
  controls.querySelectorAll('[data-roster-phase]').forEach(function(button){var active=button.dataset.rosterPhase===phase;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;button.querySelector('span').textContent=totals[button.dataset.rosterPhase];});
  var sub=controls.querySelector('.registry-round-tabs');sub.hidden=phase!=='finals'||!separateMain(selected);
  sub.querySelectorAll('button').forEach(function(button){var active=button.dataset.rosterRound===finalRound;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;button.querySelector('span').textContent=all.filter(function(row){return assigned(row,button.dataset.rosterRound);}).length;});
  document.getElementById('registry-roster-view-note').textContent=phase==='all'?'배정 여부와 관계없이 모든 선수를 표시합니다.':viewLabel()+'에 배정된 선수만 표시합니다.';
  var kbc=document.getElementById('kbc-roster-tools');kbc.classList.toggle('hidden',selected!=='KBC'||phase!=='finals');kbc.querySelector('[role=tablist]').hidden=r!=='본선';kbc.querySelector('details').hidden=r!=='본선';
  document.getElementById('kbc-roster-final').hidden=true;
  [['1','day1'],['2','day2'],['main','all']].forEach(function(pair){var b=document.getElementById('kbc-roster-'+pair[1]);b.setAttribute('aria-selected',String(day===pair[0]));});
  var quick=document.getElementById('participant-bulk-prelim-tools');quick.classList.toggle('hidden',r!=='예선');if(quick.parentElement.classList.contains('registry-quick-tools'))quick.parentElement.hidden=r!=='예선'||selected==='KCR';
  var count=document.getElementById('partCount');count.textContent=phase==='all'?selected+' · 전체 선수 '+all.length+'명':selected+' · '+viewLabel()+' '+rows.length+'명 · 전체 '+all.length+'명';
  document.getElementById('participantSortMode').querySelector('[value=schedule]').textContent='일정 순';
  if(!rows.length){var tr=table.insertRow(),td=tr.insertCell();tr.className='registry-roster-empty';td.colSpan=7;td.textContent=phase==='all'?'등록된 선수·팀이 없습니다.':'이 구분에 배정된 선수·팀이 없습니다. 전체 선수 탭에서 명단을 확인하세요.';}
 };
 var originalManual=window.updateManualParticipantFields;
 window.updateManualParticipantFields=function(){var result=originalManual.apply(this,arguments);prepare(code());if(table.dataset.competition===code())registryRosterRenderControlsOnly_();return result;};
 function registryRosterRenderControlsOnly_(){var kbc=document.getElementById('kbc-roster-tools');kbc.classList.toggle('hidden',code()!=='KBC'||phase!=='finals');}
 window.setKbcRosterView_=function(view){choose(view==='all'?'all':view==='prelim'?'prelim':'finals',view==='final'?'결선':'본선',['1','2'].includes(view)?view:'main');};
 window.registryRosterViewLabel_=viewLabel;
})();
