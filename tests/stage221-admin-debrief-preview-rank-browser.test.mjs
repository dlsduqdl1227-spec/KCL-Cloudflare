import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
import {createBrowserFixture, inspectPage} from './helpers/browser-fixture.mjs';

const api = await createAllDebriefFixture();
const qa = await createBrowserFixture({apiHandler:api.handle});
const originalScores = api.db.prepare('SELECT * FROM scores ORDER BY id').all();
const originalParticipants = api.db.prepare('SELECT * FROM participants ORDER BY id').all();
fs.mkdirSync('tmp/stage221-qa', {recursive:true});
try {
  for (const c of api.cases) {
    const options = (await api.rpc('getAdminDebriefPreviewOptions', c.code, api.actor)).options;
    const ranking = (await api.rpc('getRanking', c.code, api.actor)).ranking;
    for (const item of options) {
      const source = ranking.find(r => r.round === item.round && r.unit === item.unit);
      assert.ok(source, c.code + ' exact round/participant source');
      assert.equal(item.rank, source.rank, 'use the existing ranking, not the option index');
    }
    for (const width of [390, 768, 1440]) {
      const page = await qa.page(width);
      await page.addInitScript(actor => localStorage.setItem('kclAdminActor', JSON.stringify(actor)), api.actor);
      await page.goto(qa.origin + '/debriefing/?from=admin&preview=1&comp=' + c.code);
      await page.waitForFunction(code => _adminPreviewOptionsCode === code && _adminPreviewOptions.length > 0, c.code);
      const labels = await page.locator('#admin-preview-unit option').allTextContents();
      assert.deepEqual(labels.slice(1), options.map(item => [item.round, item.rank + '위', item.unitDisplay || item.unit, item.name || '이름 미등록', item.affiliation || ''].filter(Boolean).join(' · ')), c.code + ' rank in every option');
      const edgeLabels = await page.evaluate(() => [1, '12', '실격', null, 0, '', '공동 2위'].map(adminPreviewRankLabel_));
      assert.deepEqual(edgeLabels, ['1위', '12위', '실격', '순위 미집계', '순위 미집계', '순위 미집계', '공동 2위']);
      // Same entrant has different numbers/ranks across rounds. Selection must
      // continue to send the original unit/round, without interpreting rank as ID.
      const index = options.findIndex(item => item.round === c.rounds.at(-1) && item.unit === c.units.at(-1));
      assert.ok(index >= 0);
      const selected = options[index];
      await page.locator('#admin-preview-unit').selectOption(String(index));
      assert.equal(await page.locator('#admin-preview-unit').inputValue(), String(index));
      const layout = await inspectPage(page);
      assert.equal(layout.pageOverflow, false, c.code + ' ' + width + ' preview selector fits');
      assert.deepEqual(layout.overflow, []);
      if (c.code === 'MOC' && width !== 768) await page.screenshot({path:`tmp/stage221-qa/MOC-${width}.png`, fullPage:true});
      const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/rpc' && r.request().postDataJSON()?.action === 'getAdminDebriefPreview');
      await page.locator('#admin-preview-open').click();
      const opened = await (await response).json();
      assert.equal(opened.success, true);
      assert.equal(opened.previewUnit, selected.unit);
      assert.equal(opened.previewRound, selected.round);
      assert.equal(opened.rankInfo.rank, selected.rank);
      await page.waitForFunction(() => document.getElementById('pResult').classList.contains('active'));
      assert.deepEqual(page.qaErrors, []);
      await page.close();
    }
    console.log(c.code + ' preview ranks/round selection passed at 390/768/1440px');
  }
  assert.deepEqual(api.db.prepare('SELECT * FROM scores ORDER BY id').all(), originalScores);
  assert.deepEqual(api.db.prepare('SELECT * FROM participants ORDER BY id').all(), originalParticipants);
} finally {
  await qa.close();
  api.close();
}
