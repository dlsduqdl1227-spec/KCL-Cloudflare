import test from 'node:test';
import assert from 'node:assert/strict';
import {createKtccTournamentFixture} from './helpers/ktcc-tournament-fixture.mjs';

test('KTCC final participants rank ahead of higher-scoring eliminated teams; every stage remains separate and read-only',async()=>{
  const api=await createKtccTournamentFixture();
  try{
    const before=api.snapshot(),rank=await api.rpc('getRanking','KTCC',api.actors.lead,'결선');
    assert.deepEqual(rank.ranking.slice(0,3).map(r=>[r.unit,r.rank,r.score]),[['1',1,10],['2',2,6],['3',3,7]]);
    assert.equal(rank.ranking[1].ktccStage,'결승','validated zero-point mission also identifies the legacy final');
    assert.deepEqual(rank.ktccStageCounts,{'8강':8,'4강':4,'결승':2});
    const final=await api.rpc('getRanking','KTCC',api.actor,'결선','결승');
    assert.deepEqual(final.ranking.map(r=>[r.unit,r.score]),[['1',10],['2',6]]);
    for(const [stage,count]of [['8강',8],['4강',4],['미지정',0]]){
      const scoped=await api.rpc('getRanking','KTCC',api.actor,'결선',stage);assert.equal(scoped.ranking.length,count);
      assert.ok(scoped.ranking.every(r=>r.ktccStage===stage));
    }
    const preview=await api.rpc('getAdminDebriefPreview','KTCC','2','결선',api.actor,'결선');
    const publicView=await api.player(2);
    assert.equal(preview.rankInfo.rank,2);assert.equal(publicView.rankInfo.rank,2);
    assert.deepEqual(preview.scores,publicView.scores);assert.deepEqual(preview.ktccStageResults,publicView.ktccStageResults);
    assert.deepEqual(preview.scores.map(s=>[s.ktccStage,s['총점']]),[['8강',7],['4강',7],['결승',6]]);
    assert.deepEqual(preview.ktccStageResults.map(r=>[r.ktccStage,r.rank,r.totalInRound,r.advancement,r.finalResult]),
      [['8강',1,8,'진출',''],['4강',2,4,'진출',''],['결승',2,2,'','준우승']]);
    assert.ok(preview.ktccStageResults.every(r=>r.unit==='2'),'never expose other teams in the player report');
    const lowQuarter=await api.rpc('getAdminDebriefPreview','KTCC','1','결선',api.actor);
    assert.ok(lowQuarter.ktccStageResults[0].rank>4);assert.equal(lowQuarter.ktccStageResults[0].advancement,'진출','actual next-stage participation, not a top-four guess');
    const eliminated=await api.rpc('getAdminDebriefPreview','KTCC','3','결선',api.actor);
    assert.equal(eliminated.scores.length,2);assert.equal(eliminated.ktccStageResults[1].advancement,'탈락');
    const quarterOnly=await api.rpc('getAdminDebriefPreview','KTCC','8','결선',api.actor);
    assert.equal(quarterOnly.scores.length,1);assert.equal(quarterOnly.ktccStageResults[0].advancement,'탈락');
    const prelim=await api.player(2,'예선');assert.ok(prelim.scores.every(s=>s.round==='예선'));assert.deepEqual(prelim.ktccStageResults,[]);
    const options=await api.rpc('getAdminDebriefPreviewOptions','KTCC',api.actors.lead);
    assert.equal(options.options.filter(r=>r.round==='결선').length,8,'one selectable team, not one option per match');
    const report=await api.rpc('getFinalReport','KTCC',api.actor,'결선');assert.equal(report.rows.length,14);
    assert.equal(report.ranking.find(r=>r.unit==='2').rank,2);
    assert.equal(api.snapshot(),before,'views/exports never change signed scores, missions, names or schedules');
  }finally{api.close();}
});

test('KTCC explicit manager decisions win; incomplete later rounds never falsely eliminate a team',async()=>{
  const api=await createKtccTournamentFixture();
  try{
    const id=api.ids['8강::8'],context=await api.rpc('getKtccFinalDecision',{rowIndex:id},api.actors.lead);
    await api.rpc('setKtccFinalDecision',{rowIndex:id,revision:context.revision,result:'진출'},api.actors.lead);
    let view=await api.rpc('getAdminDebriefPreview','KTCC','8','결선',api.actor);
    assert.equal(view.ktccStageResults[0].advancement,'진출','manager instruction precedes inferred elimination');
    // Simulate a later round whose paper entries are still incomplete.
    api.db.prepare("UPDATE scores SET review_status='반려' WHERE id IN(?,?)").run(api.ids['4강::6'],api.ids['::2']);
    const before=api.snapshot();
    view=await api.rpc('getAdminDebriefPreview','KTCC','3','결선',api.actor);
    assert.equal(view.ktccStageResults.find(r=>r.ktccStage==='4강').advancement,'');
    view=await api.rpc('getAdminDebriefPreview','KTCC','7','결선',api.actor);
    assert.equal(view.ktccStageResults[0].advancement,'');
    assert.equal(api.snapshot(),before);
    api.db.prepare('UPDATE scores SET disqualified=1 WHERE id=?').run(api.ids['::1']);
    view=await api.rpc('getAdminDebriefPreview','KTCC','1','결선',api.actor);
    const final=view.ktccStageResults.find(r=>r.ktccStage==='결승');
    assert.equal(final.rank,'실격');assert.equal(final.advancement,'실격');assert.equal(final.totalScore,0);assert.equal(final.finalResult,'');
  }finally{api.close();}
});
