import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedRoundRankings,competitionCodes,roundsFor} from './helpers/round-ranking-fixture.mjs';

const api=await createRpcFixture();
try {
  await seedRoundRankings(api);
  for (const code of competitionCodes) {
    const unit=code==='IKRC'?'A-1':'1';
    const stored=api.db.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id').all(code);
    assert.deepEqual(stored.map(row=>row.round),roundsFor(code),code+': same judge/unit is stored independently per round');
    const all=await api.rpc('getRanking',code,api.actor);
    assert.equal(all.ranking.length,roundsFor(code).length,code+': legacy all-round report remains available');
    assert.equal(new Set(all.ranking.map(row=>row.score)).size,roundsFor(code).length,'different round scores must remain distinct');
    // Historical calibration records for the same unit must not enter any rank.
    const sample=stored[0];
    api.db.prepare('INSERT INTO scores (submitted_at,competition_code,round,judge_name,role,mode,unit,total_score,review_status,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(sample.submitted_at,code,'예선',sample.judge_name,sample.role,'팀별 켈리브레이션',unit,99,'검수완료',JSON.stringify({round:'예선',rows:[{data:[unit],extraFields:{총점:99,종합코멘트:'순위에 들어가면 안 되는 켈리브레이션'}}]}));
    for (const round of roundsFor(code)) {
      const ranked=await api.rpc('getRanking',code,api.actor,round);
      assert.equal(ranked.selectedRound,round);
      assert.equal(ranked.ranking.length,1,code+' '+round);
      assert.deepEqual(ranked.ranking,all.ranking.filter(row=>row.round===round),'scoping must not recalculate another score');
      const detail=await api.rpc('getRankingDetail',code,unit,round,api.actor);
      assert.equal(detail.rows.length,1);
      assert.equal(detail.rows[0].round,round);
      assert.equal(detail.rows[0]['종합코멘트'],code+' '+round+' 독립 기록');
      const report=await api.rpc('getFinalReport',code,api.actor,round);
      assert.deepEqual(report.rounds,[round]);
      assert.ok(report.rows.length>0);
      assert.ok(report.rows.every(row=>row['라운드']===round));
      assert.ok(report.rawRows.every(row=>row.round===round));
      assert.ok(report.ranking.every(row=>row.round===round));
    }
    // Remove only local final fixtures: no final data must yield an empty final,
    // not the preliminary result, even though the same participant number exists.
    api.db.prepare('DELETE FROM scores WHERE competition_code=? AND round=?').run(code,'결선');
    const empty=await api.rpc('getRanking',code,api.actor,'결선');
    assert.deepEqual(empty.ranking,[]);
    const emptyReport=await api.rpc('getFinalReport',code,api.actor,'결선');
    assert.deepEqual(emptyReport.rounds,['결선']);
    assert.deepEqual(emptyReport.rows,[]);
    assert.equal((await api.rpc('getRanking',code,api.actor,'예선')).ranking.length,1);
    // Current operation is final, so a stale preliminary submission must fail.
    const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
    const wrong=await (await api.handle({action:'submitScores',args:[{competitionCode:code,round:'예선',judgeToken:api.actor.judgeToken,rows:[{data:[unit],extraFields:{총점:99}}]}]})).json();
    assert.equal(wrong.success,false);assert.match(wrong.message,/라운드/);
    assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before);
    const review=await api.rpc('getReviewList',code,{...api.actor,reviewScope:'manage',manageReview:true});
    const prelim=review.list.find(row=>row.round==='예선'&&!String(row.mode||row['모드']).includes('켈리브레이션'));
    const othersBefore=JSON.stringify(api.db.prepare('SELECT * FROM scores WHERE id<>? ORDER BY id').all(Number(String(prelim.rowIndex).split(':')[0])));
    const commentColumn=review.headers.indexOf('종합코멘트');assert.ok(commentColumn>=0);
    await api.rpc('updateReviewRow',code,prelim.rowIndex,{[commentColumn]:'예선 검수만 수정'},'수정완료','관리자',{...api.actor,reviewScope:'manage',manageReview:true});
    assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores WHERE id<>? ORDER BY id').all(Number(String(prelim.rowIndex).split(':')[0]))),othersBefore,'review editing cannot change another stage/competition');
    assert.equal(api.db.prepare('SELECT round FROM scores WHERE id=?').get(Number(String(prelim.rowIndex).split(':')[0])).round,'예선');
    const invalid=await (await api.handle({action:'getRanking',args:[code,api.actor,'본·결선']})).json();
    assert.equal(invalid.success,false,'shared label cannot combine rounds');
    const ambiguous=await (await api.handle({action:'getRankingDetail',args:[code,unit,'',api.actor]})).json();
    assert.equal(ambiguous.success,false,'detail requires an exact round');
  }
  console.log('Stage207 all seven competitions: isolated submission, ranking, detail, final report, stale-round rejection and review writes passed.');
} finally { api.close(); }
