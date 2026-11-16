import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
const api=await createAllDebriefFixture();
let fail=false,delay=null;
const calls=[];
const qa=await createBrowserFixture({apiHandler:async body=>{
 calls.push(body.action);
 if(body.action==='verifyOTP'){
  if(fail){fail=false;return Response.json({success:false,message:'QA 연결 오류'});}
  if(delay)await delay;
 }
 return api.handle(body);
}});
fs.mkdirSync('tmp/stage249-qa',{recursive:true});
function otp(c,name=c.name,phone=c.phone){api.db.prepare('INSERT INTO otps(competition_code,name,phone,otp,expires_at) VALUES(?,?,?,?,?)').run(c.code,name,phone,'249249','2099-01-01T00:00:00Z');}
async function verify(page,c,phase,name=c.name,phone=c.phone){
 await page.evaluate(({code,phone,name,phase})=>{
  backToStep1();_adminPreviewActor=null;_compCode=code;_name=name;_phone=phone;
  _requestedDebriefPhase=phase;document.getElementById('inp-otp').value='249249';
  showPanel('pStep2');doVerifyOTP();
 },{code:c.code,phone,name,phase});
}
try{
 api.db.prepare('UPDATE competitions SET debriefing=1').run();
 const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
 for(const width of [360,768,1440]){
  const page=await qa.page(width);await page.goto(qa.origin+'/debriefing/');await page.waitForFunction(()=>_configs.length>0);
  for(const c of api.cases){
   const auth=await api.publicView(c);
   for(const [i,round]of c.rounds.entries()){
    const res=await api.rpc('getDebriefPhase',auth.debriefToken,round);
    await page.evaluate(res=>{renderResult(res);showPanel('pResult');},res);
    const publicHtml=await page.locator('#res-body').innerHTML();
    assert.equal(await page.locator('#debrief-phases,.debrief-phase-button').count(),0,c.code+' no result-round navigation');
    assert.ok((await page.evaluate(()=>_lastResult.scores.map(s=>s.round))).every(r=>r===round));
    const preview=await api.rpc('getAdminDebriefPreview',c.code,c.units[i],round,api.actor,round);
    await page.evaluate(({actor,res})=>{_adminPreviewActor=actor;renderResult(res);},{actor:api.actor,res:preview});
    assert.equal(await page.locator('#res-body').innerHTML(),publicHtml,c.code+' '+round+' same selected public/preview content');
    assert.equal(await page.locator('#debrief-phases,.debrief-phase-button').count(),0,c.code+' no preview result tabs');
    const inspected=await inspectPage(page);assert.equal(inspected.pageOverflow,false,c.code+width);assert.deepEqual(inspected.overflow,[]);assert.deepEqual(inspected.brokenImages,[]);
   }
   if(c.code==='KCAC')await page.screenshot({path:'tmp/stage249-qa/selected-final-'+width+'.png'});
  }
  const c=api.cases.find(c=>c.code==='KCR');
  // A preliminary-only entrant selecting final stays with that selected round
  // and its empty notice; never silently open a preliminary debrief instead.
  otp(c,'QA 다른 선수',c.phone+'1');await verify(page,c,'결선','QA 다른 선수',c.phone+'1');
  await page.waitForFunction(()=>document.getElementById('pResult').classList.contains('active')&&_lastResult?.requestedPhase==='결선');
  assert.equal(await page.locator('.score-card').count(),0);assert.match(await page.locator('#res-body').innerText(),/결선에 공개된 평가 기록이 없습니다/);
  assert.equal(await page.locator('#debrief-phases,.debrief-phase-button').count(),0);
  if(width===360){
   otp(c);fail=true;await verify(page,c,'결선');await page.waitForFunction(()=>document.getElementById('toast').textContent==='QA 연결 오류');
   assert.equal(await page.evaluate(()=>_lastResult),null);assert.equal(await page.locator('#pStep2').evaluate(el=>el.classList.contains('active')),true);
   await page.locator('#btn-verify').click();await page.waitForFunction(()=>_lastResult?.requestedPhase==='결선');
   assert.ok(await page.evaluate(()=>_lastResult.scores.length>0));
   otp(c);let release;delay=new Promise(resolve=>{release=resolve;});
   const response=page.waitForResponse(r=>r.request().postDataJSON()?.action==='verifyOTP');
   await verify(page,c,'예선');await page.evaluate(()=>backToStep1());release();await response;delay=null;
   await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>_lastResult),null);
   assert.equal(await page.locator('#pStep1').evaluate(el=>el.classList.contains('active')),true);
  }
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);await page.close();
  console.log('Stage249: seven selected-round-only debriefs, no result tabs/fallback, exact preview parity; '+width+'px');
 }
 assert.equal(calls.filter(c=>c==='sendOTP').length,0,'no SMS in QA');
 assert.equal(calls.filter(c=>c==='getDebriefPhase'||c==='getAdminDebriefPhase').length,0,'the UI never silently switches to another round');
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before);
}finally{await qa.close();api.close();}
