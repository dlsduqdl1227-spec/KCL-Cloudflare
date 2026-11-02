import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage276-qa',{recursive:true});
try{
 await api.rpc('upsertOperatorAccount',{accountType:'ADMIN',name:'검수 QA',phone:'01099990000'},api.actor);
 for(let i=1;i<=3;i++)await api.rpc('upsertParticipant',{competitionCode:'MOB',name:'선수 '+i,affiliation:'원본 소속',uniqueNo:String(i),prelimCupNo:String(i),finalCupNo:String(i)},api.actor);
 for(let i=1;i<=2;i++)await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name:'심사 '+i,phone:'0108900000'+i,access:'MOB',role:i===1?'센서리 헤드 심사위원':'센서리 심사위원',teamGroup:'A조',effectiveDate:'2026-11-11'},api.actor);
 await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name:'KCR 보존',phone:'01089000009',access:'KCR',role:'센서리 심사위원',effectiveDate:'2026-09-15'},api.actor);
 const kcr=JSON.stringify(api.db.prepare("SELECT * FROM operators WHERE access='KCR'").all());
 const page=await qa.page(390,950);await page.goto(qa.origin+'/registry/');
 await page.locator('#loginName').fill('01099990000');await page.locator('#loginPhone').fill('local-qa-only');await page.locator('#loginSecret').fill('5061');await page.locator('#registry-login-button').click();
 await page.locator('#comp option[value=MOB]').waitFor({state:'attached'});await page.locator('#comp').selectOption('MOB');await page.waitForFunction(()=>participantRows.length===3);
 assert.equal(await page.locator('.logo-chip').count(),0,'decorative competition chips removed');
 assert.equal(await page.locator('#mName').isVisible(),false,'registration form no longer clutters the list');
 await page.getByRole('button',{name:'선수·팀 추가',exact:true}).click();await page.locator('#registry-editor-dialog').waitFor({state:'visible'});
 await page.locator('#mName').fill('새 선수');await page.locator('#mNo').fill('4');await page.locator('#mAff').fill('새 소속');await page.locator('#participantSaveBtn').click();
 await page.waitForFunction(()=>!document.getElementById('registry-editor-dialog').open&&participantRows.length===4);
 await page.locator('#partTable [data-edit-part]').first().click();await page.locator('#mAff').fill('수정 소속');await page.locator('#participantSaveBtn').click();await page.waitForFunction(()=>participantRows.some(r=>r.affiliation==='수정 소속'));
 assert.equal(await page.locator('#registry-editor-dialog').isVisible(),false);
 await page.locator('#partTable [data-edit-part]').first().click();await page.locator('#mAff').fill('저장하지 않을 내용');await page.locator('#registry-editor-dialog').press('Escape');assert.equal(await page.locator('#registry-editor-dialog').isVisible(),false);assert.equal(api.db.prepare("SELECT COUNT(*) n FROM participants WHERE affiliation='저장하지 않을 내용'").get().n,0,'discarding an editor must never write to the database');
 await page.locator('#tabbtn-operators').click();await page.waitForFunction(()=>document.querySelectorAll('#operatorTable [data-bulk-op]').length===2);
 await page.locator('#operatorSelectAll').check();await page.locator('#registry-tools-operators').getByRole('button',{name:'선택 수정',exact:true}).click();
 assert.equal(await page.locator('#registry-bulk-dialog .registry-individual-fields').getAttribute('open'),null,'multi-row details collapsed initially');
 await page.getByRole('combobox',{name:'공통 수정 항목',exact:true}).selectOption('date');await page.getByLabel('상시 권한으로 변경',{exact:true}).check();
 await page.locator('#registry-bulk-preview').click();await page.waitForFunction(()=>!document.getElementById('registry-bulk-apply').disabled);await page.locator('#registry-bulk-apply').click();
 await page.waitForFunction(()=>!document.getElementById('registry-bulk-dialog').open&&operatorRows.filter(r=>r.access==='MOB').every(r=>!r.effectiveDate));
 assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM operators WHERE access='KCR'").all()),kcr);
 await page.locator('#operatorTable [data-edit-op]').first().click();await page.locator('#opAff').fill('심사위원 수정 소속');await page.locator('#operatorSaveBtn').click();await page.waitForFunction(()=>!document.getElementById('registry-editor-dialog').open&&operatorRows.some(r=>r.affiliation==='심사위원 수정 소속'));
 await page.locator('#operatorTable [data-copy-date-op]').first().click();assert.equal(await page.locator('#registry-editor-dialog').isVisible(),true);assert.equal(await page.locator('#opDate').isVisible(),true);assert.match(await page.locator('#operatorEditState').innerText(),/권한 복제/);assert.equal(await page.locator('#mobSchedulePresetBtn').isVisible(),false,'past-event presets must not crowd the current permission editor');await page.locator('#operatorCancelBtn').click();
 await page.locator('#operatorSelectAll').check();await page.locator('#registry-tools-operators').getByRole('button',{name:'선택 수정',exact:true}).click();await page.getByRole('textbox',{name:'공통 입력값',exact:true}).fill('저장하지 않을 변경');
 page.removeAllListeners('dialog');page.once('dialog',d=>d.dismiss());await page.locator('#registry-bulk-dialog').press('Escape');assert.equal(await page.locator('#registry-bulk-dialog').isVisible(),true,'declining the discard confirmation must keep the bulk editor open');page.on('dialog',d=>d.accept());await page.locator('#registry-bulk-dialog').press('Escape');assert.equal(await page.locator('#registry-bulk-dialog').isVisible(),false);assert.equal(api.db.prepare("SELECT COUNT(*) n FROM operators WHERE affiliation='저장하지 않을 변경'").get().n,0);
 await page.getByRole('button',{name:'엑셀 등록·백업',exact:true}).click();assert.equal(await page.locator('#allRegistryFile').isVisible(),true);await page.locator('#registry-utility-dialog .workspace-close').click();
 await page.locator('#tabbtn-admins').click();await page.waitForFunction(()=>document.body.dataset.registryTab==='admins');assert.equal(await page.locator('#comp').isVisible(),false);assert.match(await page.locator('.workspace-global-context').innerText(),/전체 대회 공통/);
 await page.getByRole('button',{name:'관리자 추가',exact:true}).click();await page.locator('#adminName').fill('추가 관리자 QA');await page.locator('#adminPhone').fill('01089000011');await page.locator('#adminSaveBtn').click();await page.waitForFunction(()=>!document.getElementById('registry-editor-dialog').open&&operatorRows.some(r=>r.name==='추가 관리자 QA'));
 await page.locator('#adminTable tr').filter({hasText:'추가 관리자 QA'}).locator('[data-edit-admin]').click();await page.locator('#adminAff').fill('관리자 수정 소속');await page.locator('#adminSaveBtn').click();await page.waitForFunction(()=>!document.getElementById('registry-editor-dialog').open&&operatorRows.some(r=>r.affiliation==='관리자 수정 소속'));
 await page.locator('#tabbtn-admins').press('Home');assert.equal(await page.locator('#tabbtn-players').getAttribute('aria-selected'),'true');
 for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));const state=await inspectPage(page);assert.equal(state.pageOverflow,false,JSON.stringify(state));assert.deepEqual(state.brokenImages,[]);await page.screenshot({path:'tmp/stage276-qa/registry-'+width+'.png'});}
 await page.setViewportSize({width:390,height:950});await page.getByRole('button',{name:'선수·팀 추가',exact:true}).click();assert.equal((await inspectPage(page)).pageOverflow,false);await page.screenshot({path:'tmp/stage276-qa/registration-modal-mobile.png'});await page.locator('#registry-editor-dialog .workspace-close').click();
 const ops=await qa.page(390,950);await ops.goto(qa.origin+'/assessment/');await ops.evaluate(a=>{_judge=a;loadAdminPanel();},api.actor);await ops.locator('#admin-workspace-competition option[value=MOB]').waitFor({state:'attached'});
 await ops.locator('#admin-workspace-competition').selectOption('MOB');assert.equal(await ops.locator('#admin-comp-list [data-workspace-competition]:not([hidden])').count(),1);assert.equal(await ops.locator('#admin-comp-list [data-workspace-competition=MOB]').isVisible(),true);
 await ops.locator('#admin-tab-config').click();assert.equal(await ops.locator('#admin-config-card-MOB').isVisible(),true);assert.equal(await ops.locator('#admin-config-card-KBC').isVisible(),false);
 await ops.locator('#admin-tab-run').click();await ops.locator('#admin-comp-list [data-workspace-competition=MOB] .workspace-operation-extras summary').click();assert.equal(await ops.locator('#admin-comp-list [data-workspace-competition=MOB] [data-act=mob-tech-head]').isVisible(),true);
 for(const width of [390,768,1440]){await ops.setViewportSize({width,height:1000});assert.equal((await inspectPage(ops)).pageOverflow,false);await ops.screenshot({path:'tmp/stage276-qa/operations-'+width+'.png'});}
 const home=await qa.page(390,950);await home.goto(qa.origin+'/admin/');await home.evaluate(a=>showAdmin(a),api.actor);assert.equal(await home.locator('#adminMain a.admin-card').count(),3);assert.equal((await inspectPage(home)).pageOverflow,false);await home.screenshot({path:'tmp/stage276-qa/admin-home-mobile.png'});
 for(const p of [page,ops,home]){assert.deepEqual(p.qaErrors,[]);assert.deepEqual(p.qaMissing,[]);}
 console.log('Stage276 management UX: clear competition selector and counted tabs, add/edit dialogs, explicit bulk permanent change, protected KCR, utilities, keyboard navigation, one-competition operation cards and responsive admin portal passed.');
}finally{await qa.close();api.close();}
