// The random nonce and roster exist only in a private HTTPS request, never in source.
// This commitment authorizes exactly one pre-agreed plan, not arbitrary roster edits.
export const DEPLOYMENT_CORRECTION_DIGEST='30bbf11e4cd2e9e440922a44f75058b0827a4b1427f1364d9ce94a29a8f2c79d';
export async function verifyDeploymentCorrection(plan,expectedDigest=DEPLOYMENT_CORRECTION_DIGEST){
  if(!plan||plan.version!==1||!/^[a-f0-9]{64}$/.test(plan.nonce||'')||!Array.isArray(plan.mocFinalNames)||plan.mocFinalNames.length!==10||new Set(plan.mocFinalNames).size!==10)return false;
  if(plan.mocFinalNames.some(name=>typeof name!=='string'||!name.trim()||name.length>50)||typeof plan.kbcFirstPerformer!=='string'||!plan.kbcFirstPerformer.trim()||plan.kbcFirstPerformer.length>50)return false;
  const canonical=JSON.stringify({version:1,nonce:plan.nonce,mocFinalNames:plan.mocFinalNames,kbcFirstPerformer:plan.kbcFirstPerformer});
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
  const actual=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  return actual===expectedDigest;
}
