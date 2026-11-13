import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyDeploymentCorrection} from '../lib/deployment-correction-20261113.mjs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {markRequestedMocFinalParticipants,MOC_FINAL_REGISTRATION_KEY} from '../lib/moc-final-registration.mjs';
import {onRequest} from '../functions/api/_middleware.js';
const MOC_FINAL_NAMES=Object.freeze(Array.from({length:10},(_,i)=>'QA 결선 참가자 '+(i+1)));
const mark=env=>markRequestedMocFinalParticipants(env.DB,MOC_FINAL_NAMES);
const fixturePlan={version:1,nonce:'a'.repeat(64),mocFinalNames:MOC_FINAL_NAMES,kbcFirstPerformer:'QA 첫 시연자'};
const fixtureDigest=createHash('sha256').update(JSON.stringify(fixturePlan)).digest('hex');
const dataUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const guardSource=fs.readFileSync(new URL('../lib/deployment-correction-20261113.mjs',import.meta.url),'utf8').replace(/(export const DEPLOYMENT_CORRECTION_DIGEST=)'[a-f0-9]+'/,"$1'"+fixtureDigest+"'");
const testMiddlewareSource=fs.readFileSync(new URL('../functions/api/_middleware.js',import.meta.url),'utf8')
  .replace('../../lib/moc-final-registration.mjs',new URL('../lib/moc-final-registration.mjs',import.meta.url).href)
  .replace('../../lib/kbc-final-order-20261113.mjs',new URL('../lib/kbc-final-order-20261113.mjs',import.meta.url).href)
  .replace('../../lib/deployment-correction-20261113.mjs',dataUrl(guardSource));
