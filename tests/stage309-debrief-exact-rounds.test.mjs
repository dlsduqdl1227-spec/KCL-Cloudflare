import test from 'node:test';
import assert from 'node:assert/strict';
import {createDebriefRoundFixture,roundMarkers} from './helpers/debrief-round-fixture.mjs';

test('KBC main/final keep four separate judges per round; all competition debrief switches and authorized previews are exact-round reads',async()=>{
 const api=await createDebriefRoundFixture();
 try{
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),players=JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all());
  for(const c of api.cases){
   const auth=await api.publicView(c);assert.deepEqual(auth.availablePhases,c.rounds);
   for(const [index,round]of c.rounds.entries()){
    const view=await api.rpc('getDebriefPhase',auth.debriefToken,round);
    assert.ok(view.scores.length,c.code+' '+round);
    assert.ok(view.scores.every(score=>score.round===round),c.code+' only selected round scores');
    assert.ok(view.rankInfos.every(rank=>rank.round===round),c.code+' only selected round ranks');
    for(const actor of ['KBC','MOC'].includes(c.code)?[api.actor,api.previewLead]:[api.actor]){
     const preview=await api.rpc('getAdminDebriefPreview',c.code,c.units[index],round,actor,round);
     assert.deepEqual(preview.scores,view.scores,c.code+' exact preview/public scorecards');
     assert.deepEqual(preview.rankInfos,view.rankInfos,c.code+' exact preview/public ranks');
     const switched=await api.rpc('getAdminDebriefPhase',c.code,c.units[0],'예선',round,actor);
     assert.deepEqual(switched.scores,view.scores,c.code+' same-owner round switch');
    }
    if(c.code==='KBC')assert.equal(view.scores.length,4,'one round has four judges, never eight main+final cards');
    if(['KBC','MOC'].includes(c.code)){
     const text=JSON.stringify(view.scores);assert.ok(text.includes(roundMarkers[round]));
     for(const other of c.rounds.filter(r=>r!==round))assert.ok(!text.includes(roundMarkers[other]),round+' must not contain '+other+' opinions');
    }
   }
   api.db.prepare('INSERT INTO otps(competition_code,name,phone,otp,expires_at) VALUES(?,?,?,?,?)').run(c.code,c.name,c.phone,'309309','2099-01-01T00:00:00Z');
   const selected=await api.rpc('verifyOTP',c.name,c.phone,c.code,'309309',c.rounds.at(-1));
   assert.ok(selected.scores.every(s=>s.round===c.rounds.at(-1)),'initial authentication also respects exact round');
  }
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all()),players);
  const c=api.cases.find(c=>c.code==='KBC'),auth=await api.publicView(c);
  // This number has an unassigned MAIN score, not an owner whose final can be
  // resolved. A final preview must not fall back to that main score.
  const unassigned=await(await api.handle({action:'getAdminDebriefPreview',args:['KBC',c.units[0],'본선',api.actor,'결선']})).json();
  assert.equal(unassigned.success,false);assert.equal(unassigned.scores,undefined);
  api.db.prepare("UPDATE participants SET final_cup_no='' WHERE id=?").run(c.id);
  const main=await api.rpc('getDebriefPhase',auth.debriefToken,'본선');assert.deepEqual(main.availablePhases,['예선','본선']);assert.equal(main.scores.length,4);
  const denied=await(await api.handle({action:'getDebriefPhase',args:[auth.debriefToken,'결선']})).json();assert.equal(denied.success,false);assert.equal(denied.scores,undefined,'no main-to-final fallback for a non-finalist');
 }finally{api.close();}
});
