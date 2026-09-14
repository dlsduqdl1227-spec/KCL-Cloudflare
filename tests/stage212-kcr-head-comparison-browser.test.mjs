import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrComparison} from './helpers/kcr-comparison-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage212-qa',{recursive:true});
try{
  const {judges,head2}=await seedKcrComparison(api);
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  for(const width of [360,768,1440]){
    const page=await qa.page(width);
    await page.goto(qa.origin+'/assessment/');
    await page.evaluate(actor=>{_judge=actor;loadSelectPanel();},judges[0]);
    const results=page.locator('[data-kcr-mode=cal-result]');await results.waitFor();
    assert.equal(await results.innerText(),'켈리브레이션 확인');await results.click();
    await page.waitForSelector('#kcr-comparison-result .kcr-station-comparison');
    assert.equal(await page.locator('#kcr-comparison-station option').count(),1);
    assert.equal(await page.locator('#kcr-comparison-unit option').count(),2);
    assert.match(await page.locator('#kcr-comparison-result').innerText(),/헤드 2명/);
    assert.match(await page.locator('#kcr-comparison-result').innerText(),/5\.72/);
    assert.match(await page.locator('#kcr-comparison-result').innerText(),/3\.50/);
    assert.match(await page.locator('#kcr-comparison-result').innerText(),/헤드심사위원 간 비교/);
    assert.match(await page.locator('#kcr-comparison-result').innerText(),/QA 두 번째 헤드 켈리 기록/);
    assert.equal(await page.locator('#review-list .review-edit-btn').count(),0,'calibration result is read only');
    await page.locator('#kcr-comparison-unit').selectOption('2');
    assert.match(await page.locator('#kcr-comparison-result h3').innerText(),/참가자 2번/);
    assert.equal((await inspectPage(page)).pageOverflow,false);
    await page.screenshot({path:'tmp/stage212-qa/calibration-'+width+'.png'});
    // Ordinary review remains own-only and editable, with a separate peer comparison.
    await page.evaluate(()=>goReview());
    await page.waitForSelector('#review-list .review-edit-btn');
    assert.equal(await page.locator('#kcr-comparison-result').count(),0,'no calibration cache leaks into official review');
    assert.equal(await page.locator('#review-list .review-compare-btn').count(),2,'two own cup submissions only');
    await page.locator('#review-list .review-compare-btn').first().click();
    assert.match(await page.locator('.review-stddev-panel').innerText(),/대회평가/);
    assert.ok(!(await page.locator('.review-stddev-panel').innerText()).includes('켈리 기록'));
    await page.locator('#review-list .review-edit-btn').first().click();
    await page.waitForSelector('#pReviewEdit.active');
    const layout=await page.evaluate(()=>{
      const panel=document.getElementById('pReviewEdit').getBoundingClientRect(),nav=document.querySelector('.global-nav-buttons').getBoundingClientRect();
      return {panelWidth:panel.width,panelTop:panel.top,navBottom:nav.bottom};
    });
    assert.ok(layout.panelTop>=layout.navBottom,'KCR review heading must not overlap global navigation');
    assert.ok(layout.panelWidth>=Math.min(width,1120)-1,'KCR review uses desktop width instead of a 560px phone column');
    assert.equal(await page.locator('#review-edit-save-only').isVisible(),true,'persistent top save remains accessible');
    assert.equal(await page.locator('#review-edit-sticky-actions').isVisible(),false,'duplicate save bar must not cover station statistics');
    assert.equal(await page.evaluate(()=>canReviewEditDetails()),true);
    assert.ok(await page.locator('#review-edit-fields input[type=range]').count()>0);
    await page.locator('.kcr-review-comparison > summary').click();
    const originalInputs=await page.locator('#review-edit-fields input,#review-edit-fields textarea').evaluateAll(nodes=>nodes.map(n=>[n.id,n.value,n.disabled]));
    const refreshed=page.waitForResponse(r=>r.request().postDataJSON()?.action==='getReviewList');
    await page.getByRole('button',{name:'통계 새로고침',exact:true}).click();await refreshed;
    await page.waitForFunction(()=>!document.querySelector('.kcr-review-comparison > button').disabled);
    assert.ok(await page.locator('.kcr-comparison-refresh').evaluate(b=>b.offsetWidth>=128&&b.offsetHeight>=44&&b.scrollWidth<=b.clientWidth),'refresh label fits inside a touch-sized button');
    assert.deepEqual(await page.locator('#review-edit-fields input,#review-edit-fields textarea').evaluateAll(nodes=>nodes.map(n=>[n.id,n.value,n.disabled])),originalInputs);
    assert.match(await page.locator('.kcr-review-comparison-body').innerText(),/QA 두 번째 헤드 대회 기록/);
    assert.equal((await inspectPage(page)).pageOverflow,false);
    await page.screenshot({path:'tmp/stage212-qa/review-'+width+'.png'});
    assert.deepEqual(page.qaErrors,[]);await page.close();
    console.log('Stage212 head calibration/read-only filters, official review editing, peer stats and safe refresh passed at '+width+'px.');
  }
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before,'view and stats refresh must not save or modify evaluations');
  const page=await qa.page(390);await page.goto(qa.origin+'/assessment/');
  await page.evaluate(actor=>{_judge=actor;loadSelectPanel();},judges[1]);await page.waitForSelector('[data-kcr-mode=review]');
  assert.equal(await page.locator('[data-kcr-mode=cal-result]').count(),0,'sensory judge has no peer result access');
  await page.locator('[data-kcr-mode=review]').click();await page.waitForSelector('#review-list .review-edit-btn');
  assert.equal(await page.locator('.review-compare-btn').count(),0);
  // A slow calibration response must never overwrite a newer official view.
  await page.evaluate(actor=>{
    _judge=actor;window.qaCalls=[];window.google={script:{get run(){const call={};return {withSuccessHandler(fn){call.ok=fn;return this;},withFailureHandler(fn){call.fail=fn;return this;},getReviewList(code,actor){qaCalls.push(call);}};}}};
    _reviewCalibrationOnly=true;goReviewByCode('KCR','KCR','pSelect');
    _reviewCalibrationOnly=false;goReviewByCode('KCR','KCR','pSelect');
    qaCalls[1].ok({success:true,list:[],headers:[],calibrationOnly:false});
    qaCalls[0].ok({success:true,list:[],headers:[],calibrationOnly:true,readOnlyHeadMonitor:true});
  },head2);
  assert.equal(await page.evaluate(()=>_reviewState.calibrationOnly),false);
  assert.equal(await page.evaluate(()=>_reviewState.readOnlyHeadMonitor),false);
  assert.equal(await page.locator('#kcr-comparison-result').count(),0);
  // A failed new-purpose request must not relabel the previous purpose's cache.
  await page.evaluate(()=>{
    _reviewState.list=[{rowIndex:'stale-calibration',_stddev:{purpose:'calibration-review'}}];
    _reviewState.fetchKey='previous-calibration-context';
    _reviewCalibrationOnly=false;
    goReviewByCode('KCR','KCR','pSelect');
    qaCalls.at(-1).fail(new Error('QA transient failure'));
    goReviewByCode('KCR','KCR','pSelect');
  });
  assert.equal(await page.evaluate(()=>_reviewState.list.length),0,'retry after purpose switch must not reuse stale peer data');
  await page.evaluate(()=>qaCalls.at(-1).ok({success:true,list:[],headers:[],calibrationOnly:false}));
  assert.deepEqual(page.qaErrors,[]);await page.close();
  console.log('Stage212 sensory isolation and delayed calibration/official response isolation passed.');
}finally{await qa.close();api.close();}
