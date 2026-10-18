import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedKcrComparison} from './helpers/kcr-comparison-fixture.mjs';

// Optional baseline run proves the previous average implementation fails this case.
const source = process.env.KCL_QA_BASELINE
  ? execFileSync('git', ['show', 'HEAD:functions/api/rpc.js'], {encoding:'utf8'})
  : undefined;
const api = await createRpcFixture({source});
try {
  const {judges} = await seedKcrComparison(api);
  const snapshot = table => JSON.stringify(api.db.prepare('SELECT * FROM ' + table + ' ORDER BY id').all());
  const before = ['scores','participants','competitions'].map(snapshot);
  const rank = await api.rpc('getRanking','KCR',api.actor,'예선');
  const target = rank.ranking.find(row => row.unit === '1');
  // Three judges (21 + 28 + 35) must outrank one judge (42), even though 28 < 42.
  for (const key of ['score','totalScore','rankingScore','calculatedScore']) assert.equal(target[key],84,key);
  assert.equal(target.rank,1);
  assert.equal(rank.ranking.find(row => row.unit === '3').rank,3);
  assert.equal(rank.ranking.find(row => row.unit === '3').score,42);
  assert.deepEqual(target.tie,{sweetness:12,overall:12});
  assert.equal(target.scoreBasis,'심사위원 총점 합산');
  const detail = await api.rpc('getRankingDetail','KCR','1','예선',api.actor);
  assert.equal(detail.totalScore,84);
  assert.deepEqual(detail.rows.map(row => row.totalScore).sort((a,b)=>a-b),[21,28,35]);
  const report = await api.rpc('getFinalReport','KCR',api.actor,'예선');
  assert.equal(report.ranking.find(row => row.unit === '1').totalScore,84);
  const preview = await api.rpc('getAdminDebriefPreview','KCR','1','예선',api.actor);
  assert.equal(preview.rankInfo.totalScore,84);
  assert.equal(preview.scores.length,3);
  assert.deepEqual((await api.rpc('getRanking','KCR',api.actor,'결선')).ranking,[]);
  const review = await api.rpc('getReviewList','KCR',judges[0]);
  assert.equal(review.list.find(row => row.unit === '1')._stddev.totalAvg,28,'comparison statistics remain averages');
  assert.deepEqual(['scores','participants','competitions'].map(snapshot),before,'read-only recalculation preserves recorded data');

  // A historical duplicate must not count twice in the total or its tie breaks.
  const original = api.db.prepare("SELECT * FROM scores WHERE competition_code='KCR' AND unit='1' AND mode='judge' ORDER BY id LIMIT 1").get();
  const payload = JSON.parse(original.payload_json);
  delete payload.kcrEvaluationKey;
  api.db.prepare('INSERT INTO scores (submitted_at,competition_code,round,judge_name,team,role,mode,unit,total_score,review_status,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run('2000-01-01T00:00:00.000Z','KCR',original.round,original.judge_name,original.team,original.role,original.mode,original.unit,original.total_score,original.review_status,JSON.stringify(payload));
  const deduped = (await api.rpc('getRanking','KCR',api.actor,'예선')).ranking.find(row => row.unit === '1');
  assert.equal(deduped.score,84);
  assert.deepEqual(deduped.tie,target.tie);
  assert.equal((await api.rpc('getRankingDetail','KCR','1','예선',api.actor)).rows.length,3);
} finally {
  api.close();
}
console.log('Stage237 KCR total, ranking reversal, summed tie breaks, head inclusion, calibration exclusion, latest submission, output parity and data preservation passed.');
