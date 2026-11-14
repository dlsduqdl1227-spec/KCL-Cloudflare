import {verifyMocFinalResultPlan,applyMocFinalResult} from '../../lib/moc-final-result-20261114.mjs';
import {markRequestedMocFinalParticipants} from '../../lib/moc-final-registration.mjs';
import {reverseRequestedKbcFinalOrder} from '../../lib/kbc-final-order-20261113.mjs';
import {verifyDeploymentCorrection} from '../../lib/deployment-correction-20261113.mjs';
export async function onRequest(context){
  const {request,env}=context,url=new URL(request.url);
  // A nonce-blinded commitment matches only the exact deployment-authorized plan.
  // No real participant names, nonce or credentials are published in source.
  // Ordinary RPC authentication remains unchanged; previews never write live D1.
  const origin=request.headers.get('Origin');
  if(url.hostname==='kcl-cloudflare.pages.dev'&&url.pathname==='/api/rpc'&&request.method==='POST'&&(!origin||origin===url.origin)&&request.headers.get('X-KCL-Correction')==='20261113-finals'){
    let plan;try{plan=(await request.clone().json()).deploymentCorrection;}catch{}
    if(await verifyDeploymentCorrection(plan)){
      try{await markRequestedMocFinalParticipants(env.DB,plan.mocFinalNames);}
      catch{console.error('MOC_FINAL_REGISTRATION_DEFERRED');}
      try{await reverseRequestedKbcFinalOrder(env.DB,plan.kbcFirstPerformer);}
      catch{console.error('KBC_FINAL_ORDER_DEFERRED');}
    }
  }
  if(url.hostname==='kcl-cloudflare.pages.dev'&&url.pathname==='/api/rpc'&&request.method==='POST'&&(!origin||origin===url.origin)&&request.headers.get('X-KCL-Correction')==='20261114-moc-final-result'){
    let plan;try{plan=(await request.clone().json()).mocFinalResult;}catch{}
    if(await verifyMocFinalResultPlan(plan)){
      let applied=false;try{applied=await applyMocFinalResult(env.DB,plan.entries);}catch{console.error('MOC_FINAL_RESULT_DEFERRED');}
      const original=await context.next(),response=new Response(original.body,original);
      response.headers.set('X-KCL-MOC-Result',applied?'applied':'deferred');
      return response;
    }
  }
  return context.next();
}