const {onRequest:applyFixtureRequest}=await import(dataUrl(testMiddlewareSource));
const participants=api=>api.db.prepare('SELECT * FROM participants ORDER BY id').all();
const snapshot=api=>JSON.stringify(participants(api));
const scores=api=>JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
const receipt=api=>api.db.prepare('SELECT setting_value FROM system_settings WHERE setting_key=?').get(MOC_FINAL_REGISTRATION_KEY);
async function seed(api){
  for(const [i,name] of MOC_FINAL_NAMES.entries())await api.rpc('upsertParticipant',{competitionCode:'MOC',name,affiliation:'보존 소속',phone:'010700000'+String(i).padStart(2,'0'),uniqueNo:String(201+i),prelimCupNo:String(101+i),mainCupNo:String(41+i),extra:{note:'보존 메모',roundSchedules:{본선:{order:20-i,date:'2026-11-13'}}}},api.actor);
  await api.rpc('upsertParticipant',{competitionCode:'MOC',name:'다른 기존 결선 선수',uniqueNo:'999',finalCupNo:'999',extra:{note:'이 선수는 그대로'}},api.actor);
  await api.rpc('upsertParticipant',{competitionCode:'MOB',name:MOC_FINAL_NAMES[0],uniqueNo:'1',finalCupNo:'7'},api.actor);
}
function score(api,name,unit,round='결선'){
  api.db.prepare('INSERT INTO scores(submitted_at,competition_code,round,unit,participant_name,total_score,review_status,payload_json) VALUES(?,?,?,?,?,?,?,?)').run('2026-11-13','MOC',round,unit,name,87.25,'검수완료',JSON.stringify({extraFields:{'참가자번호':unit,'총점':87.25,'종합코멘트':'평가 원문 보존'}}));
}
test('the ten requested names get final participation using existing numbers, never supplied finishing ranks',async()=>{
  const api=await createRpcFixture();try{
    await seed(api);api.db.prepare("UPDATE participants SET final_cup_no='77' WHERE competition_code='MOC' AND name=?").run(MOC_FINAL_NAMES[0]);
    score(api,MOC_FINAL_NAMES[1],'88');score(api,MOC_FINAL_NAMES[2],'43','본선');
    const before=participants(api),originalScores=scores(api),config=JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY id').all());
    assert.equal(await mark(api.env),true);
    const after=participants(api);assert.equal(after.length,before.length);
    for(const old of before){
      const row=after.find(r=>r.id===old.id),index=MOC_FINAL_NAMES.indexOf(old.name);
      if(old.competition_code!=='MOC'||index<0){assert.deepEqual(row,old);continue;}
      const expected=index===0?'77':index===1?'88':old.main_cup_no;
      assert.equal(row.final_cup_no,expected);
      const {final_cup_no,updated_at,...rest}=row,{final_cup_no:oldFinal,updated_at:oldUpdated,...oldRest}=old;assert.deepEqual(rest,oldRest);
    }
    assert.equal(scores(api),originalScores);assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY id').all()),config);
    const saved=JSON.parse(receipt(api).setting_value);assert.equal(saved.status,'applied');assert.equal(saved.changes.length,10);assert.ok(saved.changes.every(r=>'previousFinalNo' in r));
  }finally{api.close();}
});
test('a completed one-time registration never reapplies or overwrites later operator changes',async()=>{
  const api=await createRpcFixture();try{
    await seed(api);await mark(api.env);const before=snapshot(api);assert.equal(await mark(api.env),true);assert.equal(snapshot(api),before);
    api.db.prepare("UPDATE participants SET final_cup_no='' WHERE competition_code='MOC' AND name=?").run(MOC_FINAL_NAMES[0]);
    const changed=snapshot(api);assert.equal(await mark(api.env),true);assert.equal(snapshot(api),changed);
  }finally{api.close();}
});
for(const scenario of ['missing','duplicate','number_collision','ambiguous_score'])test('registration is an atomic no-op for '+scenario,async()=>{
  const api=await createRpcFixture();try{
    await seed(api);
    if(scenario==='missing')api.db.prepare("DELETE FROM participants WHERE competition_code='MOC' AND name=?").run(MOC_FINAL_NAMES[0]);
    if(scenario==='duplicate')api.db.prepare("INSERT INTO participants(competition_code,name,unique_no,extra_json,updated_at) VALUES('MOC',?,'400','{}','QA')").run(MOC_FINAL_NAMES[0]);
    if(scenario==='number_collision')api.db.prepare("UPDATE participants SET final_cup_no='41' WHERE competition_code='MOC' AND name='다른 기존 결선 선수'").run();
    if(scenario==='ambiguous_score'){score(api,MOC_FINAL_NAMES[0],'20');score(api,MOC_FINAL_NAMES[0],'21');}
    const before=snapshot(api),originalScores=scores(api);assert.equal(await mark(api.env),false);assert.equal(snapshot(api),before);assert.equal(scores(api),originalScores);assert.equal(receipt(api),undefined);
  }finally{api.close();}
});
test('a concurrent roster edit cannot cause partial registration or overwrite that edit',async()=>{
  let change=null;const api=await createRpcFixture({beforeBatch:()=>{if(change){change();change=null;}}});try{
    await seed(api);change=()=>api.db.prepare("UPDATE participants SET main_cup_no='500' WHERE competition_code='MOC' AND name=?").run(MOC_FINAL_NAMES[0]);
    assert.equal(await mark(api.env),false);assert.equal(receipt(api),undefined);
    assert.ok(participants(api).filter(p=>p.competition_code==='MOC'&&MOC_FINAL_NAMES.includes(p.name)).every(p=>!p.final_cup_no));
    assert.equal(api.db.prepare("SELECT main_cup_no n FROM participants WHERE competition_code='MOC' AND name=?").get(MOC_FINAL_NAMES[0]).n,'500');
  }finally{api.close();}
});
test('preview, GET health and foreign-origin requests never apply the production correction',async()=>{
  const api=await createRpcFixture();try{
    await seed(api);const before=snapshot(api);let calls=0;
    for(const request of [new Request('https://preview.kcl-cloudflare.pages.dev/api/rpc',{method:'POST'}),new Request('https://kcl-cloudflare.pages.dev/api/health'),new Request('https://kcl-cloudflare.pages.dev/api/rpc',{method:'POST',headers:{Origin:'https://foreign.test'}})])await onRequest({request,env:api.env,next:()=>{calls++;return new Response('next');}});
    assert.equal(calls,3);assert.equal(snapshot(api),before);assert.equal(receipt(api),undefined);
    await onRequest({request:new Request('https://kcl-cloudflare.pages.dev/api/rpc',{method:'POST'}),env:api.env,next:()=>new Response('next')});assert.equal(receipt(api),undefined);
    await mark(api.env);assert.equal(JSON.parse(receipt(api).setting_value).status,'applied');
    const denied=await(await api.handle({action:'listParticipants',args:['MOC',{}]})).json();assert.equal(denied.success,false);
  }finally{api.close();}
});
test('machine diagnostics verify completion read-only and reveal no registration details',async()=>{
  let source=fs.readFileSync(new URL('../functions/api/operations.js',import.meta.url),'utf8');
  source=source.replace("import {RELEASE_INFO} from '../../lib/release-info.mjs';","const RELEASE_INFO={sourceId:'test'};").replace("import {verifyOperationsToken} from '../../lib/ops-auth.mjs';","const verifyOperationsToken=async()=>true;").replace("import {runCompetitionAudit} from './rpc.js';","const runCompetitionAudit=async()=>({status:'ok'});");
  const {onRequestPost}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const api=await createRpcFixture();try{
    await seed(api);const call=()=>onRequestPost({request:new Request('https://qa.test/api/operations',{method:'POST',body:JSON.stringify({competition:'MOC'})}),env:api.env});
    const before=snapshot(api),pending=await(await call()).json();assert.equal(pending.healthy,false);assert.equal(snapshot(api),before);
    await mark(api.env);const after=snapshot(api),response=await call(),text=await response.text();assert.equal(JSON.parse(text).healthy,true);assert.equal(snapshot(api),after);assert.doesNotMatch(text,/QA 결선 참가자|participants|previousFinalNo|changes/);
  }finally{api.close();}
});
test('the blinded commitment accepts only the exact requested plan and never reveals its nonce or names in source',async()=>{
  assert.equal(await verifyDeploymentCorrection(fixturePlan,fixtureDigest),true);
  assert.equal(await verifyDeploymentCorrection(fixturePlan),false);
  for(const changed of [{...fixturePlan,nonce:'b'.repeat(64)},{...fixturePlan,kbcFirstPerformer:'다른 선수'},{...fixturePlan,mocFinalNames:[...MOC_FINAL_NAMES].reverse()},{...fixturePlan,mocFinalNames:['임의 선수']}])assert.equal(await verifyDeploymentCorrection(changed,fixtureDigest),false);
});
test('only the exact committed plan on the production RPC can apply the fixed correction',async()=>{
  const api=await createRpcFixture();try{
    await seed(api);const before=snapshot(api);
    const request=(url,plan,origin)=>new Request(url,{method:'POST',headers:{'Content-Type':'application/json','X-KCL-Correction':'20261113-finals',...(origin?{Origin:origin}:{})},body:JSON.stringify({action:'getConfig',args:[],deploymentCorrection:plan})});
    for(const req of [request('https://preview.kcl-cloudflare.pages.dev/api/rpc',fixturePlan),request('https://kcl-cloudflare.pages.dev/api/rpc',fixturePlan,'https://foreign.test'),request('https://kcl-cloudflare.pages.dev/api/rpc',{...fixturePlan,kbcFirstPerformer:'타인'})])await applyFixtureRequest({request:req,env:api.env,next:()=>new Response('next')});
    assert.equal(snapshot(api),before);assert.equal(receipt(api),undefined);
    await applyFixtureRequest({request:request('https://kcl-cloudflare.pages.dev/api/rpc',fixturePlan),env:api.env,next:()=>new Response('next')});
    assert.equal(JSON.parse(receipt(api).setting_value).status,'applied');assert.ok(participants(api).filter(p=>p.competition_code==='MOC'&&MOC_FINAL_NAMES.includes(p.name)).every(p=>p.final_cup_no));
    const denied=await(await api.handle({action:'listParticipants',args:['MOC',{}]})).json();assert.equal(denied.success,false);
  }finally{api.close();}
});
