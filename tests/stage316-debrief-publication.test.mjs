import test from 'node:test';
import assert from 'node:assert/strict';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';

async function raw(api,action,...args){return (await api.handle({action,args})).json();}
function defaultRelease(api,code){
  const row=api.db.prepare('SELECT option_settings FROM competitions WHERE code=?').get(code),options=JSON.parse(row.option_settings||'{}');
  delete options.debriefingPhases;
  api.db.prepare('UPDATE competitions SET debriefing=1,option_settings=? WHERE code=?').run(JSON.stringify(options),code);
}
async function otpView(api,c,phase){
  api.db.prepare('INSERT INTO otps(competition_code,name,phone,otp,expires_at) VALUES(?,?,?,?,?)').run(c.code,c.name,c.phone,'316316','2099-01-01T00:00:00Z');
  return raw(api,'verifyOTP',c.name,c.phone,c.code,'316316',phase);
}
const snapshot=api=>JSON.stringify(['scores','participants'].map(table=>api.db.prepare('SELECT * FROM '+table+' ORDER BY id').all()));

test('all seven existing event-wide releases default to post-prelim only, including legacy clients and old tokens',async()=>{
  const api=await createAllDebriefFixture();
  try{
    const before=snapshot(api);
    for(const c of api.cases){
      const finals=c.rounds.filter(round=>round!=='예선');defaultRelease(api,c.code);
      const config=(await api.rpc('getConfig')).configs.find(row=>row.code===c.code);
      assert.deepEqual(config.debriefingPhases,finals,c.code+' default is independent of the current evaluation round');
      const otpCount=api.db.prepare('SELECT COUNT(*) n FROM otps').get().n;
      const deniedSend=await raw(api,'sendOTP',c.name,c.phone,c.code,'예선');
      assert.equal(deniedSend.success,false);assert.equal(deniedSend.code,'DEBRIEF_PHASE_CLOSED');
      assert.equal(api.db.prepare('SELECT COUNT(*) n FROM otps').get().n,otpCount,'closed prelim never sends SMS or creates an OTP');
      const denied=await otpView(api,c,'예선');assert.equal(denied.success,false);assert.equal(denied.code,'DEBRIEF_PHASE_CLOSED');
      assert.equal(api.db.prepare('SELECT used_at FROM otps ORDER BY id DESC LIMIT 1').get().used_at,null,'a closed phase cannot consume a valid OTP');
      const legacy=await raw(api,'verifyOTP',c.name,c.phone,c.code,'316316');assert.equal(legacy.success,true);
      assert.deepEqual(legacy.availablePhases,finals);assert.ok(legacy.scores.length>0);
      assert.ok(legacy.scores.every(row=>finals.includes(row.round)));assert.ok(legacy.rankInfos.every(row=>finals.includes(row.round)));
      assert.doesNotMatch(JSON.stringify(legacy.scores),/OTHER_PRIVATE_BATCH_COMMENT|예선.*개별 코멘트/);
      const deniedToken=await raw(api,'getDebriefPhase',legacy.debriefToken,'예선');assert.equal(deniedToken.success,false);assert.equal(deniedToken.code,'DEBRIEF_PHASE_CLOSED');
      for(const phase of finals){
        const result=await api.rpc('getDebriefPhase',legacy.debriefToken,phase);
        assert.ok(result.scores.every(row=>row.round===phase));assert.ok(result.rankInfos.every(row=>row.round===phase));
      }
      const preview=await api.rpc('getAdminDebriefPreview',c.code,c.units[0],'예선',api.actor,'예선');
      assert.ok(preview.scores.length>0,'authorized managers retain preliminary history');
      const released=await api.rpc('updateCompetitionAdminSettings',{code:c.code,debriefing:true,optionSettings:{debriefingPhases:['예선']}},api.actor);
      assert.equal(released.success,true);
      const revoked=await raw(api,'getDebriefPhase',legacy.debriefToken,finals[0]);assert.equal(revoked.success,false);assert.equal(revoked.code,'DEBRIEF_PHASE_CLOSED');
      const prelim=await otpView(api,c,'예선');assert.equal(prelim.success,true);assert.deepEqual(prelim.availablePhases,['예선']);assert.ok(prelim.scores.every(row=>row.round==='예선'));
      await api.rpc('updateCompetitionAdminSettings',{code:c.code,debriefing:true,optionSettings:{debriefingPhases:finals}},api.actor);
      await api.rpc('updateCompetitionAdminSettings',{code:c.code,isActive:false,optionSettings:{publicationTestMarker:'preserved'}},api.actor);
      assert.deepEqual((await api.rpc('getConfig')).configs.find(row=>row.code===c.code).debriefingPhases,finals,'omitting the phase never reopens prelim');
      const current=await otpView(api,c,'결선');assert.equal(current.success,true);assert.ok(current.scores.every(row=>row.round==='결선'));
      await api.rpc('updateCompetitionAdminSettings',{code:c.code,debriefing:false},api.actor);
      assert.equal((await raw(api,'getDebriefPhase',current.debriefToken,'결선')).success,false);
      assert.equal((await api.rpc('getAdminDebriefPhase',c.code,c.units[0],'예선','예선',api.actor)).success,true);
    }
    assert.equal(snapshot(api),before,'publication controls never edit, delete or re-score any existing evaluation or assignment');
  }finally{api.close();}
});

test('publication settings validate inputs and require the same competition management authority as opening debriefs',async()=>{
  const api=await createRpcFixture();
  try{
    const settings=()=>api.db.prepare("SELECT * FROM competitions WHERE code='KCR'").get(),before=JSON.stringify(settings());
    for(const phases of ['결선',['전체'],['본선'],null,[true],[]]){
      const result=await raw(api,'updateCompetitionAdminSettings',{code:'KCR',debriefing:true,optionSettings:{debriefingPhases:phases}},api.actor);
      assert.equal(result.success,false);assert.equal(JSON.stringify(settings()),before);
    }
    assert.equal((await raw(api,'updateCompetitionAdminSettings',{code:'KCR',debriefing:true,optionSettings:{debriefingPhases:['예선']}},{})).success,false);
    await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',access:'KCR',name:'QA 일반 심사',phone:'01031600001',role:'센서리 심사위원'},api.actor);
    const judge=await api.rpc('judgeLogin','QA 일반 심사','01031600001');
    assert.equal((await raw(api,'updateCompetitionAdminSettings',{code:'KCR',debriefing:true,optionSettings:{debriefingPhases:['예선']}},judge)).success,false);
    assert.equal(JSON.stringify(settings()),before);
    for(const value of ['null','"broken"','[]','{}']){
      api.db.prepare("UPDATE competitions SET option_settings=? WHERE code='KCR'").run(value);
      assert.deepEqual((await api.rpc('getConfig')).configs.find(row=>row.code==='KCR').debriefingPhases,['결선']);
    }
    api.db.prepare("UPDATE competitions SET option_settings=? WHERE code='KCR'").run(JSON.stringify({debriefingPhases:'bad'}));
    assert.deepEqual((await api.rpc('getConfig')).configs.find(row=>row.code==='KCR').debriefingPhases,[],'malformed explicit policy fails closed');
  }finally{api.close();}
});
