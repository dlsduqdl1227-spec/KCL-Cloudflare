import {RELEASE_INFO} from '../../lib/release-info.mjs';
export async function onRequestGet({env}){
  let ready=false;
  try{
    // Read-only readiness. Never initialize schema or accounts from a probe.
    const result=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('competitions','scores','participants','operators','sessions','system_settings')").all();
    ready=new Set((result.results||[]).map(r=>r.name)).size===6;
  }catch{}
  return new Response(JSON.stringify({success:ready,status:ready?'ready':'unavailable',release:RELEASE_INFO}),{status:ready?200:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
