import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedKcrComparison} from './helpers/kcr-comparison-fixture.mjs';

const source = fs.readFileSync(new URL('../functions/api/rpc.js',import.meta.url),'utf8');
// Preserve the pre-hotfix read algorithm as a parity oracle, without production
// access, credentials, timing-sensitive assertions, or historical Git objects.
const legacy = source
  .replace("buildRankingData_(env, code, selectedRound, code === 'KCR')",'buildRankingData_(env, code, selectedRound)')
  .replace("  if (safeStr(code).toUpperCase() === 'KCR') return [rowToReviewItem(r, code, headers, fallbackRound, 0)];",'')
  .replace(/    const convertedPeers = new Map\(list\.map[\s\S]*?\n    const comparisonIndex = indexKcrComparisonItems_\(peers\);/,
    `    const peerHeaders = mergeHeaders(code, kcrPeerRows);
    const peers = kcrPeerRows.flatMap(row => rowToReviewItems_(row, code, peerHeaders, cfg && cfg.current_round));
    const comparisonIndex = indexKcrComparisonItems_(peers);`)
  .replace('kcrCalibrationReviewComparison_(item, comparisonIndex.get(kcrComparisonBucketKey_(item)) || [])','kcrCalibrationReviewComparison_(item, list)')
  .replace('kcrStationReviewComparison_(item, comparisonIndex.get(kcrComparisonBucketKey_(item)) || [], false)','kcrStationReviewComparison_(item, peers, false)')
  .replace('const converted = rankingRows.flatMap(', 'const converted = raw.flatMap(')
  .replace(/function kcrHeadParticipatedRows_\(rawRows, actor, calibration\) \{[\s\S]*?\n\}/, `function kcrHeadParticipatedRows_(rawRows, actor, calibration) {
    const purposeRows = rawRows.filter(row => isCalibrationMode_(row.mode) === calibration);
    const ownRows = purposeRows.filter(row => scoreOwnedByActor_(row, actor));
    return purposeRows.filter(row => ownRows.some(own => own.round === row.round &&
      kcrReviewStationMatches_({payload:parseJson(own.payload_json,{})}, {payload:parseJson(row.payload_json,{})})));
  }`);
assert.notEqual(source,legacy);
assert.ok(!legacy.includes('const convertedPeers ='), 'legacy oracle must retain the full duplicate peer conversion');
assert.ok(legacy.includes('const peerHeaders = mergeHeaders(code, kcrPeerRows);'));
assert.ok(!legacy.includes("buildRankingData_(env, code, selectedRound, code === 'KCR')"),'legacy ranking oracle must retain full conversion');
const old = await createRpcFixture({source:legacy});
const current = await createRpcFixture({source});
try {
  const {judges,head2,outsider,freshHead,lead} = await seedKcrComparison(old);
  const samples = old.db.prepare('SELECT * FROM scores ORDER BY id').all();
  const columns = Object.keys(samples[0]).filter(key=>key!=='id');
  const insert = old.db.prepare(`INSERT INTO scores (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
  for (let batch=1;batch<=65;batch++) for (const sample of samples) {
    const row={...sample}, p=JSON.parse(row.payload_json);
    delete p.kcrEvaluationKey;
    row.round=batch%3===0?'결선':(batch%7===0?'':'예선');
    row.unit=String(Number(row.unit)+batch*4);
    p.round=batch%7===0?'결선':row.round;
    p.rows[0].data[0]=row.unit;
    if(batch%5===0)delete p.stationId; // Legacy station-label fallback.
    if(batch%11===0)p.stationId='reused-label-different-id';
    if(batch%13===0)p.stationProcess='Washed';
    p.rows[0].extraFields.종합코멘트='보존할 심사 기록 '+batch;
    row.payload_json=JSON.stringify(p);
    insert.run(...columns.map(key=>row[key]));
  }
  // Copy only disposable in-memory fixtures, including identical auth sessions.
  for (const {name} of old.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    const table='"'+name.replaceAll('"','""')+'"';
    current.db.exec('DELETE FROM '+table);
    for (const row of old.db.prepare('SELECT * FROM '+table).all()) {
      const keys=Object.keys(row);
      current.db.prepare(`INSERT INTO ${table} (${keys.map(k=>'"'+k+'"').join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
    }
  }
  const snapshot=api=>['scores','participants','competitions'].map(table=>JSON.stringify(api.db.prepare('SELECT * FROM '+table+' ORDER BY id').all()));
  const before=snapshot(current);
  const calls=[];
  for(const actor of [old.actor,lead,...judges,head2,outsider,freshHead]) {
    calls.push(['getReviewList','KCR',actor]);
    if(actor!==judges[1])calls.push(['getReviewList','KCR',{...actor,calibrationOnly:true}]);
  }
  // The management path contains every score, unlike the default own-only
  // administrator request. Keep both scopes in the response parity coverage.
  for(const actor of [old.actor,lead]) {
    calls.push(['getReviewList','KCR',{...actor,reviewScope:'manage'}]);
    calls.push(['getReviewList','KCR',{...actor,manageReview:true,calibrationOnly:true}]);
  }
  for(const round of ['','예선','결선'])calls.push(['getRanking','KCR',old.actor,round]);
  calls.push(['getRankingDetail','KCR','1','예선',old.actor]);
  let legacyMs=0, optimizedMs=0;
  for(const call of calls) {
    let started=performance.now();
    const expected=await old.rpc(...call); legacyMs+=performance.now()-started;
    started=performance.now();
    const actual=await current.rpc(...call); optimizedMs+=performance.now()-started;
    assert.deepEqual(actual,expected,call[0]+' preserves complete response and authorization');
  }
  assert.deepEqual(snapshot(current),before,'queries never alter stored scores, comments, locks, participants or settings');
  // Closed day-one scores stay visible to managers, but cannot leak to judges
  // through reused comparison items. Day two and finals remain independent.
  const config=old.db.prepare("SELECT option_settings FROM competitions WHERE code='KCR'").get();
  const closedOptions=JSON.parse(config.option_settings);
  const closedStations=closedOptions.kcrStations.byRound.예선.map((station,index)=>({...station,prelimDay:index<2?1:2}));
  closedOptions.kcrStations.byRound.예선=closedStations;
  closedOptions.kcrStations.stations=closedStations;
  closedOptions.kcrStations.closedPrelimDays=[1];
  for(const api of [old,current])api.db.prepare("UPDATE competitions SET option_settings=? WHERE code='KCR'").run(JSON.stringify(closedOptions));
  const closedBefore=snapshot(current);
  for(const call of calls)assert.deepEqual(await current.rpc(...call),await old.rpc(...call),call[0]+' preserves closed-day response and authorization');
  assert.deepEqual(snapshot(current),closedBefore,'closed-day queries never alter stored data');
  for(const api of [old,current])api.db.prepare("UPDATE competitions SET option_settings=? WHERE code='KCR'").run(config.option_settings);
  assert.deepEqual(snapshot(current),before,'test closure configuration was restored without changing scores');
  // Every request must see edits, not a cross-request cached comparison.
  const row=current.db.prepare("SELECT * FROM scores WHERE mode='judge' ORDER BY id LIMIT 1").get();
  const p=JSON.parse(row.payload_json);p.rows[0].extraFields.종합코멘트='다음 조회에 즉시 반영';
  current.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(p),row.id);
  const after=await current.rpc('getReviewList','KCR',head2);
  assert.ok(after.list.some(item=>item._stddev?.judges.some(j=>j.comment==='다음 조회에 즉시 반영')));
  console.log(JSON.stringify({test:'Stage239 KCR read parity, station isolation, live freshness and data preservation',rows:samples.length*66,calls:calls.length,legacyMs:Math.round(legacyMs),optimizedMs:Math.round(optimizedMs)}));
} finally {old.close();current.close();}
