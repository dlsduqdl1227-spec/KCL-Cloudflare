import {verifyOperationsToken} from '../../lib/ops-auth.mjs';
export async function onRequestGet({request,env}){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 const token=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.headers.get('Authorization')||'')?.[1];
 if(!await verifyOperationsToken(token))return new Response(JSON.stringify({success:false}),{status:401,headers});
 const ready=!!String(env.KCL_ADMIN_SECRET_CODE||env.ADMIN_SECRET_CODE||'').trim();
 return new Response(JSON.stringify({success:true,ready}),{headers});
}
