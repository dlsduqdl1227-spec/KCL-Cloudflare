import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedKcrStations,stationSubmission} from './helpers/kcr-station-fixture.mjs';
let race=false,arrivals=0,release;
const gate=new Promise(resolve=>release=resolve);
const api=await createRpcFixture({beforeBatch:async statements=>{
  if(!race || !statements.some(s=>/INSERT INTO scores/.test(s.sql)))return;
  if(++arrivals===2)release();await gate;
}});
const request=async payload=>(await api.handle({action:'submitScores',args:[payload]})).json();
try{
  const {stations,judges}=await seedKcrStations(api);
  const other=JSON.stringify(api.db.prepare("SELECT * FROM competitions WHERE code!='KCR' ORDER BY code").all());
  const state=async actor=>(await api.rpc('getKcrStationEvaluationState',actor)).completion;
  assert.deepEqual((await state(judges[0])).officialUnits,[]);
  const first={...stationSubmission(judges[0],stations[1],21),clientSubmissionId:'same-retry'};
  assert.equal((await request(first)).inserted,2);
  const original=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  assert.deepEqual((await state(judges[0])).officialUnits.sort(),['1','2']);
  assert.deepEqual((await state(judges[1])).officialUnits,[],'completion belongs to this judge only');
  assert.equal((await request(first)).idempotent,true);
  const duplicate=await request({...first,clientSubmissionId:'new-click',judgeRole:'변경된 역할'});
  assert.equal(duplicate.success,false);assert.equal(duplicate.duplicate,true);
  assert.equal((await request({...first,clientSubmissionId:'round-alias',round:'preliminary'})).duplicate,true,'round aliases cannot create a duplicate');
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),original);
  // Calibration does not complete official cups, and vice versa.
  await api.rpc('submitScores',stationSubmission(judges[0],stations[0],14,true));
  assert.deepEqual((await state(judges[0])).stations.find(s=>s.stationId==='stable-a').calibrationUnits.sort(),['1','2']);
  assert.equal((await request(stationSubmission(judges[0],stations[0],14,true))).duplicate,true);
  // Partial legacy station: only missing entrants are accepted, never overwrite a saved cup.
  const legacy={...stationSubmission(judges[1],stations[1],28),rows:[stationSubmission(judges[1],stations[1],28).rows[0]]};
  const identity=JSON.parse(api.db.prepare('SELECT payload_json FROM scores WHERE id=1').get().payload_json);
  const p={...identity,judgeName:judges[1].name,operatorIdentityKey:'',judgeIdentityKey:'',rows:legacy.rows};
  // Simulate a historical record without the new key; ownership falls back to name.
  delete p.kcrEvaluationKey;delete p.clientSubmissionId;delete p.actorIdentityKey;delete p.judge;
  p.judgePhone='01088770001';p.phone='01088770001';
  api.db.prepare("INSERT INTO scores(competition_code,round,role,unit,judge_name,total_score,mode,payload_json,submitted_at) VALUES('KCR','예선','센서리 심사위원','1',?,28,'judge',?,?)").run(judges[1].name,JSON.stringify(p),new Date().toISOString());
  assert.deepEqual((await state(judges[1])).officialUnits,['1']);
  const legacyBefore=api.db.prepare("SELECT * FROM scores WHERE judge_name=? AND unit='1'").get(judges[1].name);
  const remaining=stationSubmission(judges[1],stations[1],28);remaining.rows=remaining.rows.slice(1);
  assert.equal((await request(remaining)).inserted,1);
  assert.deepEqual(api.db.prepare('SELECT * FROM scores WHERE id=?').get(legacyBefore.id),legacyBefore);
  // Force simultaneous different-device submissions past preflight checks.
  race=true;
  const results=await Promise.all(['device-a','device-b'].map(clientSubmissionId=>request({...stationSubmission(judges[0],stations[2],35),clientSubmissionId})));
  race=false;
  assert.equal(arrivals,2);assert.equal(results.filter(r=>r.success).length,1);assert.equal(results.filter(r=>r.duplicate).length,1);
  assert.equal(api.db.prepare("SELECT COUNT(*) n FROM scores WHERE unit IN ('3','4')").get().n,2,'one complete batch, no partial inserts');
  // Saving a review preserves the identity constraint and comments remain editable.
  const list=await api.rpc('getReviewList','KCR',judges[0]);
  const item=list.list.find(r=>r.unit==='3'&&!/켈리/.test(r.mode));
  const key=JSON.parse(api.db.prepare('SELECT payload_json FROM scores WHERE id=?').get(Number(item.rowIndex)).payload_json).kcrEvaluationKey;
  await api.rpc('updateReviewRow','KCR',item.rowIndex,{[list.headers.indexOf('종합코멘트')]:'검수 수정 보존 확인'},'수정완료',judges[0].role,judges[0]);
  const edited=JSON.parse(api.db.prepare('SELECT payload_json FROM scores WHERE id=?').get(Number(item.rowIndex)).payload_json);
  assert.equal(edited.kcrEvaluationKey,key);assert.match(JSON.stringify(edited),/검수 수정 보존 확인/);
  // Role / process / station / day changes cannot create a second official vote.
  const moved=stations.map(s=>({...s,prelimDay:2,process:'Natural'}));
  moved[2].start=1;moved[2].end=2;moved[1].start=3;moved[1].end=4;
  await api.rpc('updateCompetitionAdminSettings',{code:'KCR',optionSettings:{kcrProcesses:{blending:true,natural:true},kcrStations:{stations:moved,byRound:{예선:moved,결선:stations}}}},api.actor);
  assert.equal((await request(stationSubmission(judges[0],moved[2],35))).duplicate,true);
  await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'결선'},api.actor);
  assert.deepEqual((await state(judges[0])).officialUnits,[]);
  assert.equal((await request({...stationSubmission(judges[0],stations[1],21),round:'결선'})).inserted,2);
  assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM competitions WHERE code!='KCR' ORDER BY code").all()),other);
  console.log('Stage224 own completion, legacy partial recovery, duplicate clicks/concurrent devices, retry, review and round/calibration isolation passed.');
}finally{api.close();}
