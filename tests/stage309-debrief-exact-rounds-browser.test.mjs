import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDebriefRoundFixture,roundMarkers} from './helpers/debrief-round-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';

test('admin and lead preview selectors distinguish preliminary/main/final; each round opens only its own cards at mobile/tablet/desktop widths',async()=>{
 const api=await createDebriefRoundFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
 fs.mkdirSync('tmp/stage309-qa',{recursive:true});
 try{
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const page=await qa.page(390,900);await page.addInitScript(actor=>localStorage.setItem('kclAdminActor',JSON.stringify(actor)),api.actor);
  for(const c of api.cases){
   await page.goto(qa.origin+'/debriefing/?from=admin&preview=1&comp='+c.code);await page.waitForFunction(code=>_adminPreviewOptionsCode===code,c.code);
   assert.deepEqual(await page.locator('#sel-phase option').evaluateAll(nodes=>nodes.map(n=>n.value)),c.rounds,c.code+' exact chooser');
   for(const [index,round]of c.rounds.entries()){
    await page.locator('#sel-phase').selectOption(round);
    const labels=await page.locator('#admin-preview-unit option').allTextContents();assert.ok(labels.slice(1).every(label=>label.startsWith(round+' · ')),c.code+' no mixed-round options');
    assert.ok(!labels.join(' ').includes('결선 · 본선 경기'));
    const selected=await page.evaluate(({unit,round})=>_adminPreviewOptions.findIndex(item=>item.unit===unit&&item.round===round),{unit:c.units[index],round});
    await page.locator('#admin-preview-unit').selectOption(String(selected));await page.locator('#admin-preview-open').click();await page.waitForFunction(round=>document.getElementById('pResult').classList.contains('active')&&_lastResult.requestedPhase===round,round);
    assert.ok((await page.evaluate(()=>_lastResult.scores.map(s=>s.round))).every(r=>r===round));
    if(c.code==='KBC')assert.equal(await page.locator('.score-card').count(),4,'four independent KBC judges, not eight combined cards');
    for(const width of [320,390,768,1440]){
     await page.setViewportSize({width,height:900});const info=await inspectPage(page);assert.equal(info.pageOverflow,false,c.code+' '+width);assert.deepEqual(info.overflow,[]);
     const buttons=await page.locator('#debrief-phases button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,height:r.height};}));
     assert.equal(buttons.length,c.rounds.length);
     buttons.forEach((button,i)=>{assert.ok(button.height>=44,c.code+' '+round+' '+width+' '+JSON.stringify(button));assert.ok(Math.abs(button.top-buttons[0].top)<1,'round tabs stay in one row');if(i)assert.ok(button.left>buttons[i-1].right,'round tabs cannot overlap');});
    }
    if(c.code==='KBC'&&round==='본선'){await page.setViewportSize({width:390,height:900});await page.screenshot({path:'tmp/stage309-qa/KBC-main-390.png'});}
    if(['KBC','MOC'].includes(c.code)){
     const text=await page.locator('#res-body').innerText();assert.ok(text.includes(roundMarkers[round]));for(const other of c.rounds.filter(r=>r!==round))assert.ok(!text.includes(roundMarkers[other]));
    }
    await page.evaluate(()=>backToStep1());
   }
  }
  // Staff and public phase navigation use the same isolated content, and a
  // mixed stale response is filtered rather than rendered as eight cards.
  const c=api.cases.find(c=>c.code==='KBC'),auth=await api.publicView(c);
  const main=await api.rpc('getDebriefPhase',auth.debriefToken,'본선'),final=await api.rpc('getDebriefPhase',auth.debriefToken,'결선');
  await page.evaluate(res=>{_adminPreviewActor=null;renderResult(res);showPanel('pResult');},{...final,scores:[...main.scores,...final.scores],rankInfos:[...main.rankInfos,...final.rankInfos]});
  assert.equal(await page.locator('.score-card').count(),4);assert.ok(!(await page.locator('#res-body').innerText()).includes(roundMarkers.본선));
  await page.getByRole('button',{name:'본선 디브리핑',exact:true}).click();await page.waitForFunction(()=>_lastResult.requestedPhase==='본선'&&!_debriefPhaseLoading);assert.equal(await page.locator('.score-card').count(),4);
  const lead=await qa.page();await lead.addInitScript(actor=>localStorage.setItem('kclAdminActor',JSON.stringify(actor)),api.previewLead);await lead.goto(qa.origin+'/debriefing/?from=admin&preview=1&comp=KBC');await lead.waitForFunction(()=>_adminPreviewOptionsCode==='KBC');
  assert.deepEqual(await lead.locator('#sel-phase option').evaluateAll(nodes=>nodes.map(n=>n.value)),['예선','본선','결선']);
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(lead.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before);
 }finally{await qa.close();api.close();}
});
