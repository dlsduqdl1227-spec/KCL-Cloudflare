// Only the deployment repository's main-branch workflow may read anonymous diagnostics.
// No administrator session, permanent token, or state-changing capability is granted.
const ISSUER='https://token.actions.githubusercontent.com';
const JWKS=ISSUER+'/.well-known/jwks';
const REPOSITORY='dlsduqdl1227-spec/KCL-Cloudflare';
export const OPS_AUDIENCE='https://kcl-cloudflare.pages.dev/api/operations';
let cache=null;
function decode(value){
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('invalid encoding');
  return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
}
export async function verifyOperationsToken(token,{fetcher=fetch,now=Date.now()}={}){
  try{
    if(typeof token!=='string'||token.length>16384)return false;
    const parts=token.split('.');if(parts.length!==3)return false;
    const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const seconds=Math.floor(now/1000),workflow=REPOSITORY+'/.github/workflows/kcl-cloud.yml@refs/heads/main';
    if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256||header.crit)return false;
    if(claims.iss!==ISSUER||claims.aud!==OPS_AUDIENCE||claims.repository!==REPOSITORY||String(claims.repository_id)!=='1283722078'||String(claims.repository_owner_id)!=='240860836')return false;
    if(claims.ref!=='refs/heads/main'||claims.ref_type!=='branch'||claims.workflow_ref!==workflow||claims.runner_environment!=='github-hosted')return false;
    if(claims.job_workflow_ref&&claims.job_workflow_ref!==workflow)return false;
    if(!['push','workflow_dispatch'].includes(claims.event_name)||typeof claims.sub!=='string'||!claims.sub)return false;
    if(!Number.isInteger(claims.exp)||!Number.isInteger(claims.iat)||!Number.isInteger(claims.nbf)||claims.exp<=seconds||claims.nbf>seconds+30||claims.iat>seconds+30||claims.iat<seconds-900||claims.exp-claims.iat>900||claims.exp<=claims.iat)return false;
    if(!cache||cache.expires<=now||cache.fetcher!==fetcher||!cache.keys.some(k=>k.kid===header.kid)){
      const response=await fetcher(JWKS,{signal:AbortSignal.timeout(5000),redirect:'error'});
      if(!response.ok)return false;
      const data=await response.json();if(!Array.isArray(data.keys)||data.keys.length>30)return false;
      cache={keys:data.keys,expires:now+5*60*1000,fetcher};
    }
    const matches=cache.keys.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
    if(matches.length!==1)return false;
    const key=await crypto.subtle.importKey('jwk',matches[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  }catch{return false;}
}
