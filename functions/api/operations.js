import {RELEASE_INFO} from '../../lib/release-info.mjs';
import {verifyOperationsToken} from '../../lib/ops-auth.mjs';
import {runCompetitionAudit} from './rpc.js';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function onRequestPost({request,env}){
  const token=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.headers.get('Authorization')||'')?.[1];
  let stage='token_format';
  if(!await verifyOperationsToken(token,{onReject:code=>{stage=code;}}))return new Response(JSON.stringify({success:false,error:'unauthorized',stage}),{status:401,headers});
  if(Number(request.headers.get('content-length')||0)>1024)return new Response(JSON.stringify({success:false,error:'request_too_large'}),{status:413,headers});
  let body;try{const text=await request.text();if(text.length>1024)throw new Error();body=JSON.parse(text);}catch{return new Response(JSON.stringify({success:false,error:'invalid_request'}),{status:400,headers});}
  if(!['KBC','KTCC','MOC','MOB','KCR','IKRC','KCAC'].includes(body?.competition))return new Response(JSON.stringify({success:false,error:'invalid_competition'}),{status:400,headers});
  try{
    const audit=await runCompetitionAudit(env,body.competition);
    // Machine access reveals a health flag only. No counts, rounds, issues,
    // identities, score records or private metadata leave this endpoint.
    return new Response(JSON.stringify({success:true,release:RELEASE_INFO,healthy:audit.status!=='error'}),{headers});
  }
  catch{return new Response(JSON.stringify({success:false,error:'audit_unavailable',release:RELEASE_INFO}),{status:503,headers});}
}
