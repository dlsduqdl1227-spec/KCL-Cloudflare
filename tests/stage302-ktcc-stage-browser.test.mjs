import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createKtccStageFixture} from './helpers/ktcc-stage-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {auditTextContrast} from './helpers/contrast-audit.mjs';
const api=await createKtccStageFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage302-qa',{recursive:true});
try{
  const configs=(await api.rpc('getConfig')).configs,page=await qa.page(390,900),snapshot=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  await page.goto(qa.origin+'/assessment/');
  await page.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;_selComp=configs.find(c=>c.code==='KTCC');goReviewByCode('KTCC','KTCC','pTeam');},{actor:api.actors.lead,configs});
  const reviewNav=page.locator('#ktcc-review-stages');await reviewNav.waitFor();await page.evaluate(()=>stopRegistryLiveSync_());
  assert.equal(await page.locator('#review-list .review-item').count(),6);
  assert.deepEqual(await page.locator('.ktcc-stage-review-section>h3').allTextContents(),['8강 · 2건','4강 · 1건','결승 · 1건','경기 단계 미지정 · 1건','기타 경기 · 1건']);
  for(const [stage,count]of [['8강',2],['4강',1],['결승',1],['순위결정',0],['미지정',1],['기타',1]]){
    await reviewNav.locator('button[data-stage="'+stage+'"]').click();assert.equal(await page.locator('#review-list .review-item').count(),count);assert.match(await page.locator('#review-stat').innerText(),new RegExp(stage));
  }
  await reviewNav.locator('[data-stage="8강"]').click();
  await page.locator('#review-list .review-item').filter({hasText:'미션 팀 1'}).locator('.ktcc-mission-btn').click();await page.waitForFunction(()=>!!_ktccMissionUi.loaded);
  assert.equal(await page.evaluate(()=>_ktccMissionUi.loaded.rowIndex),api.quarterId);assert.match(await page.locator('#ktcc-mission-dialog').innerText(),/8강/);await page.locator('[data-mission-close]').click();
  await page.locator('#review-list-refresh').click();await page.waitForFunction(()=>document.querySelector('#ktcc-review-stages [data-stage="8강"]')?.getAttribute('aria-pressed')==='true');
  assert.equal(await page.locator('#review-list .review-item').count(),2);
  await page.evaluate(()=>goRankingByCode('KTCC','KTCC','결선'));
  await page.waitForFunction(()=>_ranking?.compCode==='KTCC'&&_ranking.selectedRound==='결선'&&_ranking.ranking.length===3);
  const rankNav=page.locator('#ktcc-ranking-stages');
  for(const [key,count,score]of [['8강',2,11],['4강',1,6],['결승',1,8],['순위결정',0,0]]){
    await rankNav.locator('button[data-stage="'+key+'"]').click();
    await page.waitForFunction(stage=>_ranking?.selectedKtccStage===stage,key);
    assert.equal(await page.locator('#ranking-list .rank-row').count(),count);
    assert.match(await page.locator('#ranking-sub').innerText(),new RegExp(key));
    if(count)assert.match(await page.locator('#ranking-list .rank-score').first().innerText(),new RegExp(String(score)));
  }
  await rankNav.locator('[data-stage="8강"]').click();await page.waitForFunction(()=>_ranking?.selectedKtccStage==='8강');
  await page.locator('#ranking-list .rank-row').filter({hasText:'미션 팀 1'}).click();await page.waitForFunction(()=>_rankingDetail?.selectedKtccStage==='8강');
  assert.equal(await page.evaluate(()=>_rankingDetail.rows.length),1);assert.equal(await page.evaluate(()=>_rankingDetail.totalScore),11);assert.match(await page.locator('#ranking-detail-sub').innerText(),/8강/);
  await page.locator('#pRankingDetail').getByRole('button',{name:'순위로 돌아가기'}).click();
  assert.equal(await rankNav.locator('[data-stage="8강"]').getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>refreshRanking_());await page.waitForFunction(()=>_ranking?.selectedKtccStage==='8강'&&document.querySelectorAll('#ranking-list .rank-row').length===2);
  assert.equal(await page.evaluate(()=>rankingScopedResponse_({success:true,compCode:'KTCC',selectedRound:'결선',selectedKtccStage:'4강',ranking:[]},'KTCC','결선','8강')),null,'mixed-stage cache/old API responses rejected');
  await page.evaluate(()=>{_rankingCacheByCode['KTCC::결선::4강']={success:true,compCode:'KTCC',selectedRound:'결선',selectedKtccStage:'8강',ranking:[]};});
  // Race a delayed quarter-final response with a later semi-final selection.
  await page.route('**/api/rpc',async route=>{const body=route.request().postDataJSON();if(body?.action==='getRanking'&&body.args[3]==='8강'){const response=await route.fetch();await new Promise(r=>setTimeout(r,250));await route.fulfill({response});}else await route.continue();});
  await page.evaluate(()=>{goRankingByCode('KTCC','KTCC','결선','8강');goRankingByCode('KTCC','KTCC','결선','4강');});
  await page.waitForFunction(()=>_ranking?.selectedKtccStage==='4강');await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>_ranking.selectedKtccStage),'4강');
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});assert.equal((await inspectPage(page)).pageOverflow,false);assert.deepEqual(await auditTextContrast(page,'#ktcc-ranking-stages'),[]);
    assert.equal(await rankNav.locator('button').evaluateAll(buttons=>buttons.every(b=>b.getBoundingClientRect().height>=44)),true);
    await page.screenshot({path:'tmp/stage302-qa/ranking-'+width+'.png'});
  }
  const finalReportRequest=page.waitForRequest(r=>r.postDataJSON()?.action==='getFinalReport');
  await page.evaluate(()=>{ensureXlsxLib_=cb=>cb(false);deliverBlob_=()=>{};downloadFinalReportExcel();});assert.equal((await finalReportRequest).postDataJSON().args[3],'4강');
  await page.evaluate(()=>goRankingByCode('KTCC','KTCC','예선'));await page.waitForFunction(()=>_ranking?.selectedRound==='예선');assert.equal(await rankNav.count(),0);
  await page.evaluate(actor=>{_judge=actor;goRankingByCode('MOC','MOC','결선');},api.actors.admin);await page.waitForFunction(()=>_ranking?.compCode==='MOC');assert.equal(await rankNav.count(),0);
  await page.evaluate(actor=>{_judge=actor;goReviewByCode('KTCC','KTCC','pTeam');},api.actors.lead);await reviewNav.waitFor();await reviewNav.locator('[data-stage=""]').click();
  await page.screenshot({path:'tmp/stage302-qa/review.png'});assert.equal((await inspectPage(page)).pageOverflow,false);assert.deepEqual(await auditTextContrast(page,'#ktcc-review-stages'),[]);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),snapshot);assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
  console.log('Stage302 KTCC UI: grouped review, independent stage tabs/detail/export/refresh, preserved mission, empty/legacy stages, stale request/cache guards, other-competition isolation and responsive accessible controls passed.');
}finally{await qa.close();api.close();}
