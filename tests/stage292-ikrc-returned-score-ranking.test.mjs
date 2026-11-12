import assert from 'node:assert/strict';
import test from 'node:test';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedIkrcFinal,ikrcFinalSubmission} from './helpers/ikrc-final-fixture.mjs';

const flavor='Flavor(플레이버) ×3';
const raw=(api,action,...args)=>api.handle({action,args}).then(r=>r.json());
async function setup(api,multi=false){
  const data=await seedIkrcFinal(api);
  const ids=data.judges.map(j=>j.operatorRows.find(r=>r.access==='IKRC').rowIndex);
  api.db.prepare('INSERT INTO system_settings(setting_key,setting_value,updated_at) VALUES(?,?,?)').run('ikrc_final_judge_roster',JSON.stringify({headOperatorId:ids[0],sensoryOperatorIds:ids.slice(1)}),new Date().toISOString());
  for(let i=0;i<data.judges.length;i++)await api.rpc('submitScores',ikrcFinalSubmission(data.judges[i],data.stations[0],i?6:10));
  if(multi){
    const rows=api.db.prepare("SELECT * FROM scores WHERE competition_code='IKRC' AND judge_name=? ORDER BY id").all(data.judges[1].name);
    const payload=JSON.parse(rows[0].payload_json);payload.rows=rows.map(r=>JSON.parse(r.payload_json).rows[0]);
    payload.extraFields={[flavor]:6,'Clean Cup(클린컵) ×2':6,'Sweetness(스윗니스) ×2':6,'Acidity(산미)':6,'Mouthfeel(마우스필) ×2':6};
    api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(payload),rows[0].id);
    for(const r of rows.slice(1))api.db.prepare('DELETE FROM scores WHERE id=?').run(r.id);
  }
  return data;
}
async function review(api,actor){return api.rpc('getReviewList','IKRC',{judgeToken:actor.judgeToken,round:'결선',reviewScope:actor===api.actor?'manage':'own'});}
async function ranked(api){return (await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking;}
async function returnRows(api,items){return api.rpc('returnFinalEvaluations',{competitionCode:'IKRC',round:'결선',reason:'종이 평가표와 재대조',entries:items.map(r=>({rowIndex:r.rowIndex,revision:r.finalRevision}))},{judgeToken:api.actor.judgeToken});}

for(const multi of [false,true])test('IKRC return and resubmit updates ranking for '+(multi?'legacy multi-cup':'individual-cup')+' records',async()=>{
  const api=await createRpcFixture();
  try{
    const {judges,participants}=await setup(api,multi);
    await api.rpc('updateIkrcSeedToCupResult',{targetType:'participantId',targetValue:String(participants[0].id),expectedSavedAt:''},3,'QA seed',api.actor);
    const before=await review(api,api.actor),target=before.list.filter(r=>r.judgeName===judges[1].name);
    assert.equal(target.length,6);await returnRows(api,target);
    assert.equal((await ranked(api)).find(r=>r.unit==='A-1').confirmedJudgeCount,4);
    const returned=await review(api,judges[1]),items=returned.list.filter(r=>r.status==='반려');assert.equal(items.length,6);
    const col=returned.headers.indexOf(flavor);assert.ok(col>=0);
    const entries=items.map(r=>({rowIndex:r.rowIndex,revision:r.finalRevision,updates:r.unit==='A-1'?{[col]:9}:r.unit==='A-2'?{[col]:8}:{}}));
    const otherBefore=JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE competition_code='IKRC' AND judge_name<>? ORDER BY id").all(judges[1].name));
    const saved=await raw(api,'resubmitFinalEvaluations',{competitionCode:'IKRC',round:'결선',entries},{judgeToken:judges[1].judgeToken});
    assert.equal(saved.success,true,saved.message);
    const ranks=await ranked(api),a=ranks.find(r=>r.unit==='A-1'),b=ranks.find(r=>r.unit==='A-2'),untouched=ranks.find(r=>r.unit==='A-3');
    assert.equal(a.confirmedJudgeCount,5);assert.equal(a.avgScore,61.8);assert.equal(a.rankingScore,64.8);assert.equal(b.avgScore,61.2);assert.equal(untouched.avgScore,60);
    const after=await review(api,judges[1]),cup=after.list.find(r=>r.unit==='A-1');assert.equal(cup[flavor],9);assert.equal(cup['총점'],69);assert.notEqual(cup.status,'반려');
    const detail=await api.rpc('getRankingDetail','IKRC','A-1','결선',api.actor);assert.equal(detail.avgScore,61.8);assert.equal(detail.totalScore,64.8);
    const preview=await api.rpc('getAdminDebriefPreview','IKRC','A-1','결선',api.actor);assert.equal(preview.rankInfo.avgScore,61.8);assert.equal(preview.rankInfo.rankingScore,64.8);
    assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE competition_code='IKRC' AND judge_name<>? ORDER BY id").all(judges[1].name)),otherBefore);
    assert.ok(api.db.prepare("SELECT payload_json FROM scores WHERE competition_code='IKRC' AND judge_name=?").all(judges[1].name).every(r=>JSON.parse(r.payload_json).finalReview.history.some(h=>h.action==='resubmit')));
  }finally{api.close();}
});
