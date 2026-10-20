import assert from 'node:assert/strict';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
const api=await createAllDebriefFixture();
const call=async(action,...args)=>(await api.handle({action,args})).json();
try{
  api.db.prepare('UPDATE competitions SET debriefing=1').run();
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  for(const c of api.cases){
    const auth=await api.publicView(c);
    assert.equal(auth.success,true);assert.deepEqual(auth.availablePhases,['예선','결선']);
    const token=auth.debriefToken;
    const otpCount=api.db.prepare('SELECT COUNT(*) AS n FROM otps').get().n;
    const preview=await api.rpc('getAdminDebriefPreview',c.code,c.units[0],'예선',api.actor);
    assert.deepEqual(preview.availablePhases,['예선','결선']);
    for(const phase of ['예선','결선','예선']){
      const result=await api.rpc('getDebriefPhase',token,phase);
      const matches=r=>phase==='예선'?r==='예선':['본선','결선'].includes(r);
      const expected=auth.scores.filter(s=>matches(s.round));
      assert.deepEqual(result.scores,expected,c.code+' independent phase scores');
      assert.deepEqual(result.rankInfos,auth.rankInfos.filter(r=>matches(r.round)));
      assert.ok(result.scores.length>0);
      assert.doesNotMatch(JSON.stringify(result),/OTHER_PRIVATE_BATCH_COMMENT/);
      const admin=await api.rpc('getAdminDebriefPhase',c.code,c.units[0],'예선',phase,api.actor);
      assert.deepEqual(admin.scores,result.scores,c.code+' preview/public parity');
      assert.deepEqual(admin.rankInfos,result.rankInfos);
      assert.equal(admin.playerInfo.name,result.playerInfo.name);
      assert.equal(admin.playerInfo.maskedPhone,'');
      const opened=await api.rpc('getAdminDebriefPreview',c.code,c.units[0],'예선',api.actor,phase);
      assert.deepEqual(opened.scores,result.scores,c.code+' direct preview phase parity');
    }
    assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM otps').get().n,otpCount,'switching does not resend SMS');
    const prelimOnly=await api.publicView(c,'QA 다른 선수',c.phone+'1');
    assert.deepEqual(prelimOnly.availablePhases,c.code==='IKRC'?[]:['예선']);
    const denied=await call('getDebriefPhase',prelimOnly.debriefToken,'결선');
    assert.equal(denied.success,false);assert.equal(denied.scores,undefined);
    assert.equal((await call('getDebriefPhase',token,'전체')).success,false);
    assert.equal((await call('getAdminDebriefPhase',c.code,c.units[0],'예선','결선',{})).success,false);
    // Public switches must respect a later closure, while administrators can preview.
    api.db.prepare('UPDATE competitions SET debriefing=0 WHERE code=?').run(c.code);
    assert.equal((await call('getDebriefPhase',token,'결선')).success,false);
    assert.equal((await api.rpc('getAdminDebriefPhase',c.code,c.units[0],'예선','결선',api.actor)).success,true);
    api.db.prepare('UPDATE competitions SET debriefing=1 WHERE code=?').run(c.code);
    // An expired token or another session kind cannot authorize a public read.
    api.db.prepare("UPDATE sessions SET expires_at='2000-01-01' WHERE token=?").run(token);
    assert.equal((await call('getDebriefPhase',token,'예선')).success,false);
    assert.equal((await call('getDebriefPhase',api.actor.judgeToken,'예선')).success,false);
    console.log(c.code+': single authentication, separate phases, exact preview, access checks passed');
  }
  // The same cup number can identify different people across phases.
  const kcr=api.cases.find(c=>c.code==='KCR'), auth=await api.publicView(kcr);
  api.db.prepare("UPDATE participants SET final_cup_no='' WHERE id=?").run(kcr.id);
  assert.equal((await call('getDebriefPhase',auth.debriefToken,'결선')).success,false,'re-read current assignment');
  api.db.prepare('UPDATE participants SET final_cup_no=? WHERE id=?').run(kcr.units[1],kcr.id+1);
  assert.equal((await call('getDebriefPhase',auth.debriefToken,'결선')).success,false,'old token cannot read reassigned final cup');
  // A finalist with no final score still has a final tab, never a prelim fallback.
  api.db.prepare('UPDATE participants SET final_cup_no=? WHERE id=?').run('190',kcr.id);
  const pending=await api.rpc('getDebriefPhase',auth.debriefToken,'결선');
  assert.deepEqual(pending.availablePhases,['예선','결선']);assert.deepEqual(pending.scores,[]);assert.deepEqual(pending.rankInfos,[]);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before,'read-only debrief actions preserve every saved score');
  console.log('Stage248: all seven competitions; scores unchanged.');
}finally{api.close();}
