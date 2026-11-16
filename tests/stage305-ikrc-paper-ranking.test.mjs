import assert from 'node:assert/strict';
import test from 'node:test';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedIkrcFinal,ikrcFinalSubmission} from './helpers/ikrc-final-fixture.mjs';

async function setup(options={}) {
 const api=await createRpcFixture(options),data=await seedIkrcFinal(api);
 const ids=data.judges.map(j=>j.operatorRows.find(r=>r.access==='IKRC').rowIndex);
 api.db.prepare('INSERT INTO system_settings(setting_key,setting_value,updated_at) VALUES(?,?,?)').run('ikrc_final_judge_roster',JSON.stringify({headOperatorId:ids[0],sensoryOperatorIds:ids.slice(1)}),new Date().toISOString());
 await api.rpc('submitScores',ikrcFinalSubmission(data.judges[1],data.stations[0],6));
 const old=api.db.prepare("SELECT * FROM scores WHERE unit='A-1'").get(),duplicate={...old};delete duplicate.id;
 const payload=JSON.parse(old.payload_json);for(const key of ['finalEvaluationKey','ikrcEvaluationKey','clientSubmissionId'])delete payload[key];
 duplicate.payload_json=JSON.stringify(payload);const keys=Object.keys(duplicate);
 const newer=Number(api.db.prepare('INSERT INTO scores('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>duplicate[k])).lastInsertRowid);
 const history=await api.rpc('getIkrcScoreHistory',{round:'결선',rowIndex:old.id},api.actor);
 await api.rpc('selectIkrcOfficialScore',{round:'결선',rowIndex:old.id,selectedRowIndex:old.id,historyRevision:history.historyRevision},api.actor);
 const selection=api.db.prepare("SELECT * FROM sessions WHERE kind='IKRC_OFFICIAL_SELECTION'").get();
 const choice=(await api.rpc('getPaperEntryParticipants',{competitionCode:'IKRC',round:'결선'},api.actor)).participants.find(p=>p.unit==='A-1');
 const entry=(await api.rpc('createPaperEntrySessions',{competitionCode:'IKRC',round:'결선',workflow:'participant-first',participantKey:choice.key,operatorIds:[ids[1]],paperConfirmed:true},api.actor)).entries[0];
 const paper=ikrcFinalSubmission({...data.judges[1],judgeToken:entry.token},data.stations[0],7);paper.rows=paper.rows.slice(0,1);paper.clientSubmissionId=crypto.randomUUID();
 return Object.assign(api,{...data,old,newer,selection,paper});
}
const ranking=async api=>(await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking;
const snapshot=api=>JSON.stringify([api.db.prepare('SELECT * FROM scores ORDER BY id').all(),api.db.prepare('SELECT * FROM sessions ORDER BY token').all()]);
function restoreSelection(api,selection=api.selection){
 api.db.prepare('INSERT OR REPLACE INTO sessions(token,kind,payload_json,expires_at,created_at) VALUES(?,?,?,?,?)').run(selection.token,selection.kind,selection.payload_json,selection.expires_at,selection.created_at);
}

test('final paper entry clears the assigned-seat selection atomically and immediately ranks the replacement',async()=>{
 const api=await setup();try{
  const others=JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE unit<>'A-1' ORDER BY id").all());
  assert.equal((await ranking(api)).find(r=>r.unit==='A-1').rankingScore,60);
  assert.equal((await api.rpc('submitScores',api.paper)).inserted,1);
  assert.equal(api.db.prepare("SELECT COUNT(*) n FROM sessions WHERE kind='IKRC_OFFICIAL_SELECTION'").get().n,0);
  const r=(await ranking(api)).find(r=>r.unit==='A-1');assert.equal(r.rankingScore,70);assert.equal(r.sensoryCount,1);assert.equal(r.confirmedJudgeCount,1);
  assert.equal(api.db.prepare("SELECT COUNT(*) n FROM scores WHERE unit='A-1'").get().n,1);
  assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE unit<>'A-1' ORDER BY id").all()),others);
  const archive=JSON.parse(api.db.prepare("SELECT payload_json FROM sessions WHERE kind='PAPER_ENTRY_ARCHIVE'").get().payload_json);
  assert.ok(archive.previousSelections.some(s=>s.token===api.selection.token&&s.payload===api.selection.payload_json));
  assert.equal((await api.rpc('submitScores',api.paper)).idempotent,true);
  const detail=await api.rpc('getRankingDetail','IKRC','A-1','결선',api.actor);assert.equal(detail.avgScore,70);assert.equal(detail.rows.length,1);
  const preview=await api.rpc('getAdminDebriefPreview','IKRC','A-1','결선',api.actor);assert.equal(preview.rankInfo.rankingScore,70);
 }finally{api.close();}
});

test('already-saved paper records recover an orphaned historical selection without rewriting production data',async()=>{
 const api=await setup();try{
  await api.rpc('submitScores',api.paper);restoreSelection(api); // State left by the previous release.
  const before=snapshot(api),r=(await ranking(api)).find(r=>r.unit==='A-1');assert.equal(r.rankingScore,70);assert.equal(r.sensoryCount,1);
  const detail=await api.rpc('getRankingDetail','IKRC','A-1','결선',api.actor);assert.equal(detail.avgScore,70);
  const history=await api.rpc('getIkrcScoreHistory',{round:'결선',rowIndex:api.newer},api.actor);assert.equal(history.entries.filter(e=>e.isSelected).length,1);
  const preview=await api.rpc('getAdminDebriefPreview','IKRC','A-1','결선',api.actor);assert.equal(preview.rankInfo.rankingScore,70);
  assert.equal(snapshot(api),before,'read-time compatibility never edits scores, selections, or archives');
 }finally{api.close();}
});

test('ordinary records, older paper records and invalid audit timestamps cannot replace a missing selection',async()=>{
 for(const mode of ['ordinary','old-paper','invalid-time']){
  const api=await setup();try{
   await api.rpc('submitScores',api.paper);restoreSelection(api);
   const row=api.db.prepare("SELECT * FROM scores WHERE unit='A-1'").get(),payload=JSON.parse(row.payload_json);
   if(mode==='ordinary')delete payload.paperEntryAudit;
   else payload.paperEntryAudit.enteredAt=mode==='invalid-time'?'invalid':'2000-01-01T00:00:00Z';
   api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(payload),row.id);
   assert.equal((await ranking(api)).some(r=>r.unit==='A-1'),false,mode);
  }finally{api.close();}
 }
});

