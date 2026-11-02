import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {auditTextContrast} from './helpers/contrast-audit.mjs';

const api=await createAllDebriefFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
const out='tmp/stage280-qa';fs.mkdirSync(out,{recursive:true});
const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),report=[];
async function check(page,label,root='body'){
 for(const width of [360,768,1440]){
  await page.setViewportSize({width,height:950});
  const info=await inspectPage(page),contrast=await auditTextContrast(page,root);
  report.push({label,width,pageOverflow:info.pageOverflow,contrast});
  assert.equal(info.pageOverflow,false,label+' horizontal overflow at '+width);
  assert.deepEqual(contrast,[],label+' text contrast at '+width);
  assert.deepEqual(info.brokenImages,[],label+' image');
  assert.deepEqual(page.qaErrors,[],label+' script');assert.deepEqual(page.qaMissing,[],label+' asset');
  if(width!==768)await page.screenshot({path:out+'/'+label+'-'+width+'.png'});
 }
}
try{
 const home=await qa.page();await home.goto(qa.origin+'/');
 assert.deepEqual(await home.locator('.home-actions a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),['/assessment/','/debriefing/','/admin/']);
 assert.equal(await home.locator('.home-competitions li').count(),7);
 await check(home,'home');
 await home.setViewportSize({width:360,height:800});
 assert.ok(await home.locator('.home-actions').evaluate(el=>el.getBoundingClientRect().bottom<800),'all three entries visible without scrolling on a typical phone');
 await home.keyboard.press('Tab');assert.equal(await home.locator('.kcl-skip-link').evaluate(el=>el===document.activeElement),true);
 await home.keyboard.press('Enter');await home.keyboard.press('Tab');assert.equal(await home.locator('.home-actions a').first().evaluate(el=>el===document.activeElement),true);
 for(const href of ['/assessment/','/debriefing/','/admin/']){
  await home.goto(qa.origin+'/');await home.locator('.home-actions a[href="'+href+'"]').click();assert.equal(new URL(home.url()).pathname,href);
 }
 for(const route of ['/assessment/','/debriefing/','/admin/','/registry/','/camera/']){
  const page=await qa.page();await page.goto(qa.origin+route);await check(page,'entry-'+route.split('/')[1]);await page.close();
 }
 const registry=await qa.page();await registry.goto(qa.origin+'/registry/');
 await registry.evaluate(a=>{actor=a;document.getElementById('loginCard').classList.add('hidden');document.getElementById('main').classList.remove('hidden');loadRegistry();},api.actor);
 await registry.locator('#comp option[value=MOB]').waitFor({state:'attached'});await registry.locator('#comp').selectOption('MOB');await registry.waitForFunction(()=>participantRows[0]?.competitionCode==='MOB');
 await check(registry,'registry');
 await registry.getByRole('button',{name:'선수·팀 추가',exact:true}).click();await check(registry,'registry-dialog','#registry-editor-dialog');
 const ops=await qa.page();await ops.goto(qa.origin+'/assessment/');await ops.evaluate(a=>{_judge=a;loadAdminPanel();},api.actor);
 await ops.locator('#admin-workspace-competition option[value=MOB]').waitFor({state:'attached'});await ops.locator('#admin-workspace-competition').selectOption('MOB');await check(ops,'operations');
 const admin=await qa.page();await admin.goto(qa.origin+'/admin/');await admin.evaluate(a=>showAdmin(a),api.actor);await check(admin,'admin-home');
 const judge=await qa.page();await judge.goto(qa.origin+'/assessment/');await judge.evaluate(a=>{_judge=a;refreshParticipantAssignmentsForActiveComp_=()=>{};},api.actor);
 for(const code of ['KBC','MOB','KCR','IKRC','MOC','KTCC','KCAC']){
  await judge.evaluate(code=>{
   _selComp={code,name:code,currentRound:'예선',isActive:true};
   if(code==='KBC')startKbc();if(code==='MOB')startMob();
   if(code==='KCR')initCuppingEval([1,2,3,4,5,6,7,8,9],'예선평가','Blending',false,false,{id:'layout-station',label:'스테이션 1',start:1,end:9});
   if(code==='IKRC')initIkrcSamples(['A-1','A-2'],{id:'layout-station',label:'스테이션 1',prefix:'A',start:1,end:2});
   if(code==='MOC')initMocTargets([1,2]);if(code==='KTCC')initKtccTargets([{num:177,teamName:'긴 팀 이름 레이아웃 확인팀'},{num:178,teamName:'두 번째 팀'}]);
   if(code==='KCAC'){startKcac();document.getElementById('kcac-num').value='177';onKcacParticipantSelected_();}
   stopRegistryLiveSync_();
  },code);
  await check(judge,'judge-'+code);
 }
 for(const c of api.cases){
  const preview=await api.rpc('getAdminDebriefPreview',c.code,c.units[0],'예선',api.actor),page=await qa.page();await page.goto(qa.origin+'/debriefing/');
  await page.waitForFunction(()=>_configs.length>0);await page.evaluate(res=>{renderResult(res);showPanel('pResult');},preview);await check(page,'result-'+c.code);await page.close();
 }
 // This layer must not change an existing PDF layout, even through variable inheritance.
 await ops.evaluate(()=>goRankingByCode('MOB','MOB','예선'));await ops.waitForFunction(()=>_ranking?.ranking?.length>0);await ops.emulateMedia({media:'print'});
 const metric=()=>ops.locator('.rank-row').first().evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {height:r.height,width:r.width,color:s.color,padding:s.padding,font:s.fontFamily};});
 const withLayer=await metric();await ops.locator('link[href*="kcl-refinement.css"]').evaluate(el=>el.disabled=true);assert.deepEqual(await metric(),withLayer,'screen styling must not alter ranking print');
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before,'visual checks cannot rewrite saved scores or comments');
 console.log('Stage280: home links/keyboard, three viewport sizes, all entry points, management/dialogs, seven judging/result screens, contrast, print and saved-data preservation passed.');
}finally{fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await qa.close();api.close();}
