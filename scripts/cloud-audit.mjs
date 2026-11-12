import fs from 'node:fs';
import path from 'node:path';
import {root} from './test-runner.mjs';
import {OPS_AUDIENCE} from '../lib/ops-auth.mjs';
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
  const data=await result.json();if(!result.ok||!data.success||data.release?.sourceId!==expectedSource)throw new Error('운영 진단 실패: '+code+' HTTP '+result.status);
  audits.push(data.audit);console.log(code+': '+data.audit.status+' ('+data.audit.records+' records)');
}
const report={schemaVersion:1,checkedSourceCommit:expected,sourceId:expectedSource,checkedAt:new Date().toISOString(),readOnly:true,audits};
const dir=path.join(root,'tmp/kcl-checks');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'live.json'),JSON.stringify(report,null,2)+'\n');
const summary=['## KCL 운영 진단','',`Commit: ${expected}`,'','| 대회 | 상태 | 저장 기록 | 순위 항목 | 오류 | 경고 |','|---|---|---:|---:|---:|---:|',...audits.map(a=>`| ${a.competition} | ${a.status} | ${a.records} | ${a.rounds.reduce((n,r)=>n+r.rankedUnits,0)} | ${a.issues.filter(i=>i.severity==='error').reduce((n,i)=>n+i.count,0)} | ${a.issues.filter(i=>i.severity==='warning').reduce((n,i)=>n+i.count,0)} |`),'','읽기 전용. 이름·연락처·개별 점수는 보고하지 않으며 점수·순위·검수·명단을 변경하지 않습니다.',''];
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary.join('\n'));
if(audits.some(a=>a.status==='error'))process.exitCode=1;