test('a valid explicit historical choice stays authoritative even with a later paper record',async()=>{
 const api=await setup();try{
  await api.rpc('submitScores',api.paper);
  const original=JSON.parse(api.old.payload_json);for(const key of ['finalEvaluationKey','ikrcEvaluationKey','clientSubmissionId'])delete original[key];api.old.payload_json=JSON.stringify(original);
  const keys=Object.keys(api.old);api.db.prepare('INSERT INTO scores('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>api.old[k]));
  restoreSelection(api);assert.equal((await ranking(api)).find(r=>r.unit==='A-1').rankingScore,60);
 }finally{api.close();}
});

test('a concurrent assigned-seat selection change rolls back the paper replacement and archive',async()=>{
 let mutate=null;const api=await setup({beforeBatch:statements=>{if(mutate&&statements.some(s=>s.sql.includes("THEN 'PAPER_ENTRY_GUARD'"))){const f=mutate;mutate=null;f();}}});try{
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const selection=JSON.parse(api.selection.payload_json);selection.rowIndex=String(api.newer);
  mutate=()=>api.db.prepare('UPDATE sessions SET payload_json=? WHERE token=?').run(JSON.stringify(selection),api.selection.token);
  const result=await(await api.handle({action:'submitScores',args:[api.paper]})).json();assert.equal(result.success,false);assert.equal(result.stale,true);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before);
  assert.equal(api.db.prepare("SELECT COUNT(*) n FROM sessions WHERE kind='PAPER_ENTRY_ARCHIVE'").get().n,0);
  assert.equal(JSON.parse(api.db.prepare('SELECT payload_json FROM sessions WHERE token=?').get(api.selection.token).payload_json).rowIndex,String(api.newer));
 }finally{api.close();}
});
