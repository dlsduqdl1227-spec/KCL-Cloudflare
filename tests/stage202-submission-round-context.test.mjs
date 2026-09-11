import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const shim=fs.readFileSync(new URL('../public/assets/kcl-api-shim.js',import.meta.url),'utf8');
let current={code:'KCAC',round:'예선'},calls=[];
const context={window:{kclEvaluationSubmissionContext_:()=>current},navigator:{onLine:true},Proxy,AbortController,console,
  setTimeout:fn=>{fn();return 1;},clearTimeout:()=>{},
  fetch:async(url,options)=>{calls.push(JSON.parse(options.body));current={code:'MOB',round:'결선'};
    if(calls.length===1)return {ok:false,status:503,headers:{get:()=>''},text:async()=>'<html>busy</html>'};
    return {ok:true,status:200,text:async()=>'{"success":true}'};
  }};
vm.runInNewContext(shim,context);
const payload={competitionCode:'KCAC',rows:[{data:['1'],extraFields:{총점:40}}]};
await new Promise((resolve,reject)=>context.window.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).submitScores(payload));
assert.equal(calls.length,2);
assert.deepEqual(calls[0].args,calls[1].args,'network retry keeps the round captured at first submission');
assert.equal(calls[0].args[0].round,'예선');
assert.equal(payload.round,undefined,'transport must not mutate the active form object');
calls=[];current={code:'KCAC',round:'예선'};
// Explicit saved round and different competition payloads are never overwritten.
context.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,status:200,text:async()=>'{"success":true}'};};
await new Promise(resolve=>context.window.google.script.run.withSuccessHandler(resolve).submitScores({competitionCode:'KCAC',round:'결선'}));
await new Promise(resolve=>context.window.google.script.run.withSuccessHandler(resolve).submitScores({competitionCode:'MOB'}));
assert.equal(calls[0].args[0].round,'결선');
assert.equal(calls[1].args[0].round,undefined);
console.log('Stage202 submission-round snapshot and retry isolation passed.');
