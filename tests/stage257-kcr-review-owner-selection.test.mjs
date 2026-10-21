import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrStations,stationSubmission} from './helpers/kcr-station-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
const request=async(action,...args)=>(await api.handle({action,args})).json();
try{
 const {stations,judges,lead}=await seedKcrStations(api);
 await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name:'다른 KCR 헤드',phone:'01088770004',access:'KCR',role:'센서리 헤드 심사위원'},api.actor);
 const otherHead=await api.rpc('judgeLogin','다른 KCR 헤드','01088770004');
 // The same person leads another competition; that must not grant KCR manage access.
 await api.rpc('upsertOperatorAccount',{accountType:'TEAMLEAD',name:judges[0].name,phone:'01088770000',access:'MOC',role:'대회팀장'},api.actor);
 const head=await api.rpc('judgeLogin',judges[0].name,'01088770000');
 await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'결선',isActive:true},api.actor);
 for(const actor of [head,otherHead,judges[1]])for(const station of stations.slice(1))await api.rpc('submitScores',{...stationSubmission(actor,station,21),round:'결선'});
 const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
 const args={...head,round:'결선',reviewScope:'manage',manageReview:true};
 const own=await api.rpc('getReviewList','KCR',args);
 assert.equal(own.ownOnly,true);assert.equal(own.list.length,4);
 assert.ok(own.list.every(r=>r['심사위원명']===head.name),'head cannot expand own list by claiming manage scope');
 const admin=await api.rpc('getReviewList','KCR',{...api.actor,round:'결선',reviewScope:'manage'});
 const target=admin.list.find(r=>r['심사위원명']===otherHead.name);
 const denied=await request('resubmitFinalEvaluations',{competitionCode:'KCR',round:'결선',entries:[{rowIndex:target.rowIndex,revision:target.finalRevision,updates:{}}]},args);
 assert.equal(denied.success,false,'head cannot edit another head');
 for(const actor of [api.actor,lead])assert.equal((await api.rpc('getReviewList','KCR',{...actor,round:'결선',reviewScope:'manage'})).list.length,12,'authorized managers retain all evaluations');
 const config=(await api.rpc('getConfig')).configs;
 for(const width of [360,768,1440]){
  const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');
  await page.evaluate(({head,config})=>{_judge=head;_configs=config;_selComp=config.find(c=>c.code==='KCR');hideOverlay();goReviewByCode('KCR','KCR','pTeam');},{head,config});
  await page.locator('#kcr-review-station').waitFor();
  assert.equal(await page.locator('#kcr-review-station option').count(),2);
  assert.equal(await page.locator('#kcr-review-unit option').count(),2);
  assert.equal(await page.locator('#kcr-review-submissions .review-item').count(),1);
  assert.doesNotMatch(await page.locator('#review-list').innerText(),/다른 KCR 헤드|KCR QA 센서리 심사위원/);
  await page.locator('#kcr-review-station').selectOption({label:'결선 · 스테이션 3'});
  await page.locator('#kcr-review-unit').selectOption('4');
  await page.locator('.review-edit-btn').click();
  assert.equal(await page.evaluate(()=>_reviewState.current.unit),'4');
  assert.equal(await page.evaluate(()=>_reviewState.current['심사위원명']),head.name);
  await page.evaluate(()=>backToReviewList());
  await page.locator('#kcr-review-unit').waitFor();assert.equal(await page.locator('#kcr-review-unit').inputValue(),'4');
  await page.locator('#review-list-refresh').click();await page.waitForFunction(()=>!document.getElementById('review-list-refresh').disabled);
  assert.equal(await page.locator('#kcr-review-unit').inputValue(),'4','refresh retains cup selection');
  assert.equal((await inspectPage(page)).pageOverflow,false);
  assert.deepEqual(page.qaErrors,[]);
  await page.close();
 }
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before,'viewing, selecting and ownership checks change no records');
 console.log('Stage257 own-only head/multirole permissions, blocked peer edits, manager access, two-station cup selection/refresh and unchanged records passed at 360/768/1440px.');
}finally{await qa.close();api.close();}
