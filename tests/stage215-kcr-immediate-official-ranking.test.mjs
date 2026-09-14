import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedKcrComparison} from './helpers/kcr-comparison-fixture.mjs';
import {seedRoundRankings,competitionCodes} from './helpers/round-ranking-fixture.mjs';
const api=await createRpcFixture();
try{
  const {judges}=await seedKcrComparison(api);
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const configs=JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all());
  const rank=await api.rpc('getRanking','KCR',api.actor,'예선');
  assert.equal(rank.ranking.length,4,'unreviewed official submissions enter ranking immediately');
  const target=rank.ranking.find(r=>r.unit==='1');
  assert.equal(target.score,28);assert.equal(target.totalCount,3);assert.equal(target.reviewedCount,3);
  assert.deepEqual((await api.rpc('getRanking','KCR',api.actor,'결선')).ranking,[]);
  const detail=await api.rpc('getRankingDetail','KCR','1','예선',api.actor);
  assert.equal(detail.rows.length,3);assert.equal(detail.avgScore,28);assert.equal(detail.reviewedCount,3);
  const report=await api.rpc('getFinalReport','KCR',api.actor,'예선');
  assert.equal(report.approvedRows.length,8);
  assert.ok(report.rawRows.every(row=>!row.mode?.includes('켈리브레이션')));
  const preview=await api.rpc('getAdminDebriefPreview','KCR','1','예선',api.actor);
  assert.equal(preview.scores.length,3);assert.equal(preview.rankInfo.score,28);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before,'ranking and preview do not rewrite old review statuses');
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all()),configs,'ranking never opens debriefing');
  // Test public/preview parity only in a disposable fixture; no SMS is sent.
  const participant=api.db.prepare("SELECT * FROM participants WHERE competition_code='KCR' ORDER BY id LIMIT 1").get();
  const phone='01088771111';api.db.prepare('UPDATE participants SET phone=? WHERE id=?').run(phone,participant.id);
  api.db.prepare('INSERT INTO otps (competition_code,name,phone,otp,expires_at,created_at) VALUES (?,?,?,?,?,?)').run('KCR',participant.name,phone,'215215','2099-01-01T00:00:00.000Z',new Date().toISOString());
  const closed=await(await api.handle({action:'verifyOTP',args:[participant.name,phone,'KCR','215215']})).json();assert.equal(closed.success,false);
  api.db.prepare("UPDATE competitions SET debriefing=1 WHERE code='KCR'").run();
  const publicView=await api.rpc('verifyOTP',participant.name,phone,'KCR','215215');
  assert.deepEqual(publicView.scores.map(r=>r.rowIndex).sort(),preview.scores.map(r=>r.rowIndex).sort());
  assert.equal(publicView.rankInfo.score,28);
  const own=await api.rpc('getReviewList','KCR',judges[0]),row=own.list.find(r=>r.unit==='1');
  const others=JSON.stringify(api.db.prepare('SELECT * FROM scores WHERE id<>? ORDER BY id').all(Number(row.rowIndex)));
  // Even an old client with a completed row may edit again without an unlock operation.
  api.db.prepare("UPDATE scores SET review_status='검수완료' WHERE id=?").run(Number(row.rowIndex));
  const updates={[own.headers.indexOf('Flavor(플레이버)')]:3.4,[own.headers.indexOf('종합코멘트')]:'본인 재수정'};
  const saved=await api.rpc('updateReviewRow','KCR',row.rowIndex,updates,'미검수',judges[0].role,judges[0]);assert.equal(saved.status,'수정완료');
  const latest=await api.rpc('getRanking','KCR',api.actor,'예선');
  assert.equal(latest.ranking.find(r=>r.unit==='1').score,28.133);
  assert.equal(latest.ranking.find(r=>r.unit==='2').score,28);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores WHERE id<>? ORDER BY id').all(Number(row.rowIndex))),others);
  // Reset only the disposable in-memory fixture for cross-competition isolation.
  api.db.exec('DELETE FROM scores; DELETE FROM participants;');
  await seedRoundRankings(api);
  api.db.prepare("UPDATE scores SET review_status='미검수'").run();
  for(const code of competitionCodes){
    const rows=(await api.rpc('getRanking',code,api.actor,'예선')).ranking;
    assert.equal(rows.length,['KCR','IKRC'].includes(code)?1:0,code+' independent review requirement');
  }
}finally{api.close();}
console.log('Stage215 immediate KCR ranking, head inclusion, calibration exclusion, report/debrief parity, repeat edits and other-competition isolation passed.');
