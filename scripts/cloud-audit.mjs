import fs from 'node:fs';
import path from 'node:path';
import {root} from './test-runner.mjs';
import {OPS_AUDIENCE,verifyOperationsToken} from '../lib/ops-auth.mjs';
import {releaseIdentity} from './release-identity.mjs';
const origin='https://kcl-cloudflare.pages.dev',codes=['KBC','KTCC','MOC','MOB','KCR','IKRC','KCAC'];
const selected=process.env.KCL_AUDIT_COMPETITION||'all';
if(selected!=='all'&&!codes.includes(selected))throw new Error('invalid competition');
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/main'||!process.env.ACTIONS_ID_TOKEN_REQUEST_URL||!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)throw new Error('운영 진단은 GitHub Actions의 main 작업에서 실행하세요. 영구 토큰은 필요하지 않습니다.');
const request=async(url,options={})=>fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});
const expected=process.env.GITHUB_SHA,expectedSource=releaseIdentity(root).sourceId;let release;
for(let attempt=0;attempt<144;attempt++){
  try{const response=await request(origin+'/api/health');const h=await response.json();if(response.ok&&h.success&&h.release?.sourceId===expectedSource&&h.release?.gate?.status==='passed'){release=h.release;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!release)throw new Error('검증된 커밋의 Cloudflare 배포를 확인하지 못했습니다. 기존 운영 데이터는 변경하지 않았습니다.');
const audits=[];
for(const code of selected==='all'?codes:[selected]){
  const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience',OPS_AUDIENCE);
  const response=await request(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});
  if(!response.ok)throw new Error('GitHub 단기 인증을 발급하지 못했습니다.');
  const token=(await response.json()).value;if(typeof token!=='string')throw new Error('단기 인증 응답이 올바르지 않습니다.');
  console.log('::add-mask::'+token);
  const result=await request(origin+'/api/operations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({competition:code})});
  const data=await result.json();
  if(result.status===401){
    const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
    console.error(JSON.stringify({authenticationStage:data.stage,localVerification:await verifyOperationsToken(token),claims:Object.fromEntries(['iss','aud','repository_id','repository_owner_id','ref','ref_type','workflow_ref','job_workflow_ref','runner_environment','event_name','iat','nbf','exp'].map(key=>[key,claims[key]]))}));
  }
  if(!result.ok||!data.success||data.release?.sourceId!==expectedSource)throw new Error('운영 진단 실패: '+code+' HTTP '+result.status);
  if(data.healthy!==true)throw new Error('운영 진단에서 관리자 확인이 필요합니다. 세부 정보는 관리자 세션에서만 확인하세요.');
  audits.push(true);
}
console.log('KCL_READ_ONLY_HEALTH_CHECK_PASSED');
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'KCL read-only health checks passed. No production records, counts or scores were exported.\n');
