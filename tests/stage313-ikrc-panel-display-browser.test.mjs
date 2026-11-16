import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createIkrcPanelDisplayFixture} from './helpers/ikrc-panel-display-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';

test('IKRC mobile and desktop debriefs separate scoring sensory counts from comparison heads without changing evaluations',async()=>{
  const api=await createIkrcPanelDisplayFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
  fs.mkdirSync('tmp/stage313-qa',{recursive:true});
  try {
    const before=api.snapshot(),page=await qa.page(390,1000);
    await page.addInitScript(actor=>localStorage.setItem('kclAdminActor',JSON.stringify(actor)),api.actor);
    await page.goto(qa.origin+'/debriefing/?from=admin&preview=1&comp=IKRC');
    await page.waitForFunction(()=>_adminPreviewOptionsCode==='IKRC'&&_adminPreviewOptions.length>0);
    await page.locator('#sel-phase').selectOption('결선');
    const index=await page.evaluate(()=>_adminPreviewOptions.findIndex(item=>item.unit==='A-1'&&item.round==='결선'));
    assert.ok(index>=0);await page.locator('#admin-preview-unit').selectOption(String(index));
    await page.locator('#admin-preview-open').click();
    await page.waitForFunction(()=>document.querySelector('.ikrc-combined-comment'));
    const original=await page.evaluate(()=>JSON.stringify(_lastResult));
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:1000});
      for(const selector of ['.report-intro','.avg-box','.ikrc-combined-meta']) {
        const text=await page.locator(selector).innerText();
        assert.match(text,/점수 반영: 센서리 5명/);assert.match(text,/헤드 1명 비교용 \(평균·순위 미반영\)/);
        assert.doesNotMatch(text,/심사위원 6명|센서리 6명|6명의 점수/);
      }
      assert.match(await page.locator('.ikrc-combined-comment').innerText(),/공식 제출된 심사 의견을 종합/);
      assert.equal(await page.locator('.score-card').count(),6,'the original head comparison card remains available');
      assert.ok((await page.locator('#res-body').innerText()).includes('헤드심사위원 평가 · 비교용'));
      const layout=await inspectPage(page);assert.equal(layout.pageOverflow,false);assert.deepEqual(layout.overflow,[]);
      assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
      if(width===390||width===1440)await page.screenshot({path:'tmp/stage313-qa/ikrc-panel-'+width+'.png',fullPage:true});
    }
    assert.equal(await page.evaluate(()=>JSON.stringify(_lastResult)),original);
    await page.close();
    const comparison=await qa.page(390,1000);
    await comparison.goto(qa.origin+'/assessment/');
    await comparison.evaluate(actor=>{_judge=actor;_selComp={code:'IKRC',currentRound:'결선'};setIkrcResultViewMode_('official');},api.judges[0]);
    await comparison.locator('#ikrc-cal-list .review-item').first().waitFor();
    const item=comparison.locator('#ikrc-cal-list .review-item').first();
    assert.match(await item.innerText(),/점수 반영: 센서리 5명/);
    assert.match(await item.innerText(),/헤드 1명 비교용 \(평균·순위 미반영\)/);
    assert.doesNotMatch(await item.innerText(),/현재 제출 6명/);
    await item.click();await comparison.locator('#ikrc-cal-detail .overall-summary-box').first().waitFor();
    const detail=await comparison.locator('#ikrc-cal-detail').innerText();
    assert.match(detail,/점수 반영 인원\s*센서리 5명 · 헤드 1명 비교용 \(점수 미반영\)/);
    assert.match(detail,/순위 반영 센서리 평균\s*64/);
    assert.match(detail,/헤드·센서리 전체 평균 ± 표준편차/,'comparison statistics retain the head evaluation');
    assert.deepEqual(comparison.qaErrors,[]);assert.deepEqual(comparison.qaMissing,[]);
    assert.equal((await inspectPage(comparison)).pageOverflow,false);
    await comparison.close();assert.equal(api.snapshot(),before);
  } finally {await qa.close();api.close();}
});
