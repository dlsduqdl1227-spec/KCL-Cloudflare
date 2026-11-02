(function(){
  'use strict';
  var specs={participants:{table:'partTable',source:function(){return participantRows;},check:'data-schedule-part',all:'participantSelectAll',label:'선수·팀'},operators:{table:'operatorTable',source:function(){return operatorRows.filter(operatorVisibleForSelectedComp);},check:'data-bulk-op',all:'operatorSelectAll',label:'심사위원·운영진'},admins:{table:'adminTable',source:function(){return operatorRows.filter(operatorIsAdminRow);},check:'data-bulk-admin',all:'adminSelectAll',label:'관리자'}};
  var states={},dialog=null,active=null,writing=false,sequence=0;
  function state(target){var code=target==='admins'?'ALL':selectedCompetitionCode_(),key=target+':'+code;return states[key]||(states[key]={selected:new Set(),query:'',date:'',team:''});}
  function request(action,args){return new Promise(function(resolve,reject){rpc(action,args,resolve,reject);});}
  function element(tag,text,className){var el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;}
  function button(text,action,className){var el=element('button',text,className||'btn secondary small');el.type='button';el.onclick=action;return el;}
  function round(){var cfg=configs.find(function(c){return c.code===selectedCompetitionCode_();});if(selectedCompetitionCode_()==='KBC'){if(kbcRosterView_==='1'||kbcRosterView_==='2')return '본선';if(kbcRosterView_==='final')return '결선';}return cfg&&cfg.currentRound||'예선';}
  function number(row,r){return r==='본선'?row.mainCupNo:r==='결선'?row.finalCupNo:row.prelimCupNo;}
  function date(row,target){if(target==='participants'){var schedule=((row.extra||{}).roundSchedules||{})[round()];return schedule?String(schedule.date||''):participantPrelimDate_(row);}return row.effectiveDate||'';}
  function backupStorageKey(target){return 'KCL_REGISTRY_UNDO::'+target+'::'+(target==='admins'?'ALL':selectedCompetitionCode_());}
  function tools(target){return document.getElementById('registry-tools-'+target);}
  function result(target,text,error,backupKey){var area=tools(target).querySelector('.registry-list-result');area.textContent=text||'';area.classList.toggle('error',!!error);if(backupKey){var undo=button('방금 삭제 되돌리기',async function(){if(writing)return;writing=true;undo.disabled=true;try{var res=await request('restoreRegistryBatch',[backupKey,actor]);area.textContent=res.message||'';area.classList.toggle('error',!res.success);if(res.success){sessionStorage.removeItem(backupStorageKey(target));refresh(target);}else area.appendChild(undo);}catch(e){area.textContent='복원을 확인하지 못했습니다. 다시 시도해주세요.';area.appendChild(undo);}finally{writing=false;undo.disabled=false;}});area.appendChild(undo);}}
  function mount(target){
    var spec=specs[target],table=document.getElementById(spec.table);if(!table||tools(target))return;
    var box=element('section','','registry-list-tools');box.id='registry-tools-'+target;box.setAttribute('aria-label',spec.label+' 검색·선택 관리');
    var filters=element('div','','registry-list-filters'),label=element('label','검색'),search=element('input');search.type='search';search.placeholder='이름·소속·번호 검색';search.setAttribute('aria-label',spec.label+' 검색');label.appendChild(search);filters.appendChild(label);
    search.oninput=function(){state(target).query=search.value;state(target).selected.clear();decorate(target);};
    if(target==='operators')for(const kind of ['date','team']){var field=element('label',kind==='date'?'심사 적용일':'조·스테이션'),select=element('select');select.dataset.registryFilter=kind;select.setAttribute('aria-label',kind==='date'?'심사 날짜 필터':'심사 조 필터');select.onchange=function(){state(target)[this.dataset.registryFilter]=this.value;state(target).selected.clear();decorate(target);};field.appendChild(select);filters.appendChild(field);}
    var actions=element('div','','registry-list-actions'),all=document.getElementById(spec.all),allLabel=all&&all.closest('label');
    if(!allLabel){allLabel=element('label','','operator-select-all');var input=element('input');input.type='checkbox';input.id=spec.all;allLabel.appendChild(input);allLabel.appendChild(document.createTextNode('현재 목록 전체 선택'));}actions.appendChild(allLabel);
    var edit=button('선택 수정',function(){open(target,'edit');},'btn small');edit.dataset.registryAction='edit';var remove=button('선택 삭제',function(){open(target,'delete');},'btn danger small');remove.dataset.registryAction='delete';actions.appendChild(edit);actions.appendChild(remove);actions.appendChild(button('삭제 내역',function(){openTrash(target);}));
    var count=element('div','','registry-selection-count');count.setAttribute('aria-live','polite');var status=element('div','','registry-list-result');status.setAttribute('role','status');box.appendChild(filters);box.appendChild(count);box.appendChild(actions);box.appendChild(status);table.parentElement.before(box);
    var observer=new MutationObserver(function(){observer.disconnect();decorate(target);observer.observe(table,{childList:true,subtree:true});});observer.observe(table,{childList:true,subtree:true});table._registryObserver=observer;decorate(target);
    var form=target==='participants'?document.getElementById('participantFormLabel'):target==='operators'?document.getElementById('operatorFormLabel'):document.getElementById('adminFormLabel');
    var formCard=form&&form.closest('.card'),listCard=table.closest('.card'),section=table.closest('.tab-section');
    if(listCard&&section){section.prepend(listCard);var heading=listCard.querySelector('.section-title');heading.appendChild(button('새로 등록',function(){if(target==='participants')cancelParticipantEdit();else if(target==='operators')cancelOperatorEdit();else cancelAdminEdit();var first=formCard.querySelector('input:not([type=hidden])');if(first)first.focus();}));}
    if(formCard){var back=button('명단으로 돌아가기',function(){box.scrollIntoView({block:'start'});box.querySelector('input[type=search]').focus({preventScroll:true});});formCard.querySelector('.section-title').appendChild(back);}
    var quick=target==='participants'?document.getElementById('participant-bulk-prelim-tools'):target==='operators'?document.querySelector('.bulk-date-tools'):null;
    if(quick){var extra=element('details','','registry-quick-tools'),summary=element('summary',target==='participants'?'예선 날짜 빠른변경':'날짜·조 빠른변경');extra.appendChild(summary);quick.before(extra);extra.appendChild(quick);if(target==='participants'){extra.appendChild(document.getElementById('bulkParticipantDateHelp'));}else{extra.appendChild(document.getElementById('bulkOperatorConfirm'));extra.appendChild(document.getElementById('bulkOperatorResult'));var legacy=listCard.querySelector('details.muted-mini');if(legacy)extra.appendChild(legacy);}}
    try{var last=sessionStorage.getItem(backupStorageKey(target));if(last)result(target,'이전 선택 삭제 내역을 되돌릴 수 있습니다.',false,last);}catch(e){}
  }
  function decorate(target){
    var spec=specs[target],table=document.getElementById(spec.table),box=tools(target);if(!box||!table)return;
    var observer=table._registryObserver;if(observer)observer.disconnect();
    table.classList.add('registry-managed-table');var st=state(target),source=spec.source(),byId=new Map(source.map(function(row){return [Number(row.rowIndex),row];}));
    if(target==='participants'){var quick=document.getElementById('participant-bulk-prelim-tools');if(quick&&quick.parentElement.classList.contains('registry-quick-tools'))quick.parentElement.hidden=quick.classList.contains('hidden')||document.getElementById('bulkParticipantDateButton').classList.contains('hidden');}
    var header=table.rows[0];
    if(target==='admins'&&header&&!header.querySelector('[data-admin-check-heading]')){var th=element('th','선택');th.dataset.adminCheckHeading='1';header.prepend(th);}
    if(target==='operators')for(const kind of ['date','team']){var select=box.querySelector('[data-registry-filter="'+kind+'"]'),values=Array.from(new Set(source.map(function(row){return kind==='date'?row.effectiveDate||'__empty':row.teamGroup||'__empty';}))).sort();var signature=JSON.stringify(values);if(select.dataset.values!==signature){select.textContent='';var all=element('option',kind==='date'?'모든 날짜':'모든 조');all.value='';select.appendChild(all);values.forEach(function(v){var option=element('option',v==='__empty'?(kind==='date'?'상시':'조 미지정'):v);option.value=v;select.appendChild(option);});select.dataset.values=signature;}select.value=st[kind];if(select.value!==st[kind])st[kind]='';}
    var seen=new Set(),visible=0;
    Array.from(table.rows).slice(1).forEach(function(tr){
      if(tr.classList.contains('registry-no-results')){tr.remove();return;}
      var check=tr.querySelector('['+spec.check+']');
      if(target==='admins'&&!check){var edit=tr.querySelector('[data-edit-admin]');if(!edit)return;var td=element('td');check=element('input');check.type='checkbox';check.setAttribute(spec.check,edit.dataset.editAdmin);check.setAttribute('aria-label','관리자 선택');td.appendChild(check);tr.prepend(td);}
      if(!check)return;var id=Number(check.getAttribute(spec.check)),row=byId.get(id);if(!row)return;seen.add(id);
      var haystack=[row.name,row.teamName,row.affiliation,row.phone,row.uniqueNo,row.prelimCupNo,row.mainCupNo,row.finalCupNo].join(' ').toLowerCase(),show=haystack.includes(st.query.trim().toLowerCase());
      if(target==='operators')show=show&&(!st.date||(row.effectiveDate||'__empty')===st.date)&&(!st.team||(row.teamGroup||'__empty')===st.team);
      tr.hidden=!show;if(show)visible++;else st.selected.delete(id);
      check.checked=st.selected.has(id);check.setAttribute('aria-label',(row.name||spec.label)+' 선택');tr.classList.toggle('registry-selected',check.checked);
      Array.from(tr.cells).forEach(function(td,i){td.dataset.label=header&&header.cells[i]?header.cells[i].textContent.trim():'';if(td.dataset.label==='유형'){var labels={JUDGE:'심사위원·헤드',TEAMLEAD:'대회팀장',STAFF:'운영진'};if(labels[td.textContent])td.textContent=labels[td.textContent];}});
    });
    st.selected.forEach(function(id){if(!seen.has(id))st.selected.delete(id);});
    var allBox=document.getElementById(spec.all);allBox.checked=!!visible&&st.selected.size===visible;allBox.indeterminate=st.selected.size>0&&st.selected.size<visible;
    box.querySelector('.registry-selection-count').textContent='선택 '+st.selected.size+'건 · 표시 '+visible+'건';
    box.querySelectorAll('[data-registry-action]').forEach(function(b){b.disabled=!st.selected.size||writing;});
    if(!visible&&source.length){var empty=table.insertRow(),cell=empty.insertCell();empty.className='registry-no-results';cell.colSpan=header?header.cells.length:8;cell.textContent='검색 조건에 맞는 명단이 없습니다.';}
    if(observer)observer.observe(table,{childList:true,subtree:true});
  }
  function refresh(target){if(target==='participants')loadParticipants();else loadOperators();}
  async function openTrash(target){
    if(writing)return;makeDialog();active=null;var ticket=++sequence,code=target==='admins'?'ALL':selectedCompetitionCode_();dialog.textContent='';var header=element('header');header.appendChild(element('h2',specs[target].label+' 삭제 내역'));header.querySelector('h2').id='registry-bulk-title';header.appendChild(button('닫기',close));dialog.appendChild(header);var body=element('div','','registry-bulk-body');body.textContent='삭제 내역을 불러오는 중...';dialog.appendChild(body);dialog.showModal();
    try{var res=await request('getRegistryTrash',[{target:target,competitionCode:code},actor]);if(ticket!==sequence)return;body.textContent='';if(!res.success){body.textContent=res.message||'조회에 실패했습니다.';return;}if(!res.items.length){body.textContent='복원할 선택 삭제 내역이 없습니다.';return;}
      body.appendChild(element('p','최근 선택 삭제 내역입니다. 같은 번호나 계정이 다시 등록된 경우에는 중복을 막기 위해 복원을 제한합니다.'));
      res.items.forEach(function(item){var card=element('article','','registry-bulk-row');card.appendChild(element('h3',item.names.join(', ')));card.appendChild(element('p',new Date(item.deletedAt).toLocaleString('ko-KR')+' · '+item.deletedBy+' · '+item.count+'건'));
        var restore=button('이 명단 복원',async function(){if(writing)return;writing=true;document.getElementById('comp').disabled=true;body.querySelectorAll('button').forEach(function(b){b.disabled=true;});var message=element('p','복원 중...');card.appendChild(message);try{var saved=await request('restoreRegistryBatch',[item.backupKey,actor]);message.textContent=saved.message||'';if(saved.success){restore.remove();try{sessionStorage.removeItem(backupStorageKey(target));}catch(e){}refresh(target);}}catch(e){message.textContent='복원을 확인하지 못했습니다. 다시 시도해주세요.';}finally{writing=false;document.getElementById('comp').disabled=false;body.querySelectorAll('button').forEach(function(b){b.disabled=false;});}},'btn secondary small');card.appendChild(restore);body.appendChild(card);
      });
    }catch(e){if(ticket===sequence)body.textContent='삭제 내역을 불러오지 못했습니다. 다시 시도해주세요.';}
  }
  function close(){if(writing)return;if(dialog&&dialog.open)dialog.close();active=null;sequence++;}
  function makeDialog(){if(dialog)return;dialog=element('dialog','','registry-bulk-dialog');dialog.id='registry-bulk-dialog';dialog.setAttribute('aria-labelledby','registry-bulk-title');dialog.addEventListener('cancel',function(event){if(writing)event.preventDefault();else close();});document.body.appendChild(dialog);}
  function open(target,operation,onlyId){
    if(writing)return;makeDialog();var spec=specs[target],st=state(target),selected=spec.source().filter(function(row){return onlyId?Number(row.rowIndex)===onlyId:st.selected.has(Number(row.rowIndex));});
    if(!selected.length)return;active={target:target,operation:operation,code:target==='admins'?'ALL':selectedCompetitionCode_(),round:round(),rows:selected,original:new Map(),plan:null,payload:null};sequence++;dialog.textContent='';
    var header=element('header'),title=element('h2',(operation==='delete'?'선택 삭제':'일괄 수정')+' · '+spec.label+' '+selected.length+'건');title.id='registry-bulk-title';header.appendChild(title);header.appendChild(button('닫기',close));dialog.appendChild(header);
    var body=element('div','','registry-bulk-body'),note=element('p',operation==='delete'?'평가 점수·코멘트는 삭제하지 않습니다. 평가 기록에 연결된 선수와 보호 대상은 유지하며, 삭제한 명단은 되돌릴 수 있습니다.':'선택한 행만 수정합니다. 변경하지 않은 항목과 평가 점수·코멘트는 그대로 유지됩니다.');body.appendChild(note);
    var r=active.round,fields=target==='participants'?[['name',active.code==='KTCC'?'팀명':'선수명'],['affiliation',active.code==='KTCC'?'팀원':'소속'],['phone','연락처'],['number',r+' 번호'],['date',r+' 날짜','date'],['station',r+' 스테이션'],['team',r+' 심사조']]:target==='operators'?[['name','이름'],['affiliation','소속'],['phone','연락처'],['accountType','계정 유형','type'],['role','역할'],['team','조·스테이션'],['date','심사 적용일','date']]:[['name','관리자 이름'],['affiliation','소속'],['phone','연락처']];
    if(target==='participants')fields=fields.filter(function(field){if(active.code==='KCR'&&field[0]==='date')return false;if(field[0]==='team')return active.code==='MOB';if(field[0]==='station')return ['KBC','MOB','MOC','IKRC'].includes(active.code);return true;}).map(function(field){return active.code==='IKRC'&&field[0]==='station'?['station','로스팅 위치']:field;});
    if(operation==='edit'){
      var common=element('div','','registry-bulk-common'),fieldSelect=element('select');fieldSelect.setAttribute('aria-label','공통 수정 항목');fields.filter(function(f){return !['name','phone','number','accountType'].includes(f[0]);}).forEach(function(f){var option=element('option',f[1]);option.value=f[0];fieldSelect.appendChild(option);});var value=element('input');value.setAttribute('aria-label','공통 입력값');value.placeholder='비워서 적용하면 해당 항목만 비웁니다';fieldSelect.onchange=function(){value.type=fieldSelect.value==='date'?'date':'text';value.value='';};fieldSelect.onchange();common.appendChild(fieldSelect);common.appendChild(value);common.appendChild(button('선택 행에 일괄 입력',function(){body.querySelectorAll('[data-registry-field="'+fieldSelect.value+'"]').forEach(function(input){input.value=value.value;});invalidate();}));body.appendChild(common);
    }
    var rows=element('div','','registry-bulk-rows');selected.forEach(function(row){
      var card=element('article','','registry-bulk-row');card.dataset.registryRow=String(row.rowIndex);card.appendChild(element('h3',row.name+(target==='operators'?' · '+(row.effectiveDate||'상시')+' · '+(row.teamGroup||'조 미지정'):'')));
      var original={},grid=element('div','','registry-bulk-fields'),schedule=target==='participants'?((row.extra||{}).roundSchedules||{})[r]||{}:{};
      if(operation==='edit')fields.forEach(function(field){var key=field[0],v=key==='number'?number(row,r):key==='date'?date(row,target):key==='station'?schedule.station||'':key==='team'?target==='participants'?schedule.team||'':row.teamGroup||'':row[key]||'';original[key]=String(v||'');var label=element('label',field[1]),input=field[2]==='type'?element('select'):element('input');
        if(field[2]==='type')[['JUDGE','심사위원·헤드'],['TEAMLEAD','대회팀장'],['STAFF','운영진']].forEach(function(pair){var o=element('option',pair[1]);o.value=pair[0];input.appendChild(o);});else input.type=field[2]==='date'?'date':'text';
        input.value=original[key];input.dataset.registryField=key;input.setAttribute('aria-label',row.name+' '+field[1]);if(key==='phone')input.inputMode='tel';input.oninput=invalidate;input.onchange=function(){if(key==='accountType'){var role=card.querySelector('[data-registry-field="role"]');if(role){if(input.value==='TEAMLEAD')role.value='대회팀장';else if(input.value==='STAFF')role.value='운영진';else if(/팀장|운영진/.test(role.value))role.value='센서리 심사위원';}}invalidate();};label.appendChild(input);grid.appendChild(label);
      });active.original.set(Number(row.rowIndex),original);if(operation==='edit')card.appendChild(grid);rows.appendChild(card);
    });body.appendChild(rows);
    var feedback=element('div','','registry-bulk-feedback');feedback.id='registry-bulk-feedback';feedback.setAttribute('aria-live','polite');body.appendChild(feedback);dialog.appendChild(body);
    var footer=element('footer');var preview=button(operation==='delete'?'삭제 대상 확인':'변경 내용 확인',previewPlan,'btn secondary');preview.id='registry-bulk-preview';footer.appendChild(preview);var apply=button(operation==='delete'?'선택 삭제 실행':'수정 저장',applyPlan,operation==='delete'?'btn danger':'btn');apply.id='registry-bulk-apply';apply.disabled=true;footer.appendChild(apply);dialog.appendChild(footer);dialog.showModal();
  }
  function invalidate(){if(!active)return;active.plan=null;active.payload=null;document.getElementById('registry-bulk-apply').disabled=true;document.getElementById('registry-bulk-feedback').textContent='내용을 변경했습니다. 변경 내용 확인을 눌러주세요.';}
  async function previewPlan(){
    if(!active||writing)return;var context=active,ticket=++sequence,entries=[];context.rows.forEach(function(row){var updates={};if(context.operation==='edit'){var original=context.original.get(Number(row.rowIndex));dialog.querySelector('[data-registry-row="'+row.rowIndex+'"]').querySelectorAll('[data-registry-field]').forEach(function(input){var key=input.dataset.registryField;if(input.value!==original[key])updates[key]=input.value;});if(!Object.keys(updates).length)return;}entries.push({rowIndex:Number(row.rowIndex),version:row.registryVersion,updates:updates});});
    var feedback=document.getElementById('registry-bulk-feedback');if(!entries.length){feedback.textContent='변경한 항목이 없습니다.';return;}
    var payload={target:context.target,operation:context.operation,competitionCode:context.code,round:context.round,entries:entries};feedback.textContent='대상과 중복 여부를 확인하는 중...';var preview=document.getElementById('registry-bulk-preview');preview.disabled=true;
    try{var res=await request('previewRegistryBatch',[payload,actor]);if(active!==context||ticket!==sequence)return;context.plan=res;context.payload=payload;feedback.textContent=res.message||'';feedback.classList.toggle('error',!res.success||!!(res.errors&&res.errors.length));
      if(res.summary&&res.summary.length){var list=element('ul');res.summary.forEach(function(item){list.appendChild(element('li',item.name+' · '+item.description));});feedback.appendChild(list);}
      for(const kind of ['blocked','errors'])if(res[kind]&&res[kind].length){var list=element('ul');res[kind].forEach(function(item){list.appendChild(element('li',item.name+' · '+(item.reason||item.message)));});feedback.appendChild(list);}
      if(res.ready&&context.operation==='delete'){var ack=element('label','','registry-delete-ack'),check=element('input');check.type='checkbox';check.id='registry-delete-ack';check.onchange=function(){document.getElementById('registry-bulk-apply').disabled=!check.checked;};ack.appendChild(check);ack.appendChild(document.createTextNode('삭제 대상과 유지되는 보호 대상을 확인했습니다.'));feedback.appendChild(ack);}
      document.getElementById('registry-bulk-apply').disabled=!res.ready||context.operation==='delete';
    }catch(error){if(active===context)feedback.textContent='확인 요청이 실패했습니다. 입력 내용은 유지됩니다. 다시 시도해주세요.';}finally{if(active===context)preview.disabled=false;}
  }
  async function applyPlan(){
    if(!active||!active.plan||!active.plan.ready||writing)return;var context=active,feedback=document.getElementById('registry-bulk-feedback');writing=true;document.getElementById('comp').disabled=true;dialog.querySelectorAll('button,input,select').forEach(function(input){input.disabled=true;});feedback.textContent='저장 중...';
    try{var res=await request('applyRegistryBatch',[Object.assign({},context.payload,{revision:context.plan.revision}),actor]);if(res.success){writing=false;dialog.close();active=null;state(context.target).selected.clear();if(res.backupKey)try{sessionStorage.setItem(backupStorageKey(context.target),res.backupKey);}catch(e){}result(context.target,res.message,false,res.backupKey);refresh(context.target);}else{feedback.textContent=res.message||'저장하지 못했습니다. 입력 내용은 유지됩니다.';context.plan=null;}}
    catch(error){feedback.textContent='저장 응답을 확인하지 못했습니다. 입력 내용은 유지됩니다. 목록을 확인한 뒤 다시 시도해주세요.';context.plan=null;}
    finally{writing=false;document.getElementById('comp').disabled=false;if(active===context){dialog.querySelectorAll('button,input,select').forEach(function(input){input.disabled=false;});document.getElementById('registry-bulk-apply').disabled=true;}Object.keys(specs).forEach(decorate);}
  }
  document.addEventListener('change',function(event){
    for(const target of Object.keys(specs)){var spec=specs[target],input=event.target;
      if(input.id===spec.all){event.stopImmediatePropagation();var st=state(target);document.querySelectorAll('#'+spec.table+' ['+spec.check+']').forEach(function(check){if(!check.closest('tr').hidden){check.checked=input.checked;if(check.checked)st.selected.add(Number(check.getAttribute(spec.check)));else st.selected.delete(Number(check.getAttribute(spec.check)));}});decorate(target);return;}
      if(input.hasAttribute(spec.check)){var id=Number(input.getAttribute(spec.check));if(input.checked)state(target).selected.add(id);else state(target).selected.delete(id);decorate(target);return;}
    }
  },true);
  document.addEventListener('click',function(event){var remove=event.target.closest('[data-del-part],[data-del-op]');if(!remove)return;var target=remove.closest('#partTable')?'participants':remove.closest('#adminTable')?'admins':'operators';event.preventDefault();event.stopImmediatePropagation();open(target,'delete',Number(remove.dataset.delPart||remove.dataset.delOp));},true);
  document.getElementById('comp').addEventListener('change',function(){close();Object.keys(specs).forEach(function(target){var st=state(target);st.selected.clear();st.query='';st.date='';st.team='';var box=tools(target);box.querySelector('input[type=search]').value='';result(target,'');});});
  Object.keys(specs).forEach(mount);
})();
