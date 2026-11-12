import assert from 'node:assert/strict';
import test from 'node:test';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedIkrcFinal,ikrcFinalSubmission} from './helpers/ikrc-final-fixture.mjs';

const raw=(api,action,...args)=>api.handle({action,args}).then(r=>r.json());
const scope=station=>({scope:'station',stationId:station.id});
const ref=item=>({rowIndex:item.rowIndex,revision:item.finalRevision});

test('IKRC Seed to Cup authorization is scoped to the selected competition',async()=>{
 const api=await createRpcFixture();
 try{
  const {participants}=await seedIkrcFinal(api);
  const target={targetType:'participantId',targetValue:String(participants[0].id)};
  const opponent={targetType:'participantId',targetValue:String(participants[1].id)};
  const original=await api.rpc('updateIkrcSeedToCupResult',target,2,'원본',api.actor);
  const match=await api.rpc('saveIkrcSeedToCupMatch',{matchNo:'QA',participantA:target,participantB:opponent},api.actor);
  const register=(name,phone,access,accountType,role)=>api.rpc('upsertOperatorAccount',{name,phone,access,accountType,role},api.actor);
  await register('교차 권한 QA','01088000100','MOB','STAFF','운영진');
  await register('교차 권한 QA','01088000100','IKRC','JUDGE','센서리 심사위원');
  const judge=await api.rpc('judgeLogin','교차 권한 QA','01088000100');
  assert.equal(judge.accountType,'STAFF');
  assert.equal(judge.accountTypeMap.IKRC,'JUDGE');
  const protectedSessions=JSON.stringify(api.db.prepare("SELECT * FROM sessions WHERE kind LIKE 'IKRC_SEED_%' ORDER BY token").all());
  for(const [action,args] of [
   ['getIkrcSeedToCupConsole',[]],
   ['saveIkrcSeedToCupMatch',[{matchNo:'권한 위조',participantA:target,participantB:opponent}]],
   ['updateIkrcSeedToCupResult',[{...target,expectedSavedAt:original.result.savedAt},3,'권한 위조']],
   ['deleteIkrcSeedRecord',[{kind:'match',matchNo:'QA',expectedSavedAt:match.match.savedAt}]],
   ['deleteIkrcSeedRecord',[{...target,kind:'result',expectedSavedAt:original.result.savedAt}]]
  ]){
   const result=await raw(api,action,...args,judge);
   assert.equal(result.success,false,action);
   assert.equal(result.finalists,undefined,'blind identities must not be returned');
  }
  assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM sessions WHERE kind LIKE 'IKRC_SEED_%' ORDER BY token").all()),protectedSessions);
  await register('운영 교차 QA','01088000101','KBC','TEAMLEAD','대회팀장');
  await register('운영 교차 QA','01088000101','IKRC','STAFF','운영진');
  const staff=await api.rpc('judgeLogin','운영 교차 QA','01088000101');
  assert.equal(staff.accountType,'TEAMLEAD');
  assert.equal(staff.accountTypeMap.IKRC,'STAFF');
  assert.equal((await api.rpc('getIkrcSeedToCupConsole',staff)).finalists.length,12);
  await api.rpc('updateIkrcSeedToCupResult',{...target,expectedSavedAt:original.result.savedAt},1,'정상 운영',staff);
 }finally{api.close();}
});

