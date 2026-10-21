import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';

const source=fs.readFileSync('public/assets/operational-health.js','utf8'),context={Intl,Date,Number,Math};
vm.createContext(context);vm.runInContext(source,context);
const now=Date.now();
const healthy={success:true,available:true,state:'ok',requests:200,errors:0,errorPercent:0,resourceErrors:0,cpuP50Ms:4,cpuP99Ms:180,
  windowStart:new Date(now-900000).toISOString(),windowEnd:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),nextCheckAt:now+60000};
const classify=(patch={},loading=false)=>context.operationalHealthSignal_({...healthy,...patch},loading,now);
assert.equal(classify().tone,'ok');
assert.equal(classify({cpuP99Ms:5000}).tone,'ok','CPU duration alone is not a measured failure or a plan limit');
assert.equal(classify({errors:1}).tone,'warning');
assert.equal(classify({errors:9}).tone,'warning');
assert.equal(classify({errors:10}).tone,'error','5% error threshold includes equality');
assert.equal(classify({errors:0,resourceErrors:1}).tone,'error');
assert.equal(classify({state:'warning'}).tone,'warning');
assert.equal(classify({stale:true,errors:0}).tone,'warning');
assert.equal(classify({updatedAt:new Date(now-300001).toISOString()}).tone,'warning');
assert.equal(classify({updatedAt:new Date(now+60001).toISOString()}).tone,'warning');
assert.equal(classify({updatedAt:null}).tone,'warning');
for(const patch of [{requests:null},{requests:0},{errors:null},{errors:-1},{resourceErrors:NaN},{available:false},{success:false}])assert.equal(classify(patch).tone,'unknown');
assert.equal(classify({state:'no_data',available:false}).label,'집계 대기');
assert.equal(context.operationalHealthSignal_(null,true,now).label,'확인 중');
assert.equal(context.operationalHealthSignal_(null,false,now).label,'확인 불가');

const api=await createRpcFixture();let healthCalls=0;
const qa=await createBrowserFixture({apiHandler:async message=>{
  if(message.action==='getOperationalHealth'){healthCalls++;return new Response(JSON.stringify(healthy));}
  return api.handle(message);
}});
fs.mkdirSync('tmp/stage259-qa',{recursive:true});
const snapshot=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
try{
 for(const width of [320,390,768,1440]){
  const page=await qa.page(width);
  await page.goto(qa.origin+'/assessment/');
  await page.evaluate(actor=>{
   _judge=actor;hideOverlay();showPanel('pAdmin');adminSwitchSection('run');
   _cupping.cups=[{unit:'201',flavor:3.4,comment:'작성 중인 코멘트',tags:{flavor:['블루베리']},locks:{flavor:true}}];
   _reviewDraftDirty=true;window.__healthQaDraft=JSON.stringify(_cupping.cups);
   _healthLast=null;loadOperationalHealth_();
  },api.actor);
  await page.waitForFunction(()=>document.querySelector('.server-health-signal')?.dataset.state==='ok');
  const initialCalls=healthCalls;
  await page.evaluate(()=>{loadOperationalHealth_();loadOperationalHealth_();});
  assert.equal(healthCalls,initialCalls,'presentation adds no requests and existing one-minute cache is retained');
  const body=page.locator('#server-health-body'),signal=body.locator('.server-health-signal');
  const render=patch=>page.evaluate(({data,patch})=>{_healthLoading=false;renderOperationalHealth_({...data,...patch});},{data:healthy,patch});
  const colors=[];
  for(const [tone,label,patch] of [['ok','정상',{}],['warning','주의',{errors:1}],['error','오류',{errors:10}]]){
   await render(patch);
   assert.equal(await signal.getAttribute('data-state'),tone);
   assert.equal(await signal.locator('strong').innerText(),label);
   assert.equal(await body.locator('details').getAttribute('open'),null);
   assert.doesNotMatch(await body.innerText(),/CPU|P99|ms|요청 수/,'technical numbers are collapsed by default');
   colors.push(await signal.locator('.server-health-lamp').evaluate(el=>getComputedStyle(el).backgroundColor));
   await page.locator('#server-health-card').scrollIntoViewIfNeeded();
   const check=await inspectPage(page);assert.equal(check.pageOverflow,false);assert.deepEqual(check.overflow,[]);
   await page.screenshot({path:'tmp/stage259-qa/health-'+tone+'-'+width+'.png'});
  }
  assert.equal(new Set(colors).size,3,'signals have distinct colors as well as text labels');
  const summary=body.locator('summary');await summary.focus();await page.keyboard.press('Enter');
  assert.equal(await body.locator('details').getAttribute('open'),'');
  assert.match(await body.innerText(),/200건|180.00 ms/);
  await render({stale:true});
  assert.equal(await body.locator('details').getAttribute('open'),'','automatic updates retain expanded details');
  assert.equal(await summary.evaluate(el=>el===document.activeElement),true,'keyboard focus is retained on refresh');
  assert.equal(await signal.getAttribute('data-state'),'warning');
  assert.match(await signal.innerText(),/마지막 확인 자료/);
  await render({available:false,state:'no_data'});
  assert.equal(await signal.locator('strong').innerText(),'집계 대기');
  assert.equal(await body.locator('details').count(),0);
  await render({available:false,state:'unavailable',message:'<img src=x onerror=alert(1)> 연결 확인 필요'});
  assert.equal(await signal.locator('strong').innerText(),'확인 불가');
  assert.equal(await body.locator('img').count(),0,'messages are escaped');
  assert.doesNotMatch(await signal.innerText(),/정상|0건/);
  await page.evaluate(()=>{_healthLoading=true;renderOperationalHealth_(null);});
  assert.equal(await signal.locator('strong').innerText(),'확인 중');
  await page.evaluate(()=>{_healthLoading=false;_healthLast=null;showPanel('pSelect');loadOperationalHealth_();});
  assert.equal(healthCalls,initialCalls,'no polling outside administrator panel');
  assert.equal(await page.evaluate(()=>JSON.stringify(_cupping.cups)===window.__healthQaDraft&&_reviewDraftDirty),true,'scores, tags, comments, locks and dirty drafts are untouched');
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);await page.close();
 }
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),snapshot);
 console.log('Stage259 status thresholds, unknown/stale/loading, accessible colored signals, collapsed diagnostics, keyboard focus, mobile layouts, unchanged polling and drafts passed at 320/390/768/1440px.');
}finally{await qa.close();api.close();}
