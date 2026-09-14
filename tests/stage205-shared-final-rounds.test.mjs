import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';

const api=await createRpcFixture();
try{
  for(const code of ['KBC','MOC']){
    await api.rpc('upsertParticipant',{competitionCode:code,name:'본선 전용',phone:'01011112222',prelimCupNo:'8',mainCupNo:'1'},api.actor);
    await api.rpc('upsertParticipant',{competitionCode:code,name:'결선 진출',phone:'01033334444',prelimCupNo:'9',mainCupNo:'2',finalCupNo:'1'},api.actor);
    for(const round of ['예선','본선','결선'])api.db.prepare('INSERT INTO scores (submitted_at,competition_code,round,judge_name,unit,total_score,payload_json) VALUES (?,?,?,?,?,?,?)').run('2026-09-14',code,round,'QA 심사위원','1',code==='KBC'?36:7,JSON.stringify({comment:round+' 원본 코멘트',smartTags:['보존'],scoreLocked:true}));
  }
  const originalScores=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const originalPlayers=JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all());
  for(const code of ['KBC','MOC']){
    const otherBefore=JSON.stringify(api.db.prepare('SELECT * FROM competitions WHERE code<>? ORDER BY code').all(code));
    for(const round of ['본선','결선']){
      await api.rpc('updateCompetitionAdminSettings',{code,currentRound:round,isActive:true,debriefing:false},api.actor);
      const list=await api.rpc('getParticipantAssignments',code,api.actor);
      assert.equal(list.currentRound,round);
      assert.deepEqual(list.assignments.map(x=>x.name),round==='본선'?['본선 전용','결선 진출']:['결선 진출']);
      assert.deepEqual(list.assignments.map(x=>x.number),round==='본선'?['1','2']:['1']);
    }
    for(const combined of ['본·결선','본.결선','본/결선']){
      const result=await (await api.handle({action:'updateCompetitionAdminSettings',args:[{code,currentRound:combined,isActive:true},api.actor]})).json();
      assert.equal(result.success,false,'presentation labels must not become a storage round');
      assert.equal(api.db.prepare('SELECT current_round FROM competitions WHERE code=?').get(code).current_round,'결선');
    }
    assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM competitions WHERE code<>? ORDER BY code').all(code)),otherBefore,'only the selected competition changes');
  }
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),originalScores,'existing scores, comments and locks stay intact');
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all()),originalPlayers,'round assignments stay intact');
  console.log('Stage205 shared final labels preserve separate rounds, participant matching and all recorded data.');
}finally{api.close();}
