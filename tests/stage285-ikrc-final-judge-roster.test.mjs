import assert from 'node:assert/strict';
import test from 'node:test';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture} from './helpers/browser-fixture.mjs';
import {seedIkrcFinal,ikrcFinalSubmission} from './helpers/ikrc-final-fixture.mjs';

const token=actor=>({judgeToken:actor.judgeToken});
const raw=(api,action,...args)=>api.handle({action,args}).then(response=>response.json());
const setting='ikrc_final_judge_roster';
function assignRoster(api,judges){
 const ids=judges.map(judge=>judge.operatorRows.find(row=>row.access==='IKRC').rowIndex);
 const roster={headOperatorId:ids[0],sensoryOperatorIds:ids.slice(1)};
 api.db.prepare("INSERT INTO system_settings(setting_key,setting_value,updated_at) VALUES(?,?,?)")
  .run(setting,JSON.stringify(roster),new Date().toISOString());
 return roster;
}
async function registerAdditionalJudge(api,head=false,crossCompetition=false){
 const name=head?'예선 헤드 QA':'예선 센서리 QA',phone=head?'01088120001':'01088120002';
 await api.rpc('upsertOperatorAccount',{name,phone,accountType:'JUDGE',role:head?'센서리 헤드 심사위원':'센서리 심사위원',access:crossCompetition?'IKRC,KBC':'IKRC'},api.actor);
 return api.rpc('judgeLogin',name,phone);
}

