import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrComparison} from './helpers/kcr-comparison-fixture.mjs';

const api = await createRpcFixture();
const qa = await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage238-qa',{recursive:true});
try {
  await seedKcrComparison(api);
  const before = JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const preview = await api.rpc('getAdminDebriefPreview','KCR','1','예선',api.actor);
  for (const width of [390,1440]) {
    const page = await qa.page(width);
    await page.goto(qa.origin+'/assessment/');
    await page.evaluate(actor => {_judge=actor;goRankingByCode('KCR','KCR','예선');},api.actor);
    await page.waitForFunction(() => document.querySelectorAll('#ranking-list .rank-row').length === 4);
    const first = page.locator('#ranking-list .rank-row').first();
    assert.equal(await first.locator('.rank-score').innerText(),'84');
    assert.match(await first.innerText(),/심사위원 총점 합산/);
    assert.equal(await page.locator('#ranking-list .rank-row').nth(2).locator('.rank-score').innerText(),'42');
    assert.equal((await inspectPage(page)).pageOverflow,false);
    await page.screenshot({path:`tmp/stage238-qa/ranking-${width}.png`,fullPage:true});
    await first.click();
    await page.waitForFunction(() => _rankingDetail?.unit === '1' && document.getElementById('ranking-detail-body').textContent.includes('총점: 84'));
    assert.match(await page.locator('#ranking-detail-body').innerText(),/총점: 84/);
    assert.deepEqual(page.qaErrors,[]);
    await page.goto(qa.origin+'/debriefing/');
    await page.waitForFunction(() => _configs.length > 0);
    await page.evaluate(res => {renderResult(res);showPanel('pResult');},preview);
    const box = page.locator('#res-body .rank-box');
    assert.match(await box.innerText(),/예선 총점\s+84/);
    assert.doesNotMatch(await box.innerText(),/평균/);
    assert.equal((await inspectPage(page)).pageOverflow,false);
    assert.deepEqual(page.qaErrors,[]);
    await page.screenshot({path:`tmp/stage238-qa/debrief-${width}.png`,fullPage:true});
    await page.close();
  }
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before);
} finally {
  await qa.close();
  api.close();
}
console.log('Stage238 KCR summed ranking, details and debriefing passed at 390/1440px without score writes, overflow or JavaScript errors.');
