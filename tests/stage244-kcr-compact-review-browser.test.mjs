import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrComparison} from './helpers/kcr-comparison-fixture.mjs';

const api=await createRpcFixture();
const calls=[];
let failNextDetail=false,slowDetailId='';
const qa=await createBrowserFixture({apiHandler:async body=>{
  const actor=body.args?.[1] || {};
  if(body.action==='getReviewList'){
    calls.push({code:body.args[0],compact:actor.compactReview,detail:actor.detailRowIndex,calibration:!!actor.calibrationOnly});
    if(actor.detailRowIndex && failNextDetail){failNextDetail=false;return Response.json({success:false,message:'QA detail unavailable'});}
    const result=await api.handle(body);
    if(actor.detailRowIndex && String(actor.detailRowIndex)===slowDetailId)await new Promise(resolve=>setTimeout(resolve,450));
    return result;
  }
  return api.handle(body);
}});
try{
  const {judges}=await seedKcrComparison(api);
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const config=(await api.rpc('getConfig')).configs;
  const enter=async(page,actor,calibration=false,back='pSelect')=>{
    await page.evaluate(({actor,config,calibration,back})=>{
      hideEval();_judge=actor;_configs=config;_selComp=config.find(c=>c.code==='KCR');
      _reviewCalibrationOnly=calibration;goReviewByCode('KCR','KCR',back);
    },{actor,config,calibration,back});
    await page.waitForFunction(()=>Array.isArray(_reviewState.list)&&_reviewState.list.length>0&&!document.getElementById('review-list-refresh').disabled);
  };
  for(const width of [360,768,1440]){
    const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');
    await page.evaluate(()=>localStorage.setItem('KCL_EVAL_DRAFT::live-test','keep all scores tags and comments'));
    await enter(page,judges[0],true);
    await page.waitForSelector('#kcr-comparison-result .kcr-station-comparison');
    assert.equal(await page.locator('#kcr-comparison-station option').count(),1);
    assert.equal(await page.locator('#kcr-comparison-unit option').count(),2);
    assert.match(await page.locator('#kcr-comparison-result').innerText(),/헤드 2명/);
    await page.locator('#kcr-comparison-unit').selectOption('2');
    await page.waitForFunction(()=>document.querySelector('#kcr-comparison-result h3')?.textContent.includes('참가자 2번'));
    assert.equal(await page.locator('#review-list .review-edit-btn').count(),0);
    await enter(page,judges[0]);
    await page.waitForSelector('#kcr-review-comparison .kcr-station-comparison');
    assert.ok(await page.evaluate(()=>_reviewState.list.every(item=>item.detailRequired)),'list metadata is not eagerly hydrated');
    assert.equal(await page.locator('#kcr-review-unit option').count(),2);
    assert.equal(await page.locator('#review-list .review-edit-btn').count(),1);
    if(width===360){
      failNextDetail=true;
      await page.locator('#review-list .review-edit-btn').click();
      await page.waitForFunction(()=>!_reviewDetailPendingKey);
      assert.equal(await page.evaluate(()=>activePanelId_()),'pReview','failed detail cannot open an empty editor');
      assert.match(await page.locator('.toast').innerText(),/QA detail unavailable/);
    }
    await page.locator('#review-list .review-edit-btn').click();
    await page.waitForSelector('#pReviewEdit.active');
    assert.equal(await page.evaluate(()=>_reviewState.current.detailRequired),false);
    assert.ok(await page.locator('#review-edit-fields input[type=range]').count()>0);
    assert.equal(await page.evaluate(()=>canReviewEditDetails()),true);
    assert.match(await page.locator('#review-edit-fields').innerText(),/평가 항목/);
    await page.locator('.kcr-review-comparison > summary').click();
    await page.evaluate(()=>{
      const input=document.querySelector('#review-edit-fields textarea[data-col]');
      if(input)input.value='QA unsaved local comment must stay unchanged';
      _reviewDraftDirty=true;
    });
    const snapshot=await page.locator('#review-edit-fields input,#review-edit-fields textarea').evaluateAll(nodes=>nodes.map(n=>[n.id,n.value,n.disabled]));
    const req=page.waitForResponse(r=>r.request().postDataJSON()?.action==='getReviewList'&&r.request().postDataJSON()?.args?.[1]?.detailRowIndex);
    await page.getByRole('button',{name:'통계 새로고침',exact:true}).click();await req;
    await page.waitForFunction(()=>!document.querySelector('.kcr-review-comparison > button').disabled);
    assert.deepEqual(await page.locator('#review-edit-fields input,#review-edit-fields textarea').evaluateAll(nodes=>nodes.map(n=>[n.id,n.value,n.disabled])),snapshot,'comparison refresh preserves unsaved editor values');
    const row=await page.evaluate(()=>String(_reviewState.current.rowIndex));
    await page.evaluate(()=>openReviewEdit(_reviewState.list.find(item=>item.detailRequired)));
    assert.equal(await page.evaluate(()=>String(_reviewState.current.rowIndex)),row,'lazy detail cannot replace a dirty editor');
    assert.equal((await inspectPage(page)).pageOverflow,false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('KCL_EVAL_DRAFT::live-test')),'keep all scores tags and comments');
    assert.deepEqual(page.qaErrors,[]);await page.close();
    console.log(`Stage244 compact/lazy review, calibration, error recovery, dirty edit safety passed at ${width}px.`);
  }
  const page=await qa.page();await page.goto(qa.origin+'/assessment/');
  await enter(page,judges[1]);
  assert.ok(await page.evaluate(()=>_reviewState.list.every(item=>item.detailRequired && !item.comparisonAvailable)));
  assert.equal(await page.locator('#kcr-review-comparison .kcr-station-comparison').count(),0);
  await page.locator('#review-list .review-edit-btn').click();await page.waitForSelector('#pReviewEdit.active');
  assert.equal(await page.locator('.kcr-review-comparison').count(),0,'sensory judge never receives peer comparisons');
  await page.evaluate(()=>{_reviewDraftDirty=false;_reviewState.finalRound='결선';});
  assert.equal(await page.evaluate(()=>Object.hasOwn(reviewListActorPayload_('KCR'),'compactReview')),false,'final correction contract stays unchanged');
  await page.close();
  const admin=await qa.page();await admin.goto(qa.origin+'/assessment/');await enter(admin,api.actor,false,'pAdmin');
  await admin.waitForSelector('#kcr-review-comparison .kcr-station-comparison');
  assert.ok(await admin.evaluate(()=>_reviewState.list.some(item=>!!item.participantName)),'manager mapping stays available');
  await admin.close();
  const race=await qa.page();await race.goto(qa.origin+'/assessment/');
  await enter(race,judges[0]);await race.waitForSelector('#kcr-review-comparison .kcr-station-comparison');
  slowDetailId=await race.evaluate(()=>String(_reviewState.list.find(row=>String(row.unit)==='1').rowIndex));
  await race.evaluate(()=>{_reviewState.list.forEach(row=>delete row._stddev);document.getElementById('kcr-review-unit').value='1';document.getElementById('kcr-review-unit').dispatchEvent(new Event('change'));});
  await race.locator('#kcr-review-unit').selectOption('2');
  await race.waitForFunction(()=>document.querySelector('#kcr-review-comparison h3')?.textContent.includes('참가자 2번'));
  await race.waitForTimeout(600);
  assert.match(await race.locator('#kcr-review-comparison h3').innerText(),/참가자 2번/,'late comparison must not replace the newer selection');
  assert.deepEqual(race.qaErrors,[]);await race.close();
  assert.ok(calls.some(call=>call.compact===true&&!call.detail));
  assert.ok(calls.some(call=>call.compact===false&&call.detail));
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before,'read-only QA cannot alter submitted scores or comments');
  console.log('Stage244 own/head/admin scope, final compatibility, latest-selection guard and no score changes passed.');
}finally{await qa.close();api.close();}
