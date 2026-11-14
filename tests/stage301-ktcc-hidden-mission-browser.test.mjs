import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createKtccHiddenFixture} from './helpers/ktcc-hidden-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {auditTextContrast} from './helpers/contrast-audit.mjs';

const api=await createKtccHiddenFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage301-qa',{recursive:true});
try{
  const configs=(await api.rpc('getConfig')).configs,page=await qa.page(390,900);
  await page.goto(qa.origin+'/assessment/');
  await page.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;_selComp=configs.find(c=>c.code==='KTCC');goReviewByCode('KTCC','KTCC','pTeam');},{actor:api.actors.lead,configs});
  await page.locator('.ktcc-mission-btn').first().waitFor();await page.evaluate(()=>stopRegistryLiveSync_());
  assert.equal(await page.locator('.ktcc-mission-btn').count(),2);
  const original=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const first=page.locator('.review-item').filter({hasText:'미션 팀 1'});
  await first.locator('.ktcc-mission-btn').click();await page.waitForFunction(()=>!!_ktccMissionUi.loaded);
  const dialog=page.locator('#ktcc-mission-dialog');
  assert.match(await dialog.innerText(),/5컵 중 다른 컵 1개 찾기/);
  assert.equal(await dialog.locator('input[value=""]').isChecked(),true);
  await dialog.locator('input[value="correct"]').check();assert.match(await dialog.locator('[data-mission-total]').innerText(),/7점.*4점.*11점/);
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});assert.equal((await inspectPage(page)).pageOverflow,false);
    assert.equal(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1),true);
    assert.deepEqual(await auditTextContrast(page,'#ktcc-mission-dialog'),[]);
    assert.equal(await dialog.locator('fieldset label').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)),true);
    await page.screenshot({path:'tmp/stage301-qa/mission-'+width+'.png'});
  }
  await dialog.locator('[data-mission-save]').click();await page.waitForFunction(()=>!_ktccMissionUi.saving&&_ktccMissionUi.loaded?.result==='correct');
  assert.match(await first.locator('.ktcc-mission-summary').innerText(),/7점.*4점.*11점/);
  assert.match(await first.locator('.ktcc-mission-btn').innerText(),/정답.*4점/);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),original);
  await dialog.locator('[data-mission-close]').click();assert.equal(await first.locator('.ktcc-mission-btn').evaluate(b=>b===document.activeElement),true);
  await first.locator('.ktcc-mission-btn').click();await page.waitForFunction(()=>!!_ktccMissionUi.loaded);
  assert.equal(await dialog.locator('input[value="correct"]').isChecked(),true);
  const old=await api.rpc('getKtccHiddenMission',{rowIndex:api.find(1).id},api.actors.admin);
  await api.rpc('setKtccHiddenMission',{rowIndex:old.rowIndex,result:'incorrect',revision:old.revision},api.actors.admin);
  await dialog.locator('input[value="incorrect"]').check();await dialog.locator('[data-mission-save]').click();await page.waitForFunction(()=>!_ktccMissionUi.saving&&!_ktccMissionUi.loaded);
  assert.match(await dialog.locator('[data-mission-message]').innerText(),/변경|최신/);assert.equal(await dialog.locator('[data-mission-save]').isDisabled(),true);
  await dialog.locator('[data-mission-reload]').click();await page.waitForFunction(()=>!!_ktccMissionUi.loaded);
  assert.equal(await dialog.locator('input[value="incorrect"]').isChecked(),true);
  await dialog.locator('input[value=""]').check();await dialog.locator('[data-mission-save]').click();await page.waitForFunction(()=>!_ktccMissionUi.saving&&_ktccMissionUi.loaded?.result==='');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),original);
  // Staff/head modes never receive manager entry actions.
  for(const actor of [api.actors.staff,api.actors.head,api.actors.foreign]){
    await page.evaluate(actor=>{_judge=actor;goReviewByCode('KTCC','KTCC','pSelect');},actor);
    await page.waitForFunction(()=>document.getElementById('review-list').textContent.includes('반려된 평가가 없습니다'));
    assert.equal(await page.locator('.ktcc-mission-btn').count(),0);
  }
  const loaded=await api.rpc('getKtccHiddenMission',{rowIndex:api.find(1).id},api.actors.lead);
  await api.rpc('setKtccHiddenMission',{rowIndex:loaded.rowIndex,revision:loaded.revision,result:'correct'},api.actors.lead);
  const rank=(await api.rpc('getRanking','KTCC',api.actors.admin,'결선'));
  await page.evaluate(({actor,rank})=>{_judge=actor;_ranking=rank;showPanel('pRanking');renderRanking(rank);},{actor:api.actors.admin,rank});
  assert.match(await page.locator('#ranking-list').innerText(),/히든미션 4점/);
  const preview=await api.rpc('getAdminDebriefPreview','KTCC','1','결선',api.actors.admin);
  const debrief=await qa.page();await debrief.goto(qa.origin+'/debriefing/');
  await debrief.evaluate(score=>{document.body.appendChild(buildScoreCard(score,'KTCC',1));},preview.scores[0]);
  assert.match(await debrief.locator('.score-card').last().innerText(),/기존 평가 7점.*히든미션 정답 \(\+4점\).*11/);
  assert.equal(await debrief.locator('.score-card').last().locator('.score-item-label').filter({hasText:'히든미션'}).count(),0,'no duplicate mission tiles');
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);assert.deepEqual(debrief.qaErrors,[]);
  console.log('Stage301 KTCC UI: lead-only mission entry, mobile/desktop layout, readable contrast, 44px controls, keyboard close/focus, persisted 4/0/reset, conflict reload, preserved evaluations and matching ranking/debrief passed.');
}finally{await qa.close();api.close();}
