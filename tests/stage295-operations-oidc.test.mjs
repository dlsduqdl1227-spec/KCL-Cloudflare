import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyOperationsToken,OPS_AUDIENCE} from '../lib/ops-auth.mjs';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'qa-key',use:'sig',alg:'RS256'};
const seconds=1800000000,now=seconds*1000;
const original={iss:'https://token.actions.githubusercontent.com',aud:OPS_AUDIENCE,repository:'dlsduqdl1227-spec/KCL-Cloudflare',repository_id:'1283722078',repository_owner_id:'240860836',ref:'refs/heads/main',ref_type:'branch',workflow_ref:'dlsduqdl1227-spec/KCL-Cloudflare/.github/workflows/kcl-cloud.yml@refs/heads/main',runner_environment:'github-hosted',event_name:'push',sub:'repo:immutable-id:ref:refs/heads/main',iat:seconds-5,nbf:seconds-5,exp:seconds+295};
const b64=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
async function signed(changes={},header={}){const h=b64({alg:'RS256',kid:'qa-key',...header}),p=b64({...original,...changes});return h+'.'+p+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(h+'.'+p))).toString('base64url');}
const fetcher=async(url,options)=>{assert.equal(url,'https://token.actions.githubusercontent.com/.well-known/jwks');assert.equal(options.redirect,'error');return new Response(JSON.stringify({keys:[jwk]}));};
test('only signed main deployment workflow tokens with immutable repository IDs authorize diagnostics',async()=>{
  assert.equal(await verifyOperationsToken(await signed(),{now,fetcher}),true);
  assert.equal(await verifyOperationsToken(await signed({event_name:'workflow_dispatch'}),{now,fetcher}),true);
});
for(const [name,change] of Object.entries({fork:{repository_id:'123'},owner:{repository_owner_id:'123'},rename:{repository:'other/KCL-Cloudflare'},audience:{aud:'other'},issuer:{iss:'https://attacker.test'},branch:{ref:'refs/heads/other'},workflow:{workflow_ref:'other.yml'},pull_request:{event_name:'pull_request'},reusable:{job_workflow_ref:'attacker.yml'},self_hosted:{runner_environment:'self-hosted'},expired:{exp:seconds},future:{iat:seconds+60,nbf:seconds+60},long_lived:{exp:seconds+1800},missing_subject:{sub:''}})){
  test('rejects '+name,async()=>assert.equal(await verifyOperationsToken(await signed(change),{now,fetcher}),false));
}
test('rejects forged signatures, alg confusion, unavailable key service and oversized tokens',async()=>{
  const valid=await signed(),parts=valid.split('.');parts[1]=b64({...original,event_name:'workflow_dispatch'});
  assert.equal(await verifyOperationsToken(parts.join('.'),{now,fetcher}),false);
  assert.equal(await verifyOperationsToken(await signed({},{alg:'none'}),{now,fetcher}),false);
  assert.equal(await verifyOperationsToken(valid,{now,fetcher:async()=>{throw new Error('unavailable');}}),false);
  assert.equal(await verifyOperationsToken('x'.repeat(17000),{now,fetcher}),false);
  assert.equal(await verifyOperationsToken(undefined,{now,fetcher}),false);
});
test('unknown key IDs cannot force repeated requests to the GitHub key service',async()=>{
  let requests=0;const bounded=async(...args)=>{requests++;return fetcher(...args);};
  assert.equal(await verifyOperationsToken(await signed(),{now,fetcher:bounded}),true);
  for(const kid of ['unknown-1','unknown-2','unknown-3'])assert.equal(await verifyOperationsToken(await signed({},{kid}),{now,fetcher:bounded}),false);
  assert.equal(requests,1);
});
