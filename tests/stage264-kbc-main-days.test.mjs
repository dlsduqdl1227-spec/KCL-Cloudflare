import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';

export async function seedKbcMain(api){
  await api.rpc('updateCompetitionAdminSettings',{code:'KBC',currentRound:'본선',isActive:true},api.actor);
  for(let i=1;i<=8;i++)await api.rpc('upsertParticipant',{competitionCode:'KBC',uniqueNo:String(i),mainCupNo:String(i),name:'본선 선수 '+i,phone:'0108800000'+i,extra:{roundSchedules:{본선:{day:i<=4?'1':'2',date:i<=4?'2026-11-01':'2026-11-02'}},memo:'보존'}},api.actor);
  for(let i=1;i<=8;i++){
    const total=30+i;
    await api.rpc('submitScores',{competitionCode:'KBC',round:'본선',judgeToken:api.actor.judgeToken,judgeName:api.actor.name,mode:'대회평가',role:'헤드 심사위원',rows:[{extraFields:{'참가자번호':String(i),'선수명':'본선 선수 '+i,'총점':total,'종합코멘트':'본선 의견 '+i,'Espresso Total':total/2}}]});
  }
}
if(process.argv[1]?.endsWith('stage264-kbc-main-days.test.mjs')){
 const api=await createRpcFixture();
 try{
  await seedKbcMain(api);
  const list=await api.rpc('getParticipantAssignments','KBC',api.actor);
  assert.equal(list.assignments.length,8);
  assert.deepEqual(list.assignments.map(p=>p.operatingDay),['1','1','1','1','2','2','2','2']);
  const rank=await api.rpc('getRanking','KBC',api.actor,'본선');
  assert.deepEqual(rank.ranking.map(row=>row.unit),['8','7','6','5','4','3','2','1']);
  assert.deepEqual(rank.ranking.map(row=>row.operatingDay),['2','2','2','2','1','1','1','1']);
  assert.equal((await api.rpc('getRanking','KBC',api.actor,'결선')).ranking.length,0);
  let plan=await api.rpc('getKbcFinalistPlan',api.actor);
  assert.equal(plan.ready,true,plan.message);
  assert.deepEqual(plan.candidates.map(row=>row.mainNumber),['8','7','6','5','4','3']);
  const forbidden=await(await api.handle({action:'getKbcFinalistPlan',args:[{}]})).json();assert.equal(forbidden.success,false);
  await api.rpc('upsertParticipant',{competitionCode:'KBC',uniqueNo:'9',mainCupNo:'9',name:'아직 평가 전',extra:{roundSchedules:{본선:{day:'2'}}}},api.actor);
  assert.equal((await api.rpc('getKbcFinalistPlan',api.actor)).ready,false,'do not promote after only part of the main field has been evaluated');
  const ninth=api.db.prepare("SELECT id FROM participants WHERE main_cup_no='9'").get();await api.rpc('deleteParticipant',ninth.id,api.actor);
  const tieRow=api.db.prepare("SELECT id,payload_json FROM scores WHERE unit='2' AND round='본선'").get();
  const tied=JSON.parse(tieRow.payload_json);tied.rows[0].extraFields['Espresso Total']=16.5;
  api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(tied),tieRow.id);
  const tiePlan=await api.rpc('getKbcFinalistPlan',api.actor);assert.equal(tiePlan.ready,false);assert.match(tiePlan.message,/동점/);
  api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(tieRow.payload_json,tieRow.id);
  plan=await api.rpc('getKbcFinalistPlan',api.actor);
  const scores=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const participants=api.db.prepare('SELECT * FROM participants ORDER BY id').all();
  api.db.prepare("UPDATE participants SET updated_at='concurrent' WHERE id=1").run();
  const stale=await(await api.handle({action:'assignKbcFinalists',args:[{revision:plan.revision},api.actor]})).json();
  assert.equal(stale.success,false);
  assert.equal(api.db.prepare("SELECT COUNT(*) n FROM participants WHERE final_cup_no<>''").get().n,0);
  plan=await api.rpc('getKbcFinalistPlan',api.actor);
  await api.rpc('assignKbcFinalists',{revision:plan.revision},api.actor);
  assert.equal((await api.rpc('getKbcFinalistPlan',api.actor)).ready,false,'existing final assignments are preserved');
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),scores,'advancing never imports main scores into finals');
  const after=api.db.prepare('SELECT * FROM participants ORDER BY id').all();
  for(const row of after){const old=participants.find(p=>p.id===row.id);assert.equal(row.main_cup_no,old.main_cup_no);assert.deepEqual(JSON.parse(row.extra_json).roundSchedules.본선,JSON.parse(old.extra_json).roundSchedules.본선);}
  await api.rpc('updateCompetitionAdminSettings',{code:'KBC',currentRound:'결선'},api.actor);
  const final=await api.rpc('getParticipantAssignments','KBC',api.actor);
  assert.deepEqual(final.assignments.map(p=>p.name),['본선 선수 8','본선 선수 7','본선 선수 6','본선 선수 5','본선 선수 4','본선 선수 3']);
  assert.ok(final.assignments.every(p=>p.operatingDay==='1'));
  assert.equal((await api.rpc('getRanking','KBC',api.actor,'결선')).ranking.length,0);
  await api.rpc('submitScores',{competitionCode:'KBC',round:'결선',judgeToken:api.actor.judgeToken,judgeName:api.actor.name,mode:'대회평가',role:'헤드 심사위원',rows:[{extraFields:{'참가자번호':'1','총점':22,'종합코멘트':'독립적인 결선 의견'}}]});
  assert.equal((await api.rpc('getRanking','KBC',api.actor,'결선')).ranking[0].score,22);
  assert.deepEqual((await api.rpc('getRanking','KBC',api.actor,'본선')).ranking.map(r=>r.score),rank.ranking.map(r=>r.score));
  console.log('Stage264 KBC day assignments, combined ranking, reviewed top six advancement, stale-plan rejection, original data preservation and independent finals passed.');
 }finally{api.close();}
}
