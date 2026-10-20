import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
const source=fs.readFileSync('functions/api/rpc.js','utf8');
let clock=Date.now(),calls=0,fail=false,empty=false;
const RealDate=Date;
class ClockDate extends RealDate {static now(){return clock;}}
const context={Date:ClockDate,Map,Number,Math,Response,AbortSignal,encodeURIComponent,
 safeStr:x=>String(x??''),nowIso:()=>new Date(clock).toISOString(),
 getActor:async(env,a)=>a,hasAdmin:a=>a?.type==='ADMIN',
 fetch:async(url,opts)=>{
  calls++;assert.equal(url,'https://api.cloudflare.com/client/v4/graphql');
  const request=JSON.parse(opts.body);
  assert.match(request.query,/pagesFunctionsInvocationsAdaptiveGroups/);
  assert.match(request.query,/scriptName:\$script/);
  assert.equal(request.variables.script,'test-kcl-only');
  if(fail)throw new Error('test outage');
  return new Response(JSON.stringify({errors:null,data:{viewer:{accounts:[{
   totals:empty?[]:[{sum:{requests:200,errors:2},quantiles:{cpuTimeP50:2500,cpuTimeP99:18000}}],
   statuses:empty?[]:[{dimensions:{status:'success'},sum:{requests:198}},{dimensions:{status:'exceededResources'},sum:{requests:2}}]
  }]}}}));
 }};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('const operationalHealthMemory_'),source.indexOf('async function updateCompetitionAdminSettings')),context);
const env={D1_USAGE_ANALYTICS_TOKEN:'not-a-real-token',D1_USAGE_ACCOUNT_ID:'test',KCL_HEALTH_SCRIPT_NAME:'test-kcl-only'};
assert.equal((await context.getOperationalHealth(env,{type:'JUDGE'})).success,false);
assert.equal(calls,0);
assert.equal((await context.getOperationalHealth({}, {type:'ADMIN'})).available,false);
const results=await Promise.all(Array.from({length:8},()=>context.getOperationalHealth(env,{type:'ADMIN'})));
assert.equal(calls,1,'concurrent requests share a single external query');
assert.equal(results[0].requests,200);assert.equal(results[0].cpuP99Ms,18);
assert.equal(results[0].cpuP50Ms,2.5);assert.equal(results[0].errorPercent,1);
assert.equal(results[0].resourceErrors,2);assert.equal(results[0].state,'warning');
assert.ok(!JSON.stringify(results).includes('not-a-real-token'));
clock+=60001;fail=true;
const stale=await context.getOperationalHealth(env,{type:'ADMIN'});
assert.equal(stale.stale,true);assert.equal(stale.requests,200);assert.equal(calls,2);
await context.getOperationalHealth(env,{type:'ADMIN'});
assert.equal(calls,2,'failure backoff prevents polling storms');
clock+=300001;fail=false;empty=true;
assert.equal((await context.getOperationalHealth(env,{type:'ADMIN'})).state,'no_data');
assert.equal((await context.getOperationalHealth(env,{type:'ADMIN'})).cpuP99Ms,null);
const api=await createRpcFixture();
try{
 const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
 const payload={flavor:3.8,flavorIntensity:4,aftertaste:3.2,aftertastePersistence:5,acidity:3.4,acidityIntensity:4,
  sweetness:3.6,sweetnessIntensity:4,mouthfeel:3.2,mouthfeelIntensity:3,overall:3.6,
  tags:{flavor:['베리 > 블루베리','아몬드'],acidity:['밝은'],sweetness:['캐러멜'],mouthfeel:['매끄러운'],aftertaste:['깔끔한']},
  attributeComments:'온도가 낮아지며 단맛이 길게 남음'};
 const copy=JSON.stringify(payload),result=await api.rpc('generateCuppingComment',payload);
 assert.equal(JSON.stringify(payload),copy);
 assert.equal(result.comments.length,2);
 for(const comment of result.comments){
  assert.equal(comment.split('\n').length,5);
  assert.ok(comment.length<420,comment);
  for(const text of ['블루베리','아몬드','산미','캐러멜','마우스필','여운','단맛이 길게'])assert.ok(comment.includes(text),text);
  assert.doesNotMatch(comment,/연습|훈련|해야 합니다|총점/);
 }
 const kbc=await api.rpc('generateKbcComment',{presentationVal:3,espressoVals:[3,3,3,3],machineVal:3});
 assert.equal(kbc.comments[0].split('\n').length,4);assert.doesNotMatch(kbc.comments[0],/창작음료/);
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before);
}finally{api.close();}
console.log('Stage250 health isolation, units, cache, outage/backoff, concise generation and data preservation passed.');
