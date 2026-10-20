import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
const api=await createAllDebriefFixture();
let fail=false,delay=null;
const calls=[];
const qa=await createBrowserFixture({apiHandler:async body=>{
  calls.push(body.action);
  if(body.action==='getDebriefPhase'){
    if(fail){fail=false;return Response.json({success:false,message:'QA 연결 오류'});}
    if(delay)await delay;
  }
  return api.handle(body);
}});
fs.mkdirSync('tmp/stage249-qa',{recursive:true});
try{
  api.db.prepare('UPDATE competitions SET debriefing=1').run();
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  for(const width of [360,768,1440]){
    const page=await qa.page(width);await page.goto(qa.origin+'/debriefing/');
    await page.waitForFunction(()=>_configs.length>0);
    for(const c of api.cases){
      const auth=await api.publicView(c);
      const res=await api.rpc('getDebriefPhase',auth.debriefToken,'예선');
      await page.evaluate(r=>{renderResult(r);showPanel('pResult');},res);
      const nav=page.locator('#debrief-phases');
      assert.equal(await nav.locator('button').count(),2);
      const prelimHtml=await page.locator('#res-body').innerHTML();
      await nav.getByRole('button',{name:'결선 디브리핑',exact:true}).click();
      await page.waitForFunction(()=>_lastResult.requestedPhase==='결선'&&!_debriefPhaseLoading);
      assert.ok((await page.evaluate(()=>_lastResult.scores.map(s=>s.round))).every(r=>r!=='예선'));
      const finalHtml=await page.locator('#res-body').innerHTML();
      const preview=await api.rpc('getAdminDebriefPreview',c.code,c.units[0],'예선',api.actor);
      preview.requestedPhase='예선';
      await page.evaluate(({actor,r})=>{_adminPreviewActor=actor;renderResult(r);},{actor:api.actor,r:preview});
      assert.equal(await page.locator('#res-body').innerHTML(),prelimHtml);
      await nav.getByRole('button',{name:'결선 디브리핑',exact:true}).click();
      await page.waitForFunction(()=>_lastResult.requestedPhase==='결선'&&!_debriefPhaseLoading);
      assert.equal(await page.locator('#res-body').innerHTML(),finalHtml,c.code+' switched public/preview HTML');
      await nav.getByRole('button',{name:'예선 디브리핑',exact:true}).click();
      await page.waitForFunction(()=>_lastResult.requestedPhase==='예선'&&!_debriefPhaseLoading);
      assert.equal(await page.locator('#res-body').innerHTML(),prelimHtml);
      const inspected=await inspectPage(page);assert.equal(inspected.pageOverflow,false,c.code+width);
      assert.deepEqual(inspected.overflow,[]);assert.deepEqual(inspected.brokenImages,[]);
      if(c.code==='KCR')await page.screenshot({path:`tmp/stage249-qa/phases-${width}.png`,fullPage:true});
    }
    const c=api.cases.find(c=>c.code==='KCR');
    // A preliminary-only entrant initially choosing 'final' is routed to their
    // preliminary result after ONE OTP verification, with no final control.
    api.db.prepare('INSERT INTO otps(competition_code,name,phone,otp,expires_at) VALUES(?,?,?,?,?)')
      .run(c.code,'QA 다른 선수',c.phone+'1','249249','2099-01-01T00:00:00Z');
    await page.evaluate(({code,phone})=>{
      backToStep1();_adminPreviewActor=null;_compCode=code;_name='QA 다른 선수';_phone=phone+'1';
      _requestedDebriefPhase='결선';document.getElementById('inp-otp').value='249249';
      showPanel('pStep2');doVerifyOTP();
    },c);
    await page.waitForFunction(()=>_lastResult?.requestedPhase==='예선'&&!_debriefPhaseLoading);
    assert.equal(await page.locator('#debrief-phases button').count(),1);
    assert.equal(await page.locator('#debrief-phases button').innerText(),'예선 디브리핑');
    assert.ok(await page.evaluate(()=>_lastResult.scores.length>0));
    // Failed requests cannot relabel a previous phase as the new one.
    const auth=await api.publicView(c),prelim=await api.rpc('getDebriefPhase',auth.debriefToken,'예선');
    await page.evaluate(r=>renderResult(r),prelim);
    fail=true;
    await page.getByRole('button',{name:'결선 디브리핑',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('debrief-phase-status').textContent==='QA 연결 오류');
    assert.equal(await page.evaluate(()=>_lastResult.requestedPhase),'예선');
    assert.equal(await page.getByRole('button',{name:'예선 디브리핑',exact:true}).getAttribute('aria-pressed'),'true');
    // Keyboard activation and retry work.
    await page.getByRole('button',{name:'결선 디브리핑',exact:true}).focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>_lastResult.requestedPhase==='결선'&&!_debriefPhaseLoading);
    // A response arriving after leaving the result must not resurrect it/token.
    let release;delay=new Promise(resolve=>{release=resolve;});
    const response=page.waitForResponse(r=>r.request().postDataJSON()?.action==='getDebriefPhase');
    await page.getByRole('button',{name:'예선 디브리핑',exact:true}).click();
    await page.evaluate(()=>backToStep1());release();await response;delay=null;
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>_lastResult),null);
    assert.equal(await page.locator('#pStep1').evaluate(el=>el.classList.contains('active')),true);
    assert.deepEqual(page.qaErrors,[]);
    await page.close();console.log(`Stage249: all seven phase switches and preview parity; ${width}px; OTP/failure/stale response passed`);
  }
  assert.equal(calls.filter(c=>c==='sendOTP').length,0,'no SMS in QA or phase switching');
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before);
}finally{await qa.close();api.close();}
