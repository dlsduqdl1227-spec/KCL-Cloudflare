(function(){
 'use strict';
 var main=document.getElementById('main'),context=document.getElementById('registry-context');if(!main||!context)return;
 var fields={participants:{label:'선수·팀',tab:'players',title:'participantFormLabel',input:'mName',edit:'editParticipant',cancel:'cancelParticipantEdit'},operators:{label:'심사위원·운영진',tab:'operators',title:'operatorFormLabel',input:'opName',edit:'editOperator',cancel:'cancelOperatorEdit'},admins:{label:'관리자',tab:'admins',title:'adminFormLabel',input:'adminName',edit:'editAdmin',cancel:'cancelAdminEdit'}};
 var editor=document.createElement('dialog'),utility=document.createElement('dialog'),current='',baseline='',returnFocus=null,counts={};
 function el(tag,text,cls){var node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;}
 function button(text,handler,cls){var node=el('button',text,cls||'btn secondary small');node.type='button';node.onclick=handler;return node;}
 function dialogShell(dialog,id,title){dialog.id=id;dialog.className='workspace-dialog';dialog.setAttribute('aria-labelledby',id+'-title');var head=el('header'),heading=el('h2',title);heading.id=id+'-title';head.appendChild(heading);head.appendChild(button('닫기',function(){if(dialog===editor)closeEditor(false);else dialog.close();},'btn secondary small workspace-close'));dialog.appendChild(head);var body=el('div','','workspace-dialog-body');dialog.appendChild(body);document.body.appendChild(dialog);return body;}
 var editorBody=dialogShell(editor,'registry-editor-dialog','명단 등록'),utilityBody=dialogShell(utility,'registry-utility-dialog','관리 도구');
 var editorFooter=el('footer'),cancelEditor=button('취소',function(){closeEditor(false);});editorFooter.appendChild(cancelEditor);editor.appendChild(editorFooter);
 function syncEditorFooter(){if(!current)return;var spec=fields[current],source=spec.save;if(source){cancelEditor.disabled=source.disabled;spec.cancelElement.disabled=source.disabled;cancelEditor.hidden=!spec.cancelElement.classList.contains('hidden');}}
 function snapshot(){return current?JSON.stringify(Array.from(fields[current].card.querySelectorAll('input,select,textarea')).map(function(input){return [input.id,input.value,input.checked];})):'';}
 function closeEditor(force){if(!editor.open)return;var save=fields[current]&&fields[current].save;if(!force&&save&&save.disabled)return;if(!force&&snapshot()!==baseline&&!confirm('저장하지 않은 변경 내용이 있습니다. 저장하지 않고 닫을까요?'))return;editor.close();current='';if(returnFocus&&returnFocus.isConnected)returnFocus.focus();}
 function showEditor(target,reset){
  var spec=fields[target];if(!spec)return;if(editor.open&&current!==target&&!confirm('작성 중인 내용을 닫고 다른 명단을 열까요?'))return;
  if(reset)spec.originalCancel();returnFocus=document.activeElement;current=target;
  Object.keys(fields).forEach(function(key){fields[key].card.hidden=key!==target;fields[key].save.hidden=key!==target;fields[key].cancelElement.hidden=key!==target;});
  document.getElementById('registry-editor-dialog-title').textContent=(target==='admins'?'전체 공통':selectedCompetitionCode_())+' · '+spec.label+' '+(reset?'추가':'수정');
  if(!editor.open)editor.showModal();baseline=snapshot();syncEditorFooter();
  var input=document.getElementById(spec.input);if(input)input.focus();
 }
 editor.addEventListener('cancel',function(event){event.preventDefault();closeEditor(false);});
 Object.keys(fields).forEach(function(target){
  var spec=fields[target];spec.card=document.getElementById(spec.title).closest('.card');spec.card.classList.add('workspace-editor-card');editorBody.appendChild(spec.card);spec.card.hidden=true;
  spec.originalCancel=window[spec.cancel];var originalEdit=window[spec.edit];
  window[spec.edit]=function(){showEditor(target,false);var res=originalEdit.apply(this,arguments);baseline=snapshot();syncEditorFooter();return res;};
  window[spec.cancel]=function(){var res=spec.originalCancel.apply(this,arguments);if(editor.open&&current===target)closeEditor(true);return res;};
  spec.card.querySelectorAll('button').forEach(function(node){if(node.textContent==='명단으로 돌아가기')node.remove();});
  spec.save=spec.card.querySelector('.btn[id$="SaveBtn"]');editorFooter.appendChild(spec.save);spec.save.hidden=true;
  spec.cancelElement=document.getElementById(target==='participants'?'participantCancelBtn':target==='operators'?'operatorCancelBtn':'adminCancelBtn');editorFooter.appendChild(spec.cancelElement);spec.cancelElement.hidden=true;
  editorFooter.insertBefore(spec.cancelElement,spec.save);
  new MutationObserver(syncEditorFooter).observe(spec.cancelElement,{attributes:true,attributeFilter:['class']});
  new MutationObserver(syncEditorFooter).observe(spec.save,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  spec.card.querySelectorAll('.btnrow').forEach(function(row){if(!row.children.length)row.remove();});
  var create=document.querySelector('[data-registry-create="'+target+'"]');if(create)create.textContent=target==='participants'?'선수·팀 추가':target==='operators'?'심사위원 추가':'관리자 추가';
 });
 var legacyPreset=document.getElementById('mobSchedulePresetBtn');
 if(legacyPreset){var legacyRow=legacyPreset.parentElement,legacyTools=el('details','','registry-individual-fields');legacyTools.appendChild(el('summary','지난 MOB 예선 설정'));legacyTools.appendChild(el('p','지난 예선의 날짜별 권한을 설정하는 도구입니다. 현재 상시 권한 운영에는 사용하지 마세요.'));legacyRow.before(legacyTools);legacyTools.appendChild(legacyPreset);if(!legacyRow.children.length)legacyRow.remove();var syncLegacyVisibility=function(){legacyTools.hidden=legacyPreset.classList.contains('hidden');};new MutationObserver(syncLegacyVisibility).observe(legacyPreset,{attributes:true,attributeFilter:['class']});syncLegacyVisibility();}
 var originalCopyOperator=window.copyOperatorForDate;
 window.copyOperatorForDate=function(){showEditor('operators',false);var res=originalCopyOperator.apply(this,arguments);document.getElementById('registry-editor-dialog-title').textContent=selectedCompetitionCode_()+' · 날짜별 권한 추가';baseline=snapshot();syncEditorFooter();return res;};
 window.RegistryWorkspace={openEditor:showEditor};
 document.querySelectorAll('.registry-quick-tools').forEach(function(tool){tool.closest('.card').appendChild(tool);});
 var originalRpc=window.rpc;
 window.rpc=function(action,args,ok,fail){return originalRpc(action,args,function(res){if(ok)ok(res);if(res&&res.success&&['upsertParticipant','upsertOperatorAccount'].includes(action)&&!editor.open){feedback.textContent=res.message||'저장했습니다.';feedback.className='workspace-feedback success';}},fail);};
 var feedback=el('div','','workspace-feedback');feedback.id='registry-workspace-feedback';feedback.setAttribute('role','status');main.prepend(feedback);
 var tabs=document.querySelector('#main>.tabs');tabs.classList.add('workspace-tabs');context.after(tabs);
 var utilities=el('div','','workspace-utilities'),importCard=document.getElementById('allUploadCard'),danger=context.querySelector('.danger-panel');
 utilities.appendChild(button('엑셀 등록·백업',function(){openUtility(importCard,'엑셀 등록·백업');}));utilities.appendChild(button('데이터 관리',function(){openUtility(danger,'데이터 관리 · 삭제 주의');}));
 context.appendChild(utilities);
 [importCard,danger].forEach(function(card){utilityBody.appendChild(card);card.hidden=true;});
 function openUtility(card,title){[importCard,danger].forEach(function(item){item.hidden=item!==card;});card.open=true;document.getElementById('registry-utility-dialog-title').textContent=title;utility.showModal();}
 var globalContext=el('div','전체 대회 공통 관리자 계정입니다.','workspace-global-context');globalContext.hidden=true;context.appendChild(globalContext);
 var guidance=el('p','명단을 체크하면 선택한 사람만 함께 수정하거나 삭제할 수 있습니다.','workspace-list-guidance');tabs.after(guidance);
 function update(){
  var tab=currentRegistryTab||'players',isGlobal=tab==='admins',cfg=configs.find(function(item){return item.code===selectedCompetitionCode_();});
  context.querySelector('.control-grid').hidden=isGlobal;context.querySelector('.section-title').hidden=isGlobal;utilities.hidden=isGlobal;globalContext.hidden=!isGlobal;
  if(cfg){document.getElementById('mainStatus').textContent=(cfg.currentRound||'')+' · '+(cfg.isActive?'대회 오픈':'대회 닫힘');}
  [['players','선수·팀','participants'],['operators','심사위원','operators'],['admins','관리자','admins']].forEach(function(item){var tabButton=document.getElementById('tabbtn-'+item[0]);tabButton.textContent=item[1];var badge=el('span',counts[item[2]]==null?'—':String(counts[item[2]]),'workspace-tab-count');tabButton.appendChild(badge);tabButton.tabIndex=tab===item[0]?0:-1;});
  document.body.dataset.registryTab=tab;
 }
 for(const name of ['switchRegistryTab','updateMainStatus']){var original=window[name];window[name]=(function(fn,isTab){return function(){var previous=currentRegistryTab,result=fn.apply(this,arguments);if(isTab&&previous!==currentRegistryTab)feedback.textContent='';update();return result;};})(original,name==='switchRegistryTab');}
 document.addEventListener('registry:list-updated',function(event){counts[event.detail.target]=event.detail.total;if(event.detail.target==='operators'){var table=document.getElementById('operatorTable'),column=Array.from(table.rows[0].cells).findIndex(function(cell){return cell.textContent==='유형';}),labels={JUDGE:'심사위원',TEAMLEAD:'운영팀장',STAFF:'운영진'};if(column>=0)Array.from(table.rows).slice(1).forEach(function(row){var cell=row.cells[column],label=cell&&labels[cell.textContent];if(label)cell.textContent=label;});}update();});
 tabs.addEventListener('keydown',function(event){var options=['players','operators','admins'],index=options.indexOf(currentRegistryTab);if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();index=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;switchRegistryTab(options[index]);document.getElementById('tabbtn-'+options[index]).focus();});
 document.getElementById('comp').addEventListener('change',function(){feedback.textContent='';update();});
 update();
})();
