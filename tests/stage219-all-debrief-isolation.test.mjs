import assert from 'node:assert/strict';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
const api=await createAllDebriefFixture();
const originals=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
const players=JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all());
try{
  for(const c of api.cases){
    assert.equal((await api.publicView(c)).success,false,'public lock: '+c.code);
    const preview=await api.rpc('getAdminDebriefPreview',c.code,c.units[0],'예선',api.actor);
    assert.ok(preview.scores.length,c.code+' admin preview while closed');
    api.db.prepare('UPDATE competitions SET debriefing=1 WHERE code=?').run(c.code);
    const res=await api.publicView(c);assert.equal(res.success,true,c.code);
    const allowed=new Set(c.rounds.map((r,i)=>r+'::'+c.units[i]));
    assert.ok(res.scores.length>=c.rounds.length,c.code+' all assigned rounds');
    assert.ok(res.scores.every(s=>s.competitionCode===c.code&&allowed.has(s.round+'::'+s.unit)),c.code+' exact competition/round/unit');
    assert.ok(res.rankInfos.every(r=>allowed.has(r.round+'::'+r.unit)),c.code+' exact ranks');
    assert.ok(res.scores.every(s=>!s.payload),'no raw batch payload in public response');
    for(const text of c.mixed)assert.ok(!JSON.stringify(res).includes(text),'no other participant payload');
    for(const [i,round] of c.rounds.entries()){
      const p=await api.rpc('getAdminDebriefPreview',c.code,c.units[i],round,api.actor);
      assert.deepEqual(p.scores,res.scores.filter(s=>s.round===round),c.code+' same preview scorecards');
      assert.deepEqual(p.rankInfos,res.rankInfos.filter(s=>s.round===round),c.code+' same preview ranks');
    }
    const empty=await api.publicView(c,c.missingName,c.missingPhone);assert.equal(empty.success,true);
    assert.deepEqual(empty.scores,[]);assert.deepEqual(empty.rankInfos,[]);
    assert.equal((await api.publicView(c,'QA 같은')).success,false,'partial name rejected');
    assert.equal((await api.publicView(c,'QA 일부 이름')).success,false,'arbitrary metadata rejected');
    const otherPhone=await api.publicView(c,c.name,c.phone+'1');assert.equal(otherPhone.success,false,'name/phone must belong to same participant');
    if(c.code==='KTCC')assert.deepEqual((await api.publicView(c,'QA 팀원')).scores,res.scores,'registered team member uses team contact');
  }
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),originals);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all()),players);
  // A duplicate owner must fail closed, including the admin preview.
  const c=api.cases.find(x=>x.code==='KCR');
  api.db.prepare("INSERT INTO participants(competition_code,name,phone,prelim_cup_no) VALUES('KCR','QA 중복 배정','01099997777','177')").run();
  assert.equal((await api.publicView(c)).code,'DEBRIEF_ASSIGNMENT_CONFLICT');
  assert.equal((await(await api.handle({action:'getAdminDebriefPreview',args:['KCR','177','예선',api.actor]})).json()).code,'DEBRIEF_ASSIGNMENT_CONFLICT');
  console.log('Stage219 all seven competitions: identity/round/ID collision, preview parity, public locks, team membership, empty records, duplicate allocation and raw batch privacy passed.');
}finally{api.close();}
