import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createKtccTournamentFixture} from './helpers/ktcc-tournament-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {auditTextContrast} from './helpers/contrast-audit.mjs';

test('KTCC staff preview and player reports show chronological quarter/semi/final ranks and progression, not mixed scores',async()=>{
  const api=await createKtccTournamentFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
  fs.mkdirSync('tmp/stage311-qa',{recursive:true});
  try{
    const before=api.snapshot();
    for(const actor of [api.actor,api.actors.lead]){
      const page=await qa.page(390,900);await page.addInitScript(actor=>localStorage.setItem('kclAdminActor',JSON.stringify(actor)),actor);
      await page.goto(qa.origin+'/debriefing/?from=admin&preview=1&comp=KTCC');await page.waitForFunction(()=>_adminPreviewOptionsCode==='KTCC'&&_adminPreviewOptions.length>0);
      await page.locator('#sel-phase').selectOption('결선');
      const labels=await page.locator('#admin-preview-unit option').allTextContents();assert.ok(labels.slice(1).every(label=>!/[0-9]+위/.test(label)));
      const index=await page.evaluate(()=>_adminPreviewOptions.findIndex(item=>item.round==='결선'&&item.unit==='2'));
      await page.locator('#admin-preview-unit').selectOption(String(index));await page.locator('#admin-preview-open').click();await page.waitForFunction(()=>_lastResult?.requestedPhase==='결선'&&document.getElementById('pResult').classList.contains('active'));
      assert.equal(await page.locator('.rank-box b').innerText(),'2위');
      assert.deepEqual(await page.locator('.ktcc-debrief-stage h3').allTextContents(),['8강','4강','최종']);
      assert.deepEqual(await page.locator('.ktcc-debrief-stage-result').allTextContents(),['1위 / 8팀4강 진출','2위 / 4팀최종 진출','2위 / 2팀준우승']);
      assert.deepEqual(await page.locator('.ktcc-debrief-match .total-score').allTextContents(),['7','7','6']);
      assert.equal(await page.locator('.score-card').count(),3);
      const preview=await page.locator('#res-body').innerHTML(),player=await api.player(2);
      await page.evaluate(res=>renderResult(res),player);assert.equal(await page.locator('#res-body').innerHTML(),preview);
      for(const width of [320,390,768,1440]){
        await page.setViewportSize({width,height:1000});const layout=await inspectPage(page);assert.equal(layout.pageOverflow,false);assert.deepEqual(layout.overflow,[]);
        assert.deepEqual(await auditTextContrast(page,'.ktcc-debrief-stage'),[]);
        if(actor===api.actor)await page.screenshot({path:'tmp/stage311-qa/debrief-'+width+'.png',fullPage:true});
      }
      await page.emulateMedia({media:'print'});assert.equal(await page.locator('.ktcc-debrief-match:not([hidden]) .ktcc-debrief-stage h3').first().isVisible(),true);
      await page.emulateMedia({media:'screen'});
      const eliminated=await api.player(3);await page.evaluate(res=>renderResult(res),eliminated);
      assert.deepEqual(await page.locator('.ktcc-debrief-stage h3').allTextContents(),['8강','4강']);assert.ok((await page.locator('.ktcc-debrief-stage-result').last().innerText()).includes('탈락'));
      assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);await page.close();
    }
    assert.equal(api.snapshot(),before);
  }finally{await qa.close();api.close();}
});
