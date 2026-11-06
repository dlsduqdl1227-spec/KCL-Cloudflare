/* Physical event schedules only; roasting blind codes and judging stations are never changed. */
(function(){
 'use strict';
 var seedFields=[['date','일정','date'],['order','진행 순서','number'],['group','세션','number'],['station','경연 위치'],['waitingTime','선수 대기'],['preparationTime','준비시간'],['performanceTime','시연시간'],['cleanupTime','정리·블라인드 세팅'],['judgingTime','블라인드 심사·인터뷰'],['rehearsalTime','리허설']];
 var roastFields=[['group','로스팅 세션','number'],['station','로스팅 경연 위치'],['waitingTime','로스팅 선수 대기'],['cleanupTime','로스팅 정리']];
 function get(row){var s=(((row||{}).extra||{}).roundSchedules||{}).결선||{};return {roastingSchedule:s,seedSchedule:s.seedToCup||{}};}
 function element(tag,text,cls){var e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;}
 function summary(schedule,kind){var s=schedule||{};return [kind,s.date,s.group?s.group+'세션':'',s.station?'위치 '+s.station:'',s.preparationTime?'준비 '+s.preparationTime:'',s.performanceTime?'시연 '+s.performanceTime:''].filter(Boolean).join(' · ');}
 function id(kind,key){return 'ikrc-schedule-'+kind+'-'+key;}
 function ensureEditor(){
  var host=document.getElementById('participantFinalsFields');if(!host||document.getElementById('ikrc-final-schedule-fields'))return;
  var wrap=element('div','','ikrc-final-schedule-fields');wrap.id='ikrc-final-schedule-fields';
  [['roasting','로스팅 경연',roastFields],['seed','Seed to Cup 일정',seedFields]].forEach(function(spec){
   var section=element('fieldset','','ikrc-timetable-editor');section.appendChild(element('legend',spec[1]));var grid=element('div','','schedule-grid');
   spec[2].forEach(function(field){var label=element('label','','form-field');label.appendChild(element('span',field[1],'field-label'));var input=element('input');input.id=id(spec[0],field[0]);input.type=field[2]||'text';if(input.type==='number'){input.min='1';input.step='1';}if(input.type==='date'){input.onclick=function(){if(typeof openDatePicker_==='function')openDatePicker_(input);};}else input.placeholder=field[0]==='station'?'A / B / C / D':/Time$/.test(field[0])?'13:45~13:50':'';label.appendChild(input);grid.appendChild(label);});
   section.appendChild(grid);wrap.appendChild(section);
  });host.appendChild(wrap);
 }
 function sync(code){ensureEditor();var wrap=document.getElementById('ikrc-final-schedule-fields');if(wrap)wrap.hidden=code!=='IKRC';if(code==='IKRC'&&!editingParticipantId)load(null);}
 function load(row){ensureEditor();var s=get(row);[['roasting',roastFields,s.roastingSchedule],['seed',seedFields,s.seedSchedule]].forEach(function(spec){spec[1].forEach(function(f){var e=document.getElementById(id(spec[0],f[0]));if(e)e.value=spec[2][f[0]]||'';});});}
 function collect(payload){
  if(payload.competitionCode!=='IKRC')return;
  var schedule=payload.extra.roundSchedules.결선,seed=Object.assign({},schedule.seedToCup||{});
  [['roasting',roastFields,schedule],['seed',seedFields,seed]].forEach(function(spec){spec[1].forEach(function(f){var e=document.getElementById(id(spec[0],f[0]));if(e)spec[2][f[0]]=e.value.trim();});});schedule.seedToCup=seed;
 }
 function snapshot(){return Array.from(document.querySelectorAll('#ikrc-final-schedule-fields input')).map(function(e){return [e.id,e.value];});}
 function renderConsole(res){
  var host=document.getElementById('ikrc-seed-match-tools');if(!host)return;var box=document.getElementById('ikrc-final-timetable');if(box)box.remove();
  var list=res.finalists||[];if(!list.some(function(p){return p.seedSchedule&&p.seedSchedule.date;}))return;
  box=element('details','','ikrc-final-timetable');box.id='ikrc-final-timetable';box.appendChild(element('summary','결선 타임테이블 · 로스팅 / Seed to Cup'));
  [['roastingSchedule','로스팅 경연'],['seedSchedule','Seed to Cup']].forEach(function(spec){
   var section=element('section');section.appendChild(element('h3',spec[1]));var ul=element('ol','','ikrc-timetable-list');
   list.slice().sort(function(a,b){return (a[spec[0]].order||999)-(b[spec[0]].order||999);}).forEach(function(p){var s=p[spec[0]],li=element('li');li.appendChild(element('strong',p.playerName));li.appendChild(element('span',summary(s,'')));var extra=[s.waitingTime?'대기 '+s.waitingTime:'',s.cleanupTime?'정리 '+s.cleanupTime:'',s.judgingTime?'심사·인터뷰 '+s.judgingTime:'',s.rehearsalTime?'리허설 '+s.rehearsalTime:''].filter(Boolean).join(' · ');if(extra)li.appendChild(element('small',extra));ul.appendChild(li);});
   section.appendChild(ul);box.appendChild(section);
  });host.before(box);
 }
 window.IkrcFinalTimetable={sync:sync,load:load,collect:collect,snapshot:snapshot,summary:summary,renderConsole:renderConsole,
  registrySummary:function(row){var s=get(row);return [summary(s.roastingSchedule,'로스팅'),s.seedSchedule.date?summary(s.seedSchedule,'Seed to Cup'):''].filter(Boolean).join(' / ');}};
})();
