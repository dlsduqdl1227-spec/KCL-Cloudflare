import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedKcrStations,stationSubmission} from './helpers/kcr-station-fixture.mjs';
const api=await createRpcFixture();
try {
  const {stations,judges}=await seedKcrStations(api);
  const unrelated=JSON.stringify(api.db.prepare("SELECT * FROM competitions WHERE code!='KCR' ORDER BY code").all());
  for(const [index,judge] of judges.entries()){
    assert.equal((await api.rpc('submitScores',stationSubmission(judge,stations[0],7,true))).inserted,2);
    assert.equal((await api.rpc('submitScores',stationSubmission(judge,stations[1],index?28:21))).inserted,2);
    assert.equal((await api.rpc('submitScores',stationSubmission(judge,stations[2],index?35:28))).inserted,2);
  }
  const rows=api.db.prepare("SELECT * FROM scores WHERE competition_code='KCR'").all();
  assert.equal(rows.length,12);
  assert.equal(rows.filter(r=>r.mode==='KCR 스테이션 켈리브레이션').length,4);
  assert.ok(rows.every(r=>r.team==='스테이션 '+(['stable-a','stable-b','stable-c'].indexOf(JSON.parse(r.payload_json).stationId)+1)));
  const review=await api.rpc('getReviewList','KCR',{...api.actor,reviewScope:'manage',manageReview:true});
  await api.rpc('updateReviewStatusBatch','KCR',review.list.map(r=>r.rowIndex),'검수완료','관리자',{...api.actor,reviewScope:'manage',manageReview:true});
  const rank=await api.rpc('getRanking','KCR',api.actor,'예선');
  assert.equal(rank.ranking.length,4);
  for(const r of rank.ranking){assert.equal(r.totalCount,2);assert.equal(r.score,Number(r.unit)<=2?24.5:31.5);}
  const cal=await api.rpc('getReviewList','KCR',{...judges[0],calibrationOnly:true});
  assert.equal(cal.list.length,4);
  assert.ok(cal.list.every(r=>r._stddev?.judgeCount===2),JSON.stringify(cal.list.map(r=>({keys:Object.keys(r).filter(k=>k.includes('td')||k.includes('cal')),stats:r._stddev}))));
  const wrong=await(await api.handle({action:'submitScores',args:[stationSubmission(judges[0],stations[1],7,true)]})).json();
  assert.equal(wrong.success,false,'competition-only station must reject calibration');
  const more=[...stations,{...stations[0],id:'stable-d',label:'스테이션 4',prefix:'D'}];
  await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'예선',isActive:true,optionSettings:{kcrProcesses:{blending:true},kcrStations:{stations:more,byRound:{예선:more,결선:stations}}}},api.actor);
  assert.equal((await api.rpc('submitScores',stationSubmission(judges[0],more[3],14,true))).inserted,2,'same cup numbers in a different calibration station must be independent');
  // Reused historical display labels must not merge different stable station IDs.
  for(const row of api.db.prepare("SELECT id,payload_json FROM scores WHERE competition_code='KCR'").all()){
    const payload=JSON.parse(row.payload_json);if(payload.stationId!=='stable-d')continue;
    payload.stationLabel='스테이션 1';
    api.db.prepare('UPDATE scores SET team=?,payload_json=? WHERE id=?').run('스테이션 1',JSON.stringify(payload),row.id);
  }
  const separated=await api.rpc('getReviewList','KCR',{...judges[0],calibrationOnly:true});
  assert.equal(separated.list.length,6);
  for(const item of separated.list){
    const station=item.payload?.stationId||item['스테이션ID'];
    assert.equal(item._stddev.judgeCount,station==='stable-d'?1:2);
    assert.equal(item._stddev.totalAvg,station==='stable-d'?14:7);
  }
  const afterCalibration=await api.rpc('getRanking','KCR',api.actor,'예선');
  assert.deepEqual(afterCalibration.ranking.map(r=>[r.unit,r.score,r.totalCount]),rank.ranking.map(r=>[r.unit,r.score,r.totalCount]));
  const scoreBefore=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  // Revocation and expiry restore by token only; no name/phone fallback.
  const token=judges[0].judgeToken;
  assert.equal((await api.rpc('refreshAdminActor',{judgeToken:token})).actor.judgeToken,token);
  await api.rpc('logoutSession',{judgeToken:token});
  const loggedOut=await(await api.handle({action:'refreshAdminActor',args:[{judgeToken:token}]})).json();
  assert.equal(loggedOut.success,false);
  api.db.prepare('UPDATE sessions SET expires_at=? WHERE token=?').run('2000-01-01T00:00:00.000Z',judges[1].judgeToken);
  const expired=await(await api.handle({action:'refreshAdminActor',args:[{judgeToken:judges[1].judgeToken}]})).json();
  assert.equal(expired.success,false);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),scoreBefore);
  assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM competitions WHERE code!='KCR' ORDER BY code").all()),unrelated);
  console.log('Stage209 KCR station-only calibration, independent head/sensory scores, official average, login revocation and expiry passed.');
}finally{api.close();}
