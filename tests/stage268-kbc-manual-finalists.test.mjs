import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedKbcTimetable} from './helpers/kbc-timetable-fixture.mjs';
let race=null;
const api=await createRpcFixture({beforeBatch:async statements=>{if(race&&statements.some(s=>s.sql.includes('INTO scores'))){const run=race;race=null;run();}}});
const rejected=async(action,...args)=>(await(await api.handle({action,args})).json());
try{
 await seedKbcTimetable(api);
 const original=api.db.prepare('SELECT * FROM participants ORDER BY id').all();
 const snapshot=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
 assert.equal((await rejected('getKbcFinalistSelection',{})).success,false);
 let current=await api.rpc('getKbcFinalistSelection',api.actor);
 assert.equal(current.choices.length,20);assert.equal(current.ready,true);assert.equal(current.selectedCount,0);
 const ids=current.choices.map(p=>p.participantId);
 async function save(selected){current=await api.rpc('setKbcFinalistSelection',{revision:current.revision,participantIds:selected},api.actor);return current;}
 const oldRevision=current.revision;
 await save([ids[0]]);assert.equal(current.choices[0].finalNumber,'1');
 assert.equal((await rejected('setKbcFinalistSelection',{revision:oldRevision,participantIds:[ids[1]]},api.actor)).stale,true);
 assert.equal((await rejected('setKbcFinalistSelection',{revision:current.revision,participantIds:ids.slice(0,7)},api.actor)).success,false);
 assert.equal((await rejected('setKbcFinalistSelection',{revision:current.revision,participantIds:[original.at(-1).id]},api.actor)).success,false);
 await save([ids[0],ids[1]]);await save([ids[1],ids[2]]);
 assert.equal(current.choices[1].finalNumber,'2');assert.equal(current.choices[2].finalNumber,'1');
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),snapshot);
 for(const p of api.db.prepare('SELECT * FROM participants ORDER BY id').all()){
  const before=original.find(r=>r.id===p.id);
  for(const key of ['name','affiliation','phone','unique_no','prelim_cup_no','main_cup_no'])assert.equal(p[key],before[key]);
  assert.equal(JSON.parse(p.extra_json).memo,JSON.parse(before.extra_json).memo);
 }
 await api.rpc('updateCompetitionAdminSettings',{code:'KBC',currentRound:'결선'},api.actor);
 const payload=(participantId,unit)=>({competitionCode:'KBC',round:'결선',participantId,judgeToken:api.actor.judgeToken,mode:'대회평가',rows:[{extraFields:{'참가자번호':unit,'총점':37,'종합코멘트':'보존할 결선 의견'}}]});
 assert.equal((await rejected('submitScores',payload(ids[0],'1'))).success,false,'reused number must reject previous entrant');
 assert.equal((await rejected('submitScores',payload(undefined,'1'))).success,false,'old clients cannot bypass manual identity guard');
 await api.rpc('submitScores',payload(ids[2],'1'));
 const protectedScore=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
 current=await api.rpc('getKbcFinalistSelection',api.actor);
 assert.equal(current.choices[2].locked,true);
 assert.equal((await rejected('setKbcFinalistSelection',{revision:current.revision,participantIds:[ids[1]]},api.actor)).success,false);
 await save([ids[2],ids[3]]);
 assert.equal(current.choices[2].finalNumber,'1');assert.equal(current.choices[3].finalNumber,'2');
 race=()=>{api.db.prepare("UPDATE participants SET final_cup_no='' WHERE id=?").run(ids[3]);api.db.prepare("UPDATE participants SET final_cup_no='2' WHERE id=?").run(ids[4]);};
 const during=await rejected('submitScores',payload(ids[3],'2'));
 assert.equal(during.success,false);assert.equal(during.stale,true,during.message);
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),protectedScore,'race must rollback score and receipt');
 current=await api.rpc('getKbcFinalistSelection',api.actor);
 await save([ids[2]]);
 assert.equal((await api.rpc('getParticipantAssignments','KBC',api.actor)).assignments.length,1);
 assert.equal((await api.rpc('getRanking','KBC',api.actor,'결선')).ranking.length,1);
 assert.equal((await api.rpc('getRanking','KBC',api.actor,'본선')).ranking.length,0);
 console.log('Stage268: main-only manual selection before scores, immediate partial assignment, stale/max-six guards, stable retained numbers, locked scored entrants, identity validation, atomic in-flight race rollback and preserved records passed.');
}finally{api.close();}
