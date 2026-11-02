import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {auditTextContrast} from './helpers/contrast-audit.mjs';
import {seedKcrStations} from './helpers/kcr-station-fixture.mjs';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle}),reports=[];
fs.mkdirSync('tmp/stage278-qa',{recursive:true});
async function check(page,label,root='body'){const viewport=page.viewportSize();for(const width of [390,1440]){await page.setViewportSize({...viewport,width});reports.push({label:label+'-'+width,failures:await auditTextContrast(page,root)});}await page.setViewportSize(viewport);assert.deepEqual(page.qaErrors,[],label);}
try{
 await seedKcrStations(api);
 for(const route of ['/','/camera/','/debriefing/']){const p=await qa.page(390,950);await p.goto(qa.origin+route);await check(p,'public-'+route);await p.close();}
 for(const code of ['KBC','KTCC','MOC','MOB','IKRC','KCAC'])for(const n of [1,2])await api.rpc('upsertParticipant',{competitionCode:code,name:'가독성 선수 '+n,teamName:'가독성 팀 '+n,affiliation:'검수 소속',phone:'0107700000'+n,uniqueNo:String(n),prelimCupNo:String(n),mainCupNo:String(n),finalCupNo:String(n)},api.actor);
 const ops=await qa.page(390,950);await ops.goto(qa.origin+'/assessment/');await check(ops,'judge-login');await ops.evaluate(a=>{_judge=a;loadAdminPanel();},api.actor);await ops.locator('#admin-workspace-competition option[value=KCR]').waitFor({state:'attached'});
 await ops.evaluate(()=>{clearTimeout(_healthRefreshTimer);_healthLoading=false;});
 for(const [state,extra]of [['ok',{}],['warning',{errors:1}],['error',{resourceErrors:1}],['unknown',{success:false,available:false}]]){
  await ops.evaluate(extra=>renderOperationalHealth_(Object.assign({success:true,available:true,requests:100,errors:0,resourceErrors:0,cpuP50Ms:3.21,cpuP99Ms:8.42,updatedAt:new Date().toISOString(),windowStart:new Date().toISOString(),windowEnd:new Date().toISOString()},extra)),extra);
  const details=ops.locator('.server-health-details');if(await details.count())await details.evaluate(el=>el.open=true);
  await check(ops,'health-'+state,'#server-health-card');await ops.locator('#server-health-card').screenshot({path:'tmp/stage278-qa/health-'+state+'.png'});
 }
 await ops.locator('.workspace-common-settings').evaluate(el=>el.open=true);await check(ops,'admin-security','#pAdmin');
 await ops.locator('#admin-tab-config').click();
 for(const code of ['KBC','KTCC','MOC','MOB','KCR','IKRC','KCAC']){await ops.locator('#admin-workspace-competition').selectOption(code);await ops.locator('#admin-config-list details').evaluateAll(ns=>ns.forEach(n=>n.open=true));await check(ops,'config-'+code,'#pAdmin');}
 const registry=await qa.page(390,950);await registry.goto(qa.origin+'/registry/');await check(registry,'registry-login');await registry.evaluate(a=>{actor=a;document.getElementById('loginCard').classList.add('hidden');document.getElementById('main').classList.remove('hidden');loadRegistry();},api.actor);await registry.locator('#comp option[value=MOB]').waitFor({state:'attached'});await registry.locator('#comp').selectOption('MOB');await registry.waitForFunction(()=>participantRows[0]?.competitionCode==='MOB');
 for(const target of ['players','operators','admins']){await registry.locator('#tabbtn-'+target).click();await check(registry,'registry-'+target);await registry.locator('[data-registry-create="'+({players:'participants',operators:'operators',admins:'admins'}[target])+'"]').click();await check(registry,'editor-'+target,'#registry-editor-dialog');await registry.locator('#registry-editor-dialog .workspace-close').click();}
 await registry.locator('#tabbtn-players').click();for(const name of ['엑셀 등록·백업','데이터 관리']){await registry.getByRole('button',{name,exact:true}).click();await check(registry,'utility-'+name,'#registry-utility-dialog');await registry.locator('#registry-utility-dialog .workspace-close').click();}
 await registry.locator('#participantSelectAll').check();await registry.locator('#registry-tools-participants [data-registry-action=edit]').click();await registry.locator('.registry-individual-fields').filter({has:registry.locator('[data-registry-row]')}).evaluate(el=>el.open=true);await check(registry,'bulk-editor','#registry-bulk-dialog');await registry.locator('#registry-bulk-dialog header button').click();
 const home=await qa.page(390,950);await home.goto(qa.origin+'/admin/');await check(home,'admin-login');await home.evaluate(a=>showAdmin(a),api.actor);await home.locator('.admin-system-details').evaluate(el=>el.open=true);await check(home,'admin-home');
 const judge=await qa.page(390,950);await judge.goto(qa.origin+'/assessment/');await judge.evaluate(a=>{_judge=a;refreshParticipantAssignmentsForActiveComp_=()=>{};},api.actor);
 for(const code of ['KBC','MOB','KCR','IKRC','MOC','KTCC','KCAC'])for(const round of ['예선','결선']){
  await judge.evaluate(({code,round})=>{hideOverlay();_selComp={code,name:code,currentRound:round,isActive:true};if(code==='KBC')startKbc();if(code==='MOB')startMob();if(code==='KCR')initCuppingEval([1,2],round+'평가','Blending',round==='결선',false,{id:'contrast-station',label:'스테이션 1',start:1,end:2});if(code==='IKRC')initIkrcSamples(['A-1','A-2'],{id:'contrast-station',label:'스테이션 1',prefix:'A',start:1,end:2});if(code==='MOC')initMocTargets([1,2]);if(code==='KTCC')initKtccTargets([{num:1,teamName:'검수 팀 1'},{num:2,teamName:'검수 팀 2'}]);if(code==='KCAC'){startKcac(round==='결선'?'pattern':'');document.getElementById('kcac-num').value='1';onKcacParticipantSelected_();}}, {code,round});
  // These are manually selected visual scenarios, not live competition-config transitions.
  await judge.evaluate(()=>stopRegistryLiveSync_());
  // Let the form's delayed draft restoration settle before opening a tag dialog.
  // These visual scenarios switch competition/round directly, faster than normal navigation.
  await judge.waitForTimeout(300);
  await check(judge,'evaluation-'+code+'-'+round);
  if(code==='KCAC'&&round==='예선'){await judge.locator('.kcac-milk-choice-btn').filter({hasText:'FAST Rosetta'}).click();await check(judge,'kcac-fast');await judge.locator('#kcac-cup-nav .cup-btn').nth(1).click();await check(judge,'kcac-slow');}
  const tags=judge.locator('.kcl-tag-launch:visible');if(await tags.count()){await tags.first().click();await check(judge,'tags-'+code+'-'+round,'#kcl-smart-tag-picker');const option=judge.locator('.kcl-tag-picker-option:visible').first();if(await option.count()){await option.click();await check(judge,'selected-tag-'+code+'-'+round,'#kcl-smart-tag-picker');}await judge.evaluate(()=>document.querySelector('.kcl-tag-picker-done')?.click());assert.equal(await judge.locator('#kcl-smart-tag-picker').isVisible(),false);}
  if(code==='KCAC'&&round==='예선'){await judge.locator('#kcac-cup-nav').getByText('종합코멘트',{exact:true}).click();await check(judge,'kcac-comment');}
 }
 for(const area of ['sensory-regular','sensory-oat']){await judge.evaluate(area=>{_selComp={code:'KCAC',name:'KCAC',currentRound:'결선',isActive:true};startKcac(area);document.getElementById('kcac-num').value='1';onKcacParticipantSelected_();},area);await check(judge,'kcac-final-'+area);}
 const debriefApi=await createAllDebriefFixture({source:fs.readFileSync('functions/api/rpc.js','utf8')+'\n// Separate visual QA fixture module.'}),debriefQa=await createBrowserFixture({apiHandler:debriefApi.handle});
 try{
  const before=JSON.stringify(debriefApi.db.prepare('SELECT * FROM scores ORDER BY id').all());
  for(const c of debriefApi.cases){
   const preview=await debriefApi.rpc('getAdminDebriefPreview',c.code,c.units[0],'예선',debriefApi.actor);
   const p=await debriefQa.page(390,950);await p.goto(debriefQa.origin+'/debriefing/');await p.waitForFunction(()=>_configs.length>0);await p.evaluate(res=>{renderResult(res);showPanel('pResult');},preview);await check(p,'debrief-'+c.code);await p.close();
  }
  const p=await debriefQa.page(390,950);await p.goto(debriefQa.origin+'/assessment/');await p.evaluate(a=>{_judge=Object.assign({},a,{reviewScope:'manage',manageReview:true});goReviewByCode('KCAC','KCAC','pAdmin');},debriefApi.actor);await p.locator('#review-list .review-edit-btn').first().waitFor();await check(p,'review-list');await p.locator('#review-list .review-edit-btn').first().click();await p.locator('#review-edit-fields').waitFor({state:'visible'});await check(p,'review-edit');
  await p.evaluate(()=>{hideOverlay();goRankingByCode('KCAC','KCAC','예선');});await p.waitForFunction(()=>_ranking?.ranking?.length>0);await check(p,'ranking');await p.emulateMedia({media:'print'});
  const printColor=await p.locator('.rank-num').first().evaluate(el=>getComputedStyle(el).color);await p.locator('link[href*="kcl-appearance.css"]').evaluate(el=>el.disabled=true);assert.equal(await p.locator('.rank-num').first().evaluate(el=>getComputedStyle(el).color),printColor,'screen appearance must not change the existing print/PDF text colors');reports.push({label:'ranking-print',failures:await auditTextContrast(p,'#ranking-list')});await p.close();
  assert.equal(JSON.stringify(debriefApi.db.prepare('SELECT * FROM scores ORDER BY id').all()),before,'opening preview/review/ranking views must preserve every score and comment');
 }finally{await debriefQa.close();debriefApi.close();}
 for(const width of [390,1440]){await registry.setViewportSize({width,height:950});assert.equal((await inspectPage(registry)).pageOverflow,false);await registry.screenshot({path:'tmp/stage278-qa/registry-'+width+'.png'});await ops.setViewportSize({width,height:950});await ops.locator('#admin-tab-run').click();await ops.screenshot({path:'tmp/stage278-qa/operations-'+width+'.png'});}
 fs.writeFileSync('tmp/stage278-qa/contrast.json',JSON.stringify(reports,null,2));const failures=reports.filter(r=>r.failures.length);console.log(JSON.stringify(failures.map(r=>({label:r.label,count:r.failures.length,first:r.failures.slice(0,3)})),null,2));assert.equal(failures.length,0,'Rendered text contrast report: tmp/stage278-qa/contrast.json');
 console.log('Stage278 dark appearance: admin, registry, expanded health/security/settings/dialogs and seven competition judging forms pass rendered text contrast and responsive checks.');
}finally{await qa.close();api.close();}
