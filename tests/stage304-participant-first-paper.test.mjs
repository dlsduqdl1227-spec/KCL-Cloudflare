import assert from 'node:assert/strict';
import {createPaperEntryFixture} from './helpers/paper-entry-fixture.mjs';
import {roundsFor} from './helpers/round-ranking-fixture.mjs';

let mutation=null;
const api=await createPaperEntryFixture({beforeBatch:statements=>{
 if(mutation&&statements.some(s=>s.sql.includes("THEN 'PAPER_ENTRY_GUARD'"))){const apply=mutation;mutation=null;apply();}
}});
try{
 for(const code of api.codes){
  const existing=api.db.prepare('SELECT * FROM participants WHERE competition_code=?').get(code),extra=JSON.parse(existing.extra_json||'{}');
  if(code==='KBC')extra.roundSchedules={본선:{day:'1',order:1}};
  api.db.prepare('UPDATE participants SET extra_json=? WHERE id=?').run(JSON.stringify(extra),existing.id);
  await api.rpc('upsertParticipant',{competitionCode:code,name:code+' 다른 선수',affiliation:'다른 소속',phone:'01077778888',uniqueNo:'2',prelimCupNo:'2',mainCupNo:'2',finalCupNo:'2',extra:code==='IKRC'?{ikrcBlindAssignments:{예선:'A-2',결선:'A-2'}}:code==='KBC'?{roundSchedules:{본선:{day:'1',order:2}}}:{}},api.actor);
  if(['KCR','IKRC'].includes(code)){
   const cfg=api.db.prepare('SELECT * FROM competitions WHERE code=?').get(code),options=JSON.parse(cfg.option_settings),field=code==='KCR'?'kcrStations':'ikrcStations';
   for(const stations of Object.values(options[field].byRound))stations[0].end=2;options[field].stations[0].end=2;
   await api.rpc('updateCompetitionAdminSettings',{code,optionSettings:options},api.actor);
  }
 }
 const originalConfig=JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all());
 const originalScores=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
 for(const code of api.codes)for(const round of roundsFor(code)){
  const request={competitionCode:code,round,day:'1'};
  const result=await api.rpc('getPaperEntryParticipants',request,api.leads[code]);assert.equal(result.participants.length,2,code+' '+round);
  const [selected,other]=result.participants;
  assert.equal(selected.unit,code==='IKRC'?'A-1':'1');assert.ok(!('row' in selected));assert.ok(!JSON.stringify(result).includes('01077778888'));
  const create={...request,workflow:'participant-first',participantKey:selected.key,ktccStage:'8강',operatorIds:api.targets[code].map(j=>j.id),paperConfirmed:true};
  assert.equal((await api.raw('createPaperEntrySessions',{...create,participantKey:''},api.leads[code])).success,false,'a participant is mandatory in the new workflow');
  const session=await api.rpc('createPaperEntrySessions',create,api.leads[code]);assert.equal(session.entries.length,2);assert.equal(session.participant.key,selected.key);
  for(const entry of session.entries){
   const bootstrap=await api.rpc('getPaperEntryBootstrap',entry.token);assert.equal(bootstrap.participant.unit,selected.unit);assert.equal(bootstrap.participant.key,selected.key);
   const assignments=await api.rpc('getParticipantAssignments',code,{judgeToken:entry.token});assert.equal(assignments.assignments.length,1);assert.equal(assignments.assignments[0].number,selected.unit);
   if(['KCR','IKRC'].includes(code)){
    const field=code==='KCR'?'kcrStations':'ikrcStations',stations=bootstrap.config.optionSettings[field].byRound[round];
    assert.equal(stations.length,1);assert.equal(stations[0].start,1);assert.equal(stations[0].end,1,'only the chosen cup opens; the live two-cup station is unchanged');
   }
   const payload=api.payload(code,entry.token,round);
   if(code==='KTCC'&&round==='결선')payload.rows[0].extraFields['토너먼트 단계']='8강';
   if(code==='KBC'&&round==='본선')payload.operatingDay='1';
   const wrong=structuredClone(payload);wrong.rows[0].data[0]=other.unit;wrong.unit=selected.unit;
   assert.equal((await api.raw('submitScores',wrong)).success,false,'even a forged root number cannot redirect a row to another participant');
   const wrongId={...payload,participantId:999999};assert.equal((await api.raw('submitScores',wrongId)).success,false);
   if(code==='KTCC'&&round==='결선'){
    const wrongStage=structuredClone(payload);wrongStage.rows[0].extraFields['토너먼트 단계']='결승';assert.equal((await api.raw('submitScores',wrongStage)).success,false);
   }
   await api.rpc('submitScores',payload);
   const saved=api.db.prepare('SELECT * FROM scores WHERE competition_code=? AND round=? AND judge_name=?').get(code,round,entry.name);
   assert.equal(saved.unit,selected.unit);assert.equal(saved.review_status,'검수완료');
  }
  const otherSession=await api.rpc('createPaperEntrySessions',{...create,participantKey:other.key},api.leads[code]);
  if(code==='KBC'&&round==='본선')assert.equal((await api.rpc('getParticipantAssignments',code,{judgeToken:otherSession.entries[0].token})).assignments[0].performanceOrder,2,'a single-player form keeps the original day order');
  assert.notEqual((await api.rpc('getPaperEntryBootstrap',session.entries[0].token)).draftScope,(await api.rpc('getPaperEntryBootstrap',otherSession.entries[0].token)).draftScope,'different participants never share a judge draft');
  const firstRows=JSON.stringify(api.db.prepare('SELECT * FROM scores WHERE competition_code=? AND round=? AND unit=? ORDER BY id').all(code,round,selected.unit));
  const secondPayload=api.payload(code,otherSession.entries[0].token,round);secondPayload.rows[0].data[0]=other.unit;secondPayload.unit=other.unit;
  if(code==='KTCC'&&round==='결선')secondPayload.rows[0].extraFields['토너먼트 단계']='8강';
  if(code==='KBC'&&round==='본선')secondPayload.operatingDay='1';
  await api.rpc('submitScores',secondPayload);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores WHERE competition_code=? AND round=? AND unit=? ORDER BY id').all(code,round,selected.unit)),firstRows,'saving the second player cannot overwrite the first player or the remainder of a station');
  if(code==='KTCC'&&round==='결선'){
   const nextStage=(await api.rpc('createPaperEntrySessions',{...create,ktccStage:'4강'},api.leads[code])).entries[0];
   assert.notEqual((await api.rpc('getPaperEntryBootstrap',nextStage.token)).draftScope,(await api.rpc('getPaperEntryBootstrap',session.entries[0].token)).draftScope);
  }
 }
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all()),originalConfig,'scoped single-cup settings never rewrite live stations or phases');
 const initialIds=JSON.parse(originalScores).map(row=>row.id);
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all().filter(row=>initialIds.includes(row.id))),originalScores,'opening and submitting other judges never changes original evaluations');
 const options=await api.rpc('getPaperEntryParticipants',{competitionCode:'MOB',round:'결선'},api.leads.MOB),selected=options.participants[0];
 const request={competitionCode:'MOB',round:'결선',workflow:'participant-first',participantKey:selected.key,operatorIds:[api.targets.MOB[0].id],paperConfirmed:true};
 const ticket=(await api.rpc('createPaperEntrySessions',request,api.leads.MOB)).entries[0];
 const row=api.db.prepare("SELECT * FROM participants WHERE competition_code='MOB' AND final_cup_no='1'").get();
 mutation=()=>api.db.prepare('UPDATE participants SET name=? WHERE id=?').run('동시에 수정된 선수',row.id);
 const allBefore=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
 const stale=await api.raw('submitScores',api.payload('MOB',ticket.token));assert.equal(stale.success,false);assert.equal(stale.stale,true);
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),allBefore,'a concurrent roster change rolls back the complete replacement');
 assert.equal((await api.raw('getPaperEntryBootstrap',ticket.token)).success,false,'a changed player invalidates the old binding');
 assert.equal((await api.raw('createPaperEntrySessions',request,api.leads.MOB)).success,false,'stale selections must be chosen again');
 assert.equal((await api.raw('getPaperEntryParticipants',{competitionCode:'KBC',round:'결선'},api.leads.MOB)).success,false);
 const normal=await api.rpc('judgeLogin',api.targets.KBC[0].name,api.targets.KBC[0].phone);
 assert.equal((await api.raw('getPaperEntryParticipants',{competitionCode:'KBC',round:'결선'},normal)).success,false);
 const blind=await api.rpc('getPaperEntryParticipants',{competitionCode:'KCR',round:'결선'},api.leads.KCR);
 assert.ok(blind.participants.every(p=>p.identityHidden&&!p.name&&!p.affiliation));
 const admin=await api.rpc('getPaperEntryParticipants',{competitionCode:'KCR',round:'결선'},api.actor);assert.ok(admin.participants.every(p=>p.name));
 console.log('Stage304 participant-first paper entry: all seven competitions/rounds, shared locked player, one-cup station scope, isolated drafts, row/id/stage guards, atomic roster races, blind identities and preserved live records passed.');
}finally{api.close();}
