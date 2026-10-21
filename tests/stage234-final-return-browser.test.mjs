import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedRoundRankings,competitionCodes} from './helpers/round-ranking-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage234-qa',{recursive:true});
try{
 await seedRoundRankings(api);
 for(const width of [360,768,1440]){
  const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');
  page.removeAllListeners('dialog');page.on('dialog',d=>d.accept(d.type()==='prompt'?'종이 평가표 코멘트 확인':undefined));
  for(const code of competitionCodes){
   console.log('Stage234 checking',width,code);
   await page.evaluate(({actor,code})=>{_judge=actor;_selComp={code,name:code,currentRound:'결선'};hideOverlay();_reviewCalibrationOnly=false;goReviewByCode(code,code,'pAdmin');},{actor:api.actor,code});
   await page.locator('.final-return-btn').first().waitFor().catch(async e=>{console.log(await page.evaluate(()=>({code:_reviewState.code,round:_reviewState.finalRound,list:_reviewState.list.length,stat:document.getElementById('review-stat').textContent,panel:activePanelId_(),listText:document.getElementById('review-list').innerText})),page.qaErrors);throw e;});
   assert.match(await page.locator('#review-title').innerText(),/평가 관리/);
   assert.doesNotMatch(await page.locator('#review-stat').innerText(),/미검수|검수완료/);
   await page.locator('#review-list .review-edit-btn').first().click();
   assert.equal(await page.locator('#review-edit-save-only').isVisible(),code==='KCR');
   if(code!=='KCR')assert.equal(await page.locator('#review-edit-fields input:not([disabled]),#review-edit-fields textarea:not([disabled])').count(),0,'submitted record locked '+code);
   await page.evaluate(()=>backToReviewList());await page.locator('.final-return-btn').first().waitFor();
   await page.locator('.final-return-btn').first().click();
   await page.waitForFunction(()=>document.querySelector('#review-list .final-return-reason'));
   await page.locator('#review-list .review-edit-btn').first().click();
   assert.equal(await page.locator('#review-edit-save-only').innerText(),code==='KCR'?'수정완료':'수정 후 재제출');
   assert.equal(await page.locator('#review-edit-save-complete').isVisible(),false);
   const area=page.locator('#review-edit-fields textarea:not([disabled])').first();
   if(await area.count()){
    await area.fill(code+' 종이 평가표 확인 '+width);
    await page.waitForTimeout(1100);
    const current=api.db.prepare('SELECT review_status FROM scores WHERE competition_code=? AND round=?').get(code,'결선');assert.equal(current.review_status,'반려','typing stays a draft');
   }
   assert.equal((await inspectPage(page)).pageOverflow,false,code+' fits '+width);
   if(code==='KCAC')await page.screenshot({path:`tmp/stage234-qa/correction-${width}.png`});
   const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/rpc'&&r.request().postDataJSON()?.action==='resubmitFinalEvaluations').catch(()=>null);
   await page.locator('#review-edit-sticky-actions .save-primary').click().catch(async e=>{console.log('CLICK',code,await page.evaluate(()=>({panel:activePanelId_(),body:document.body.innerText.slice(-1800),ancestors:[...document.querySelector('#review-edit-sticky-actions').parentElement.parentElement.classList],style:getComputedStyle(document.querySelector('.save-primary')).cssText})),page.qaErrors);await page.screenshot({path:'tmp/stage234-qa/failure.png'});throw e;});
   const response=await saved;
   if(!response)console.log(await page.evaluate(()=>({code:_reviewState.code,status:_reviewState.current?.status,final:_reviewState.current?.finalWorkflow,saving:_finalCorrectionSaving,toast:document.getElementById('toast')?.textContent,auto:document.getElementById('review-autosave-state')?.textContent})),page.qaErrors);
   assert.ok(response,'resubmit reached server '+code);
   assert.equal((await response.json()).success,true,'resubmit '+code);
   await page.locator('.final-return-btn').first().waitFor();
   assert.ok((await api.rpc('getRanking',code,api.actor,'결선')).ranking.length);
   assert.deepEqual(page.qaErrors,[]);
  }
  await page.close();console.log('Stage234 final return/edit/resubmit UI passed for all seven competitions at '+width+'px.');
 }
}finally{await qa.close();api.close();}
