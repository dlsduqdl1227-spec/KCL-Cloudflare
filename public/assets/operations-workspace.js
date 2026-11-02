(function(){
 'use strict';
 var panel=document.querySelector('#pAdmin .admin-console-inner');if(!panel)return;
 var selected='',title=panel.querySelector('h2');
 var nav=document.createElement('nav');nav.className='workspace-operations-nav';nav.setAttribute('aria-label','운영센터 이동');
 [['/admin/','운영센터 홈'],['/registry/','명단 관리'],['/assessment/?admin=1','대회 운영'],['/debriefing/?from=admin&preview=1','디브리핑 확인']].forEach(function(pair){var a=document.createElement('a');a.href=pair[0];a.textContent=pair[1]==='디브리핑 확인'?'디브리핑':pair[1];a.setAttribute('aria-label',pair[1]);if(pair[1]==='대회 운영')a.setAttribute('aria-current','page');nav.appendChild(a);});title.before(nav);
 var context=document.createElement('div');context.className='workspace-operation-context';var label=document.createElement('label');label.textContent='작업할 대회';var select=document.createElement('select');select.id='admin-workspace-competition';select.setAttribute('aria-label','운영할 대회 선택');label.appendChild(select);context.appendChild(label);var note=document.createElement('span');note.textContent='선택한 대회의 평가와 설정만 표시합니다.';context.appendChild(note);panel.querySelector('.admin-tabs').before(context);
 select.onchange=function(){selected=select.value;filter();};
 var security=document.getElementById('login-security-card'),common=document.createElement('details');common.className='workspace-common-settings';var summary=document.createElement('summary');summary.textContent='전체 로그인 보안번호 관리';common.appendChild(summary);common.appendChild(security);panel.appendChild(common);
 document.getElementById('admin-permission-guide').textContent='명단 등록·수정은 명단 관리에서, 평가 확인·순위·스테이션은 이 화면에서 관리합니다.';
 document.getElementById('admin-tab-run').textContent='평가·결과';document.getElementById('admin-tab-config').textContent='대회 설정';
 panel.querySelectorAll('.admin-footer-actions button').forEach(function(button){if(button.textContent==='등록·권한 관리')button.remove();else if(button.textContent==='관리 정보 새로고침')button.textContent='새로고침';});
 var health=document.getElementById('server-health-card');document.getElementById('admin-comp-list').after(health);
 panel.querySelectorAll('#admin-section-run>.admin-section').forEach(function(heading){heading.remove();});
 function filter(){panel.querySelectorAll('[data-workspace-competition]').forEach(function(card){card.hidden=card.dataset.workspaceCompetition!==selected;});}
 function refresh(){
  var cfgs=(_adminConsole&&_adminConsole.configs)||_configs||[];
  var signature=JSON.stringify(cfgs.map(function(c){return [c.code,c.name];}));
  if(select.dataset.options!==signature){select.textContent='';cfgs.forEach(function(c){var option=document.createElement('option');option.value=c.code;option.textContent=c.code+' · '+c.name;select.appendChild(option);});select.dataset.options=signature;}
  if(!cfgs.some(function(c){return c.code===selected;}))selected=cfgs.some(function(c){return _selComp&&c.code===_selComp.code;})?_selComp.code:cfgs[0]&&cfgs[0].code||'';
  select.value=selected;
  document.querySelectorAll('#admin-comp-list>.admin-comp-card').forEach(function(card){
   var actions=card.querySelector('.admin-comp-actions');if(!actions||card.querySelector('.workspace-operation-extras'))return;
   var extras=document.createElement('details');extras.className='workspace-operation-extras';var caption=document.createElement('summary');caption.textContent='심사 도구·스테이션·백업';extras.appendChild(caption);var more=document.createElement('div');more.className='admin-comp-actions';extras.appendChild(more);
   Array.from(actions.children).forEach(function(button){if(!['eval','review','rank','debrief-preview'].includes(button.dataset.act))more.appendChild(button);});if(more.children.length)card.appendChild(extras);
  });
  filter();
 }
 for(const name of ['adminRenderRunCards_','adminRenderConfigList_']){var original=window[name];window[name]=(function(fn){return function(){var result=fn.apply(this,arguments);refresh();return result;};})(original);}
 refresh();
})();