test('IKRC official finals require the six assigned accounts in both stations',async()=>{
 const api=await createRpcFixture();
 try{
  const {judges,stations,participants}=await seedIkrcFinal(api);
  const extraSensory=await registerAdditionalJudge(api,false,true),extraHead=await registerAdditionalJudge(api,true);
  // These are already-issued sessions; restrictions must take effect without relogin.
  await api.rpc('checkIkrcFinalJudgeAccess',token(extraSensory));
  const savedOperators=JSON.stringify(api.db.prepare('SELECT * FROM operators ORDER BY id').all());
  const roster=assignRoster(api,judges);
  const configs=(await api.rpc('getConfig')).configs;
  assert.deepEqual(configs.filter(c=>c.ikrcFinalRosterRestricted).map(c=>c.code),['IKRC']);
  assert.ok(!JSON.stringify(configs).includes('OperatorId'),'public config must not reveal the roster IDs');
  assert.equal((await raw(api,'checkIkrcFinalJudgeAccess',judges[0].name)).success,false);
  assert.deepEqual(await api.rpc('checkIkrcFinalJudgeAccess',token(api.actor)),{success:true,previewOnly:true});

  for(const outsider of [extraHead,extraSensory,api.actor]){
   if(outsider!==api.actor)assert.equal((await raw(api,'checkIkrcFinalJudgeAccess',{...token(outsider),operatorRows:judges[0].operatorRows})).errorCode,'IKRC_FINAL_JUDGE_NOT_ASSIGNED');
   for(const station of stations){
    const payload={...ikrcFinalSubmission(outsider,station,9.6),judgeName:judges[0].name,judgeRole:judges[0].role,operatorRows:judges[0].operatorRows};
    assert.equal((await raw(api,'submitScores',payload)).errorCode,'IKRC_FINAL_JUDGE_NOT_ASSIGNED');
    delete payload.round;
    assert.equal((await raw(api,'submitWithSignature',payload,'QA signature')).errorCode,'IKRC_FINAL_JUDGE_NOT_ASSIGNED');
   }
  }
  assert.equal(api.db.prepare('SELECT COUNT(*) n FROM scores').get().n,0,'blocked scores must not be saved');
  assert.equal((await raw(api,'resubmitFinalEvaluations',{competitionCode:'IKRC',round:'결선',entries:[{rowIndex:1,updates:{}}]},extraSensory)).errorCode,'IKRC_FINAL_JUDGE_NOT_ASSIGNED');

  for(const [i,judge] of judges.entries()){
   await api.rpc('checkIkrcFinalJudgeAccess',token(judge));
   for(const station of stations){
    const payload={...ikrcFinalSubmission(judge,station,i?6:10),clientSubmissionId:'qa-ikrc-'+i+'-'+station.id};
    assert.equal((await api.rpc('submitScores',payload)).inserted,6);
    if(i===0)assert.equal((await api.rpc('submitScores',payload)).idempotent,true);
   }
  }
  await api.rpc('updateIkrcSeedToCupResult',{targetType:'participantId',targetValue:String(participants[0].id)},3,'검수 QA',api.actor);
  const initial=(await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking;
  assert.equal(initial.length,12);
  for(const row of initial){
   assert.equal(row.headCount,1);
   assert.equal(row.sensoryCount,5);
   assert.equal(row.rankingScore,row.unit==='A-1'?63:60);
  }
  const ownList=await api.rpc('getReviewList','IKRC',{...judges[1],round:'결선'});
  const saved=ownList.list.find(row=>row.unit==='A-1');
  const correction=row=>({competitionCode:'IKRC',round:'결선',entries:[{rowIndex:row.rowIndex,revision:row.finalRevision,updates:{}}]});
  await api.rpc('returnFinalEvaluations',{...correction(saved),reason:'검수 QA'},api.actor);
  const returned=(await api.rpc('getReviewList','IKRC',{...judges[1],round:'결선',returnedOnly:true})).list[0];
  await api.rpc('resubmitFinalEvaluations',correction(returned),judges[1]);
  assert.equal((await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking.find(row=>row.unit==='A-1').rankingScore,63);

  await api.rpc('submitScores',ikrcFinalSubmission(extraSensory,stations[0],9.6,'IKRC 스테이션 켈리브레이션'));
  const afterCalibration=(await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking;
  assert.ok(afterCalibration.every(row=>row.sensoryCount===5&&row.rankingScore===(row.unit==='A-1'?63:60)));
  await api.rpc('updateCompetitionAdminSettings',{code:'IKRC',currentRound:'예선'},api.actor);
  assert.equal((await api.rpc('submitScores',{...ikrcFinalSubmission(extraSensory,stations[0],6),round:'예선'})).inserted,6);
  await api.rpc('updateCompetitionAdminSettings',{code:'KBC',currentRound:'예선',isActive:true},api.actor);
  assert.equal((await api.rpc('submitScores',{...token(extraSensory),competitionCode:'KBC',round:'예선',mode:'judge',rows:[{data:['1'],extraFields:{총점:30}}]})).inserted,1);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM operators ORDER BY id').all()),savedOperators);

  await api.rpc('updateCompetitionAdminSettings',{code:'IKRC',currentRound:'결선'},api.actor);
  const updateSetting=api.db.prepare('UPDATE system_settings SET setting_value=? WHERE setting_key=?');
  updateSetting.run(JSON.stringify({...roster,sensoryOperatorIds:[1,1,1,1,1]}),setting);
  assert.equal((await raw(api,'checkIkrcFinalJudgeAccess',token(judges[0]))).errorCode,'IKRC_FINAL_ROSTER_INVALID');
 }finally{api.close();}
});

test('the IKRC final entry checks the roster before opening A/B station selection',async()=>{
 const api=await createRpcFixture();
 const qa=await createBrowserFixture({apiHandler:api.handle});
 try{
  const {judges}=await seedIkrcFinal(api);
  const outsider=await registerAdditionalJudge(api);
  assignRoster(api,judges);
  const page=await qa.page(390,900);
  await page.goto(qa.origin+'/assessment/');
  const enter=async actor=>{
   await page.evaluate(a=>{_judge=a;_selComp=null;loadSelectPanel();},actor);
   await page.waitForFunction(()=>_selComp?.code==='IKRC'&&_selComp.ikrcFinalRosterRestricted&&!document.getElementById('overlay').classList.contains('active'));
   await page.locator('#btn-eval').click();
  };
  await enter(outsider);
  await page.locator('#toast.err').filter({hasText:'지정된 헤드 1명과 센서리 5명'}).waitFor();
  assert.equal(await page.locator('#pIkrcSetup').isVisible(),false);
  await enter(judges[0]);
  await page.locator('#pIkrcSetup.active').waitFor();
  const stations=page.locator('#ikrc-station-grid button');
  assert.equal(await stations.count(),2);
  await stations.filter({hasText:'B조'}).click();
  await page.locator('#evalIkrc.active').waitFor();
  assert.deepEqual(page.qaErrors,[]);
  assert.equal(api.db.prepare('SELECT COUNT(*) n FROM scores').get().n,0);
 }finally{await qa.close();api.close();}
});
