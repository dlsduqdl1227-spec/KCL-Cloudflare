import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/assets/kcl-api-shim.js',import.meta.url),'utf8');
const requests=[];
const context={window:{},navigator:{onLine:true},AbortController,Proxy,console,setTimeout,clearTimeout,fetch:async(url,options)=>new Promise(resolve=>requests.push({body:JSON.parse(options.body),resolve}))};
vm.runInNewContext(source,context);
function rpc(action,...args){return new Promise((resolve,reject)=>context.window.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[action](...args));}
function reply(index,data={success:true,list:[{unit:'1',comment:'preserved'}]}){requests[index].resolve({ok:true,status:200,text:async()=>JSON.stringify(data)});}
const actor={judgeToken:'local-only',round:'예선',compactReview:true};
const first=rpc('getReviewList','KCR',actor),second=rpc('getReviewList','KCR',actor);
assert.equal(requests.length,1,'identical pending reads share a request');
reply(0);const [a,b]=await Promise.all([first,second]);a.list[0].comment='local change';assert.equal(b.list[0].comment,'preserved','consumers never share mutable rows');
const fresh=rpc('getReviewList','KCR',actor);assert.equal(requests.length,2,'settled reads are not cached');reply(1);await fresh;
const scopes=[rpc('getReviewList','KCR',actor),rpc('getReviewList','MOB',actor),rpc('getReviewList','KCR',{...actor,round:'결선'}),rpc('getReviewList','KCR',{...actor,judgeToken:'another'}),rpc('getReviewList','KCR',{...actor,detailRowIndex:2})];
assert.equal(requests.length,7,'different contest, round, actor and detail requests stay isolated');for(let i=2;i<7;i++)reply(i);await Promise.all(scopes);
const old=rpc('getRanking','KCR',actor,'예선');
const save=rpc('updateReviewRow','KCR',1,{comment:'typed'},actor);
const during=rpc('getRanking','KCR',actor,'예선');
assert.equal(requests.length,10,'a write separates subsequent reads from older in-flight data');
reply(8);await save;
const after=rpc('getRanking','KCR',actor,'예선');assert.equal(requests.length,11,'write completion also invalidates reads started during a save');
reply(7);reply(9);reply(10);await Promise.all([old,during,after]);
const writes=[rpc('submitScores',{clientSubmissionId:'same'}),rpc('submitScores',{clientSubmissionId:'same'})];
assert.equal(requests.length,13,'write requests are never coalesced');reply(11);reply(12);await Promise.all(writes);
const denied=rpc('getReviewList','KCR',actor);requests[13].resolve({ok:false,status:403,text:async()=>'{"message":"denied"}'});await assert.rejects(denied,/denied/);
const recovered=rpc('getReviewList','KCR',actor);assert.equal(requests.length,15,'failed request is removed from the in-flight map');reply(14);await recovered;
const snapshotActor={...actor};const snapshot=rpc('getReviewList','KCR',snapshotActor);snapshotActor.round='결선';assert.equal(requests[15].body.args[1].round,'예선');reply(15);await snapshot;
console.log('Stage245: coalesced pending reads, actor/contest/round isolation, save freshness, mutable response isolation and write independence passed.');
