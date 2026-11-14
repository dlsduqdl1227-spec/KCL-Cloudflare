import assert from 'node:assert/strict';
import {createKtccStageFixture} from './helpers/ktcc-stage-fixture.mjs';
const api=await createKtccStageFixture();
try{
  const snapshot=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const query=async(stage,round='결선',code='KTCC',actor=api.actors.lead)=>api.rpc('getRanking',code,actor,round,stage);
  const all=await query(''),quarter=await query('8강'),semi=await query('4강'),final=await query('결승');
  assert.equal(all.ranking.filter(r=>r.unit==='1').length,1,'overall remains latest-per-team, never a cross-stage sum');
  assert.equal(all.ranking.find(r=>r.unit==='1').score,8);assert.equal(all.ranking.find(r=>r.unit==='1').ktccStage,'결승');
  assert.equal(quarter.selectedKtccStage,'8강');assert.equal(quarter.ranking.length,2);assert.equal(quarter.ranking.find(r=>r.unit==='1').score,11);
  assert.equal(quarter.ranking.find(r=>r.unit==='1').ktccHiddenMission.points,4);
  assert.equal(semi.ranking.length,1);assert.equal(semi.ranking[0].score,6);assert.equal(semi.ranking[0].ktccHiddenMission,undefined);
  assert.equal(final.ranking.length,1);assert.equal(final.ranking[0].score,8);
  assert.equal((await query('순위결정')).ranking.length,0,'empty stage never falls back to other matches');
  assert.equal((await query('미지정')).ranking[0].score,6);assert.equal((await query('기타')).ranking[0].score,7);
  assert.equal(all.ktccStageCounts['8강'],2);assert.equal(all.ktccStageCounts['미지정'],1);assert.equal(all.ktccStageCounts['기타'],1);
  const prelim=await query('','예선');assert.ok(prelim.ranking.every(r=>r.round==='예선'));
  for(const [stage,round,code,actor]of [['16강','결선','KTCC',api.actors.admin],['8강','예선','KTCC',api.actors.admin],['8강','결선','MOC',api.actors.admin],['8강','결선','KTCC',api.actors.head]])
    assert.equal((await api.raw('getRanking',code,actor,round,stage)).success,false);
  const detail=await api.rpc('getRankingDetail','KTCC','1','결선',api.actors.lead,'8강');
  assert.equal(detail.selectedKtccStage,'8강');assert.equal(detail.totalScore,11);assert.equal(detail.rows.length,1);assert.equal(detail.rows[0].rowIndex,api.quarterId);
  assert.equal(detail.rows[0]['토너먼트 단계'],'8강');
  const empty=await api.rpc('getRankingDetail','KTCC','1','결선',api.actors.lead,'순위결정');assert.deepEqual(empty.rows,[]);assert.equal(empty.rankInfo,null);
  const report=await api.rpc('getFinalReport','KTCC',api.actors.admin,'결선','8강');
  assert.equal(report.selectedKtccStage,'8강');assert.equal(report.ranking.length,2);assert.ok(report.rows.every(r=>r['토너먼트 단계']==='8강'));assert.ok(report.rawRows.every(r=>r.payload.rows[0].extraFields['토너먼트 단계']==='8강'));
  assert.equal((await api.raw('getFinalReport','KTCC',api.actors.admin,'예선','8강')).success,false);
  assert.equal((await api.raw('getRankingDetail','MOC','1','결선',api.actors.admin,'8강')).success,false);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),snapshot,'all stage views, details and exports are read-only');
  assert.deepEqual(await query(''),all,'stage queries never alter the existing overall ranking');
  console.log('Stage302 KTCC: independent quarter/semi/final/placement views, correct per-match mission, empty/legacy stages, scoped detail/export, unchanged overall ranking and byte-identical stored evaluations passed.');
}finally{api.close();}
