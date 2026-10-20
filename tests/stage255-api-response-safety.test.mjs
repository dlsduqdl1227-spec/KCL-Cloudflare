import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/assets/kcl-api-shim.js',import.meta.url),'utf8');
function fixture(fetcher){
  const timers=new Map();let nextId=0;
  const context={window:{},navigator:{onLine:true},AbortController,Proxy,console,
    setTimeout(fn,delay){if(delay<60000){queueMicrotask(fn);return ++nextId;}timers.set(++nextId,fn);return nextId;},
    clearTimeout(id){timers.delete(id);},fetch:fetcher};
  vm.runInNewContext(source,context);
  return {timers,rpc:(action,...args)=>new Promise((resolve,reject)=>{
    context.window.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[action](...args);
  })};
}
const response=(body,status=200)=>({ok:status===200,status,headers:{get:()=>''},text:async()=>body});
const failures=[];
async function check(name,test){try{await test();console.log('PASS '+name);}catch(error){failures.push(name);console.error('FAIL '+name+': '+error.message);}}
await check('the timeout covers response body transfer, not just headers',async()=>{
  let calls=0,bodyStarted;
  const started=new Promise(resolve=>{bodyStarted=resolve;});
  const qa=fixture(async(url,options)=>{
    if(++calls>1)return response('{"success":true,"list":[]}');
    return {ok:true,status:200,text:()=>new Promise((resolve,reject)=>{
      bodyStarted();options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('body timeout'),{name:'AbortError'})));
    })};
  });
  const pending=qa.rpc('getReviewList','KCR',{round:'결선',judgeToken:'local-test'});
  await started;
  assert.equal(qa.timers.size,1,'a hung response body must still have an active deadline');
  [...qa.timers.values()][0]();
  assert.equal((await pending).success,true);
  assert.equal(calls,2);
  assert.equal(qa.timers.size,0);
});
await check('write retries keep the originally submitted nested values',async()=>{
  const payload={competitionCode:'KCAC',round:'결선',clientSubmissionId:'same-request',rows:[{data:['201',3.8],extraFields:{comment:'제출 당시 기록',tags:['언더필']}}]};
  const calls=[];
  const qa=fixture(async(url,options)=>{
    calls.push(JSON.parse(options.body));
    if(calls.length===1){
      payload.rows[0].data[1]=1;
      payload.rows[0].extraFields.comment='다음 화면에서 편집한 내용';
      payload.rows[0].extraFields.tags.push('다른 잔');
      return response('{"success":false,"message":"temporary"}',503);
    }
    return response('{"success":true}');
  });
  assert.equal((await qa.rpc('submitScores',payload)).success,true);
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1].args,calls[0].args);
  assert.equal(calls[1].args[0].rows[0].data[1],3.8);
});
await check('empty or malformed success responses retry instead of erasing list state',async()=>{
  for(const body of ['', 'null', '[]', '{}', '{"success":"true"}']){
    let calls=0;
    const qa=fixture(async()=>response(++calls===1?body:'{"success":true,"list":[{"id":17}]}'));
    const result=await qa.rpc('getRanking','KCR',{round:'결선'});
    assert.equal(result.success,true,JSON.stringify(body));
    assert.equal(calls,2,JSON.stringify(body));
    assert.equal(result.list[0].id,17);
  }
});
await check('business rejections and forbidden responses do not retry',async()=>{
  let calls=0;
  const qa=fixture(async()=>{calls++;return response('{"success":false,"message":"검증 거부"}');});
  assert.equal((await qa.rpc('submitScores',{})).success,false);
  assert.equal(calls,1);
  let forbiddenCalls=0;
  const denied=fixture(async()=>{forbiddenCalls++;return response('{"success":false,"message":"denied"}',403);});
  await assert.rejects(denied.rpc('getReviewList','KCR',{}),/denied/);
  assert.equal(forbiddenCalls,1);
});
await check('failed requests never produce a successful empty list and can be retried later',async()=>{
  let calls=0,healthy=false;
  const qa=fixture(async()=>{calls++;return response(healthy?'{"success":true,"list":[1]}':'');});
  await assert.rejects(qa.rpc('getReviewList','KCR',{}),/다시 연결/);
  assert.equal(calls,6);
  healthy=true;
  assert.equal((await qa.rpc('getReviewList','KCR',{})).list[0],1);
  assert.equal(calls,7,'failed shared-read entries must be released');
});
await check('non-retry-safe writes and non-serializable arguments are not resent',async()=>{
  let calls=0;
  const qa=fixture(async()=>{calls++;return response('',503);});
  await assert.rejects(qa.rpc('deleteParticipant',17),/다시 연결/);
  assert.equal(calls,1);
  const circular={};circular.self=circular;
  await assert.rejects(qa.rpc('submitScores',circular),/전송할 내용/);
  assert.equal(calls,1,'invalid serialization must not send a partial request');
});
assert.deepEqual(failures,[]);
