import test from 'node:test';
import assert from 'node:assert/strict';
import {createMocManualFinalFixture} from './helpers/moc-manual-final-fixture.mjs';
import {applyMocFinalResult} from '../lib/moc-final-result-20261114.mjs';
import {createBrowserFixture,inspectPage,selectOperationsCompetition} from './helpers/browser-fixture.mjs';
test('MOC opens the manual final results by default, keeps main results and shows rank-only detail and debrief on mobile and desktop',async()=>{
  const api=await createMocManualFinalFixture();await applyMocFinalResult(api.env.DB,api.entries);const qa=await createBrowserFixture({apiHandler:api.handle});try{
    const leadName=api.moc.name+' 테스트 팀장';await api.rpc('upsertOperatorAccount',{accountType:'TEAMLEAD',name:leadName,phone:api.moc.phone,access:'MOC',role:'대회팀장'},api.actor);const lead=await api.rpc('judgeLogin',leadName,api.moc.phone);
    let entered=false;const before=api.snapshot();for(const width of [390,1440]){
      const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');await page.evaluate(actor=>{_judge=actor;loadTeamPanel();},lead);
      await page.locator('#team-comp-list [data-act=rank]').click();
      await page.waitForFunction(()=>_ranking?.selectedRound==='결선'&&document.querySelectorAll('.rank-row').length===10);
      const rows=page.locator('.rank-row');for(const [i,e] of api.entries.entries()){assert.match(await rows.nth(i).innerText(),new RegExp(e.name));if(i===0&&entered)assert.match(await rows.nth(i).locator('.rank-score').innerText(),/23\.5/);else assert.equal(await rows.nth(i).locator('.rank-score').innerText(),'수기 확정');}
      await rows.first().click();await page.waitForFunction(()=>_rankingDetail?.rankInfo?.manualFinalResult);assert.match(await page.locator('#ranking-detail-body').innerText(),/1위 · 수기 확정/);assert.equal(await page.locator('#moc-final-save').isVisible(),true);
      await page.locator('#moc-final-score').fill('23.5');await page.locator('#moc-final-time').fill('04:30.25');await page.locator('#moc-final-save').click();await page.getByRole('status').filter({hasText:'저장 완료 · 확정 순위 1위 유지'}).waitFor();entered=true;
      await page.locator('#pRankingDetail').getByRole('button',{name:'순위로 돌아가기'}).click();
      if(!await page.locator('#ranking-stage-wrap').evaluate(el=>el.open))await page.locator('#ranking-stage-wrap summary').click();await page.locator('#ranking-stage-select').selectOption('본선');await page.waitForFunction(()=>_ranking?.selectedRound==='본선');assert.ok(await page.locator('.rank-row').count()>0);assert.doesNotMatch(await page.locator('#ranking-list').innerText(),/수기 확정/);
      assert.equal((await inspectPage(page)).pageOverflow,false);assert.deepEqual(page.qaErrors,[]);await page.close();
      const debrief=await qa.page(width);await debrief.goto(qa.origin+'/debriefing/');await debrief.waitForFunction(()=>_configs.length>0);
      const response=await api.rpc('getAdminDebriefPreview','MOC','110','결선',api.actor);await debrief.evaluate(res=>{renderResult(res);showPanel('pResult');},response);
      const body=await debrief.locator('#res-body').innerText();assert.match(body,/1 \/ 10/);assert.match(body,/수기 확정/);assert.match(body,/23\.5/);assert.match(body,/04:30\.25/);assert.doesNotMatch(body,/0\.00/);assert.equal((await inspectPage(debrief)).pageOverflow,false);assert.deepEqual(debrief.qaErrors,[]);await debrief.close();
    }assert.equal(api.snapshot(),before);
  }finally{await qa.close();api.close();}
});