test('IKRC return and resubmit keep station confirmation, comparisons and ranks in sync',async()=>{
 let concurrentEdit;
 const api=await createRpcFixture({beforeBatch(statements){
  if(!concurrentEdit||!statements[0].sql.includes('UPDATE scores SET payload_json'))return;
  const edit=concurrentEdit;concurrentEdit=null;edit();
 }});
 try{
  const {judges,stations,participants}=await seedIkrcFinal(api);
  const [a,b]=stations,manager={...api.actor,reviewScope:'manage',manageReview:true};
  for(const station of stations)for(const [i,judge] of judges.entries())await api.rpc('submitScores',ikrcFinalSubmission(judge,station,i?6+i/10:10));
  await api.rpc('updateIkrcSeedToCupResult',{targetType:'participantId',targetValue:String(participants[0].id)},3,'Seed QA',api.actor);
  for(const station of stations)await api.rpc('finalizeIkrcStationEvaluation',scope(station),judges[0]);
  const cups=station=>api.rpc('getIkrcOfficialCalibrationCupNumbers',scope(station),judges[0]);
  const comparison=()=>api.rpc('getIkrcOfficialCalibrationResultsByCup','A-1',scope(a),judges[0]);
  const rank=async unit=>(await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking.find(r=>r.unit===unit);
  assert.equal((await comparison()).finalAverage,63);
  assert.equal((await rank('A-1')).rankingScore,66);
  const bConfirmation=(await cups(b)).finalization;
  assert.ok(bConfirmation);
  const ownList=await api.rpc('getReviewList','IKRC',{...judges[5],round:'결선'});
  const original=ownList.list.find(x=>x.unit==='A-1');
  assert.ok(original);
  const id=Number(String(original.rowIndex).split(':')[0]);
  const protectedScores=JSON.stringify(api.db.prepare('SELECT * FROM scores WHERE id<>? ORDER BY id').all(id));
  const returnRequest={competitionCode:'IKRC',round:'결선',reason:'종이 평가표 대조',entries:[ref(original)]};
  await api.rpc('returnFinalEvaluations',returnRequest,manager);
  const afterReturn=await comparison();
  assert.equal(afterReturn.finalAverage,62.5,'returned 65-point score must not stay in ranking average');
  assert.equal(afterReturn.rows.length,5);
  assert.equal(afterReturn.headCount,1);
  assert.equal(afterReturn.judgeCount,4);
  assert.equal((await rank('A-1')).rankingScore,65.5);
  assert.equal((await rank('A-1')).finalized,false);
  assert.equal((await cups(a)).finalization,null);
  assert.deepEqual((await cups(b)).finalization,bConfirmation);
  const seed=await api.rpc('getIkrcSeedToCupConsole',api.actor);
  assert.equal(seed.finalists.find(p=>p.targetValue===String(participants[0].id)).sensoryRowCount,4);
  const returned=await api.rpc('getReviewList','IKRC',{...judges[5],round:'결선',returnedOnly:true});
  assert.equal(returned.list.length,1);
  await api.rpc('finalizeIkrcStationEvaluation',scope(a),judges[0]);
  const newConfirmation=(await cups(a)).finalization;
  assert.ok(newConfirmation);
  assert.equal((await raw(api,'returnFinalEvaluations',returnRequest,manager)).success,false);
  assert.deepEqual((await cups(a)).finalization,newConfirmation,'stale requests do not clear confirmation');
  const resubmission=item=>({competitionCode:'IKRC',round:'결선',entries:[{...ref(item),updates:{}}]});
  concurrentEdit=()=>{
   const payload=JSON.parse(api.db.prepare('SELECT payload_json FROM scores WHERE id=?').get(id).payload_json);
   payload.qaConcurrentEdit=true;
   api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(payload),id);
  };
  assert.equal((await raw(api,'resubmitFinalEvaluations',resubmission(returned.list[0]),judges[5])).success,false);
  assert.equal(api.db.prepare('SELECT review_status FROM scores WHERE id=?').get(id).review_status,'반려');
  assert.deepEqual((await cups(a)).finalization,newConfirmation,'failed atomic save cannot clear confirmation');
  const fresh=await api.rpc('getReviewList','IKRC',{...judges[5],round:'결선',returnedOnly:true});
  await api.rpc('resubmitFinalEvaluations',resubmission(fresh.list[0]),judges[5]);
  assert.equal((await comparison()).finalAverage,63);
  assert.equal((await comparison()).rows.length,6);
  assert.equal((await rank('A-1')).rankingScore,66);
  assert.equal((await cups(a)).finalization,null,'resubmitting also invalidates a new confirmation');
  assert.deepEqual((await cups(b)).finalization,bConfirmation);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores WHERE id<>? ORDER BY id').all(id)),protectedScores);
 }finally{api.close();}
});

test('an already-open judge page cannot create new official scores after a contest closes',async()=>{
 const api=await createRpcFixture();
 try{
  const {judges,stations}=await seedIkrcFinal(api);
  const saved={...ikrcFinalSubmission(judges[1],stations[0]),clientSubmissionId:'stage283-already-saved'};
  await api.rpc('submitScores',saved);
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  await api.rpc('updateCompetitionAdminSettings',{code:'IKRC',currentRound:'결선',isActive:false},api.actor);
  assert.equal((await api.rpc('submitScores',saved)).idempotent,true,'a receipt for an existing save remains valid');
  const blocked=await raw(api,'submitScores',ikrcFinalSubmission(judges[2],stations[0]));
  assert.equal(blocked.success,false);
  assert.match(blocked.message,/닫혀/);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before);
 }finally{api.close();}
});
