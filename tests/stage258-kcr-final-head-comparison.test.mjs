import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrComparison} from './helpers/kcr-comparison-fixture.mjs';
import {stationSubmission} from './helpers/kcr-station-fixture.mjs';

const api=await createRpcFixture();
let delayDetail=null;
const qa=await createBrowserFixture({apiHandler:async message=>{
  const result=await api.handle(message);
  if(message.action==='getReviewList'&&message.args?.[1]?.detailRowIndex&&delayDetail){const pending=delayDetail;delayDetail=null;await pending;}
  return result;
}});
const records=()=>JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
fs.mkdirSync('tmp/stage258-qa',{recursive:true});
try{
  const {stations,judges,head2,freshHead,outsider}=await seedKcrComparison(api);
  await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'결선',isActive:true},api.actor);
  const submitHead=async(actor,score)=>{
    const submission={...stationSubmission(actor,stations[1],score*7),round:'결선'};
    submission.rows.forEach((row,index)=>{
      const value=score+index*.2;
      Object.assign(row.extraFields,{총점:Number((value*7).toFixed(2)),
        'Flavor(플레이버)':value,'Aftertaste(에프터테이스트)':value,'Acidity(산미)':value,
        'Sweetness(단맛) ×2':value,'Mouthfeel(마우스필)':value,'Overall(오버롤)':value,
        종합코멘트:actor.name+' 결선 컵 '+row.data[0]+' 기록'});
    });
    await api.rpc('submitScores',submission);
  };
  await submitHead(judges[0],3);await submitHead(head2,4);
  await api.rpc('submitScores',{...stationSubmission(outsider,stations[2],42),round:'결선'});
  const config=(await api.rpc('getConfig')).configs;
  let baseline;
  for(const width of [360,768,1440]){
    const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');
    await page.evaluate(({head,config})=>{_judge=head;_configs=config;_selComp=config.find(c=>c.code==='KCR');hideOverlay();goReviewByCode('KCR','KCR','pSelect');},{head:judges[0],config});
    await page.locator('#kcr-review-compare-toggle').waitFor();
    assert.equal(await page.locator('#kcr-review-compare-toggle').getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('#kcr-review-submissions .review-edit-btn').count(),1);
    assert.equal(await page.locator('#kcr-review-comparison').innerText(),'');
    await page.locator('#kcr-review-compare-toggle').click();
    const comparison=page.locator('#kcr-review-comparison');
    if(width===360){
      assert.match(await comparison.innerText(),/헤드 2명/);
      await submitHead(freshHead,5);baseline=records();
      await page.locator('#kcr-review-compare-refresh').click();
      await page.waitForFunction(()=>document.getElementById('kcr-review-comparison').innerText.includes('헤드 3명'));
    }
    assert.match(await comparison.innerText(),/헤드 3명/);
    assert.match(await comparison.innerText(),/평균 28\.00/);
    assert.match(await comparison.innerText(),/표준편차 5\.72/);
    for(const head of [judges[0],head2,freshHead])assert.ok((await comparison.innerText()).includes(head.name));
    assert.doesNotMatch(await comparison.innerText(),/KCR QA 1|QA 다른 스테이션 헤드|켈리 기록|대회 기록/);
    assert.equal(await comparison.locator('input,textarea,select,.review-edit-btn').count(),0,'peer comparison is read-only');
    assert.equal(await page.locator('#kcr-review-submissions .review-edit-btn').count(),1,'comparison never adds editable peers');
    if(width===360){
      // A delayed refresh for cup 1 must never replace the selected cup 2.
      let release;delayDetail=new Promise(resolve=>{release=resolve;});
      const requested=page.waitForRequest(r=>r.postDataJSON()?.action==='getReviewList'&&r.postDataJSON()?.args?.[1]?.detailRowIndex);
      const response=page.waitForResponse(r=>r.request().postDataJSON()?.action==='getReviewList'&&r.request().postDataJSON()?.args?.[1]?.detailRowIndex);
      await page.locator('#kcr-review-compare-refresh').click();await requested;
      await page.locator('#kcr-review-next').click();release();await(await response).finished();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    }else await page.locator('#kcr-review-next').click();
    assert.match(await comparison.locator('h3').innerText(),/참가자 2번/);
    assert.ok((await comparison.innerText()).includes('평균 '+(width===360?'25.90':'29.40')),'unrefreshed cup retains its own snapshot, never cup 1 data');
    await page.locator('#kcr-review-compare-refresh').click();
    await page.waitForFunction(()=>!document.getElementById('kcr-review-compare-refresh').disabled);
    assert.match(await comparison.innerText(),/헤드 3명/);
    assert.match(await comparison.innerText(),/평균 29\.40/);
    const check=await inspectPage(page);assert.equal(check.pageOverflow,false);assert.deepEqual(check.overflow,[]);
    await page.screenshot({path:'tmp/stage258-qa/kcr-head-comparison-'+width+'.png'});
    await comparison.scrollIntoViewIfNeeded();
    await page.screenshot({path:'tmp/stage258-qa/kcr-head-statistics-'+width+'.png'});
    await page.locator('#kcr-review-compare-toggle').click();
    assert.equal(await comparison.innerText(),'');
    await page.locator('.review-edit-btn').click();
    assert.equal(await page.evaluate(()=>_reviewState.current['심사위원명']),judges[0].name);
    assert.equal(await page.locator('#review-edit-save-only').innerText(),'수정완료');
    assert.deepEqual(page.qaErrors,[]);await page.close();
    assert.equal(records(),baseline,'reading/opening/edit form navigation changes no stored score, comment or lock');
  }
  for(const head of [judges[0],head2,freshHead]){
    const result=await api.rpc('getReviewList','KCR',{...head,round:'결선',manageReview:true,reviewScope:'manage'});
    assert.equal(result.list.length,2);assert.equal(result.ownOnly,true);
    for(const item of result.list){
      assert.equal(item['심사위원명'],head.name);
      const stats=item._stddev;
      assert.equal(stats.round,'결선');assert.equal(stats.stationId,stations[1].id);
      assert.equal(stats.headCount,3);assert.equal(stats.judgeCount,3);
      assert.equal(stats.headTotalAvg,item.unit==='1'?28:29.4);assert.equal(stats.headTotalStddev,5.7155);
      for(const metric of stats.metrics){assert.equal(metric.headCount,3);assert.equal(metric.headAvg,item.unit==='1'?4:4.2);assert.equal(metric.headStddev,.8165);}
      assert.equal(stats.judges.filter(j=>j.isCurrentJudge).length,1);
      assert.ok(stats.judges.every(j=>j.comment.includes('결선 컵 '+item.unit)));
    }
    const peer=(await api.rpc('getReviewList','KCR',{...head2,round:'결선'})).list[0];
    if(head!==head2){
      const denied=await(await api.handle({action:'resubmitFinalEvaluations',args:[{competitionCode:'KCR',round:'결선',entries:[{rowIndex:peer.rowIndex,revision:peer.finalRevision,updates:{}}]},head]})).json();
      assert.equal(denied.success,false,'heads cannot modify peer scores');
    }
  }
  assert.equal(records(),baseline);
  console.log('Stage258: three final heads, per-cup score/SD/comment accuracy, late-submission refresh, stale-response guard, own-only edits and read-only records passed at 360/768/1440px.');
}finally{await qa.close();api.close();}
