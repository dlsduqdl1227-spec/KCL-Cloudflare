import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedIkrcFinal,ikrcFinalSubmission} from './helpers/ikrc-final-fixture.mjs';
const tables=['scores','participants','operators','sessions','system_settings','competitions'];
const snapshot=api=>JSON.stringify(tables.map(t=>api.db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()));
test('all seven competitions can be audited without writing any records or disclosing identities',async()=>{
  const api=await createRpcFixture();try{
    const before=snapshot(api),prepare=api.env.DB.prepare;api.env.DB.prepare=sql=>{assert.match(sql,/^SELECT\b/i);return prepare(sql);};
    for(const code of ['KBC','KTCC','MOC','MOB','KCR','IKRC','KCAC']){
      const result=await api.audit(code);assert.equal(result.competition,code);assert.equal(result.readOnly,true);assert.equal(result.status,'ok');assert.ok(result.rounds.every(r=>r.state==='not_started'));
      assert.doesNotMatch(JSON.stringify(result),/검수 QA|01099990000|local-qa-only|judgeToken|payload_json/);
    }
    assert.equal(snapshot(api),before);await assert.rejects(api.audit('OTHER'),/invalid competition/);
  }finally{api.close();}
});
test('live IKRC audit counts five sensory votes, preserves history and reports incomplete panels as pending',async()=>{
  const api=await createRpcFixture();try{
    const {judges,stations}=await seedIkrcFinal(api),ids=judges.map(j=>j.operatorRows.find(r=>r.access==='IKRC').rowIndex);
    api.db.prepare('INSERT INTO system_settings(setting_key,setting_value,updated_at) VALUES(?,?,?)').run('ikrc_final_judge_roster',JSON.stringify({headOperatorId:ids[0],sensoryOperatorIds:ids.slice(1)}),new Date().toISOString());
    for(const judge of judges)await api.rpc('submitScores',ikrcFinalSubmission(judge,stations[0],6));
    const before=snapshot(api),report=await api.audit('IKRC');assert.equal(report.status,'ok');assert.equal(report.rounds.find(r=>r.round==='결선').rankedUnits,6);assert.equal(report.rounds.find(r=>r.round==='결선').incompletePanels,0);assert.equal(snapshot(api),before);
    api.db.prepare("UPDATE scores SET review_status='반려' WHERE judge_name=?").run(judges[1].name);
    const changed=snapshot(api),pending=await api.audit('IKRC');assert.equal(pending.status,'ok');assert.equal(pending.rounds.find(r=>r.round==='결선').incompletePanels,6);assert.equal(pending.rounds.find(r=>r.round==='결선').returned,6);assert.equal(snapshot(api),changed);
    for(const judge of judges)assert.ok(!JSON.stringify(pending).includes(judge.name));
  }finally{api.close();}
});
test('authenticated audit RPC rejects anonymous and other-competition staff',async()=>{
  const api=await createRpcFixture();try{
    const raw=(...args)=>api.handle({action:'getCompetitionOpsAudit',args}).then(r=>r.json());
    assert.equal((await raw('IKRC',{})).success,false);
    await api.rpc('upsertOperatorAccount',{accountType:'TEAMLEAD',name:'다른 대회 팀장',phone:'01088006666',access:'MOB',role:'팀장'},api.actor);
    const actor=await api.rpc('judgeLogin','다른 대회 팀장','01088006666');assert.equal((await raw('IKRC',{judgeToken:actor.judgeToken})).success,false);
    assert.equal((await raw('MOB',{judgeToken:actor.judgeToken})).success,true);
  }finally{api.close();}
});
test('public health is a read-only schema probe and returns no data on database failure',async()=>{
  let source=fs.readFileSync(new URL('../functions/api/health.js',import.meta.url),'utf8');source=source.replace("import {RELEASE_INFO} from '../../lib/verified-release.mjs';","const RELEASE_INFO={commit:'test',gate:{status:'passed'}};");
  const {onRequestGet}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  let queries=0;const env={DB:{prepare(sql){queries++;assert.match(sql,/^SELECT\b/);return {all:async()=>({results:tables.map(name=>({name}))})};}}};
  const good=await onRequestGet({env});assert.equal(good.status,200);assert.equal((await good.json()).status,'ready');assert.equal(queries,1);
  const bad=await onRequestGet({env:{}});assert.equal(bad.status,503);assert.doesNotMatch(await bad.text(),/score|phone|name|SQL/);
});
test('operations endpoint rejects unsigned requests before touching D1',async()=>{
  let source=fs.readFileSync(new URL('../functions/api/operations.js',import.meta.url),'utf8');
  source=source.replace("import {RELEASE_INFO} from '../../lib/verified-release.mjs';","const RELEASE_INFO={commit:'test'};").replace("import {verifyOperationsToken} from '../../lib/ops-auth.mjs';","const verifyOperationsToken=async()=>false;").replace("import {runCompetitionAudit} from './rpc.js';","const runCompetitionAudit=()=>{throw new Error('D1 must not be touched');};");
  const {onRequestPost}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const response=await onRequestPost({request:new Request('https://qa.test/api/operations',{method:'POST',body:'{}'}),env:{}});assert.equal(response.status,401);
});
