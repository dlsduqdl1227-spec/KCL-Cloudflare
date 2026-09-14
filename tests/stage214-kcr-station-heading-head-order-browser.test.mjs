import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrComparison} from './helpers/kcr-comparison-fixture.mjs';
import {stationSubmission} from './helpers/kcr-station-fixture.mjs';

const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage214-qa',{recursive:true});
async function assertHeadFirst(root){
  const scores=await root.locator('[aria-label="심사위원별 점수와 편차"] tbody th').evaluateAll(nodes=>nodes.map(n=>({name:n.firstChild.textContent,head:/헤드|head/i.test(n.querySelector('small').textContent)})));
  const comments=await root.locator('.kcr-comparison-comments article').evaluateAll(nodes=>nodes.map(n=>({name:n.querySelector('strong').textContent,head:/헤드|head/i.test(n.querySelector('small').textContent)})));
  assert.equal(scores.length,3);
  assert.deepEqual(scores.map(x=>x.head),[true,true,false],'head scores first regardless of submission order');
  assert.deepEqual(comments,scores,'comment and score order must match');
}
try{
  const {stations,judges,head2,freshHead}=await seedKcrComparison(api);
  // Operators can choose any station purpose: station 1 is now official, station 3 calibration.
  const configured=stations.map((s,i)=>({...s,useForCalibration:i>=2,useForCompetition:i<2}));
  await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'예선',isActive:true,optionSettings:{kcrProcesses:{blending:true},kcrStations:{stations:configured,byRound:{예선:configured,결선:configured}}}},api.actor);
  for(const actor of [freshHead,head2,judges[1]]){
    const payload=stationSubmission(actor,configured[2],28,true);
    payload.rows.forEach(row=>row.extraFields.종합코멘트=actor.name+' 스테이션 3 기록');
    await api.rpc('submitScores',payload);
  }
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const configsBefore=JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all());
  for(const width of [360,768,1440]){
    const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');
    await page.evaluate(actor=>{_judge=actor;loadSelectPanel();},freshHead);
    await page.locator('[data-kcr-mode=cal-result]').click();
    await page.waitForSelector('#kcr-comparison-result .kcr-station-comparison');
    assert.equal(await page.locator('#kcr-comparison-station option').count(),1);
    assert.equal(await page.locator('#review-total-label').innerText(),'선택 스테이션');
    assert.equal(await page.locator('#review-count-val').innerText(),'스테이션 3','show selected label, not a station count of 1');
    await assertHeadFirst(page.locator('#kcr-comparison-result'));
    await page.locator('#kcr-comparison-unit').selectOption('4');
    assert.equal(await page.locator('#review-count-val').innerText(),'스테이션 3');
    assert.equal((await inspectPage(page)).pageOverflow,false);
    assert.ok(await page.locator('#review-count-val').evaluate(n=>n.scrollWidth<=n.clientWidth),'selected station heading fits');
    await page.screenshot({path:'tmp/stage214-qa/selected-station-'+width+'.png'});
    // Entry lists, unlike historical results, reflect the latest operator settings.
    await page.evaluate(()=>{setEvaluationPurpose_('calibration','station');showCuppingSetup();});
    await page.waitForFunction(()=>document.querySelectorAll('#kcr-station-grid button').length===2);
    let options=await page.locator('#kcr-station-grid').innerText();
    assert.ok(options.includes('스테이션 3')&&options.includes('스테이션 4')&&!options.includes('스테이션 1'));
    await page.evaluate(()=>{setEvaluationPurpose_('competition');showCuppingSetup();});
    await page.waitForFunction(()=>document.getElementById('kcr-station-grid').innerText.includes('스테이션 1'));
    options=await page.locator('#kcr-station-grid').innerText();
    assert.ok(options.includes('스테이션 1')&&options.includes('스테이션 2')&&!options.includes('스테이션 3'));
    // Official comparison uses the same head-first order, including own-review details.
    await page.evaluate(actor=>{_judge=actor;loadSelectPanel();},judges[0]);
    await page.locator('[data-kcr-mode=review]').click();
    await page.waitForSelector('.review-compare-btn');await page.locator('.review-compare-btn').first().click();
    await assertHeadFirst(page.locator('.review-stddev-panel'));
    await page.locator('.review-edit-btn').first().click();await page.waitForSelector('#pReviewEdit.active');
    await page.locator('.kcr-review-comparison > summary').click();
    await assertHeadFirst(page.locator('.kcr-review-comparison-body'));
    const unchanged=await page.evaluate(()=>{
      const stats=_reviewState.current._stddev,before=JSON.stringify(stats);
      buildKcrStationComparisonHtml_(stats);return JSON.stringify(stats)===before;
    });assert.equal(unchanged,true,'display ordering must not mutate original scores or peer order');
    assert.deepEqual(page.qaErrors,[]);await page.close();
    console.log('Stage214 selected station 3 (not count), configurable purposes and head-first scores/comments passed at '+width+'px.');
  }
  const page=await qa.page(390);await page.goto(qa.origin+'/assessment/');
  await page.evaluate(actor=>{_judge=actor;loadAdminPanel();},api.actor);
  await page.locator('[data-act=kcr-cal-result]').click();await page.waitForSelector('#kcr-comparison-station');
  for(const label of ['예선 · 스테이션 3','예선 · 스테이션 4','예선 · 스테이션 1']){
    await page.locator('#kcr-comparison-station').selectOption({label});
    assert.equal(await page.locator('#review-count-val').innerText(),label.split(' · ')[1],'header follows station changes immediately');
  }
  await page.evaluate(()=>renderKcrCalibrationOverview_([]));
  assert.equal(await page.locator('#review-count-val').innerText(),'—','no misleading station number for empty results');
  assert.deepEqual(page.qaErrors,[]);await page.close();
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM competitions ORDER BY code').all()),configsBefore);
}finally{await qa.close();api.close();}
