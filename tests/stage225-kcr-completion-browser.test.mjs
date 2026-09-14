import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrStations,stationSubmission} from './helpers/kcr-station-fixture.mjs';
const api=await createRpcFixture();
let submitCalls=0,loseReply=false,failState=false;
const ids=[];
const qa=await createBrowserFixture({apiHandler:async body=>{
  if(body.action==='getKcrStationEvaluationState'&&failState)return Response.json({success:false,message:'QA 상태 확인 실패'});
  if(body.action==='submitScores'){
    submitCalls++;ids.push(body.args[0].clientSubmissionId);
    const result=await api.handle(body);
    await new Promise(resolve=>setTimeout(resolve,200));
    if(loseReply){loseReply=false;return Response.json({success:false,message:'QA 저장 후 응답 확인 실패'});}
    return result;
  }
  return api.handle(body);
}});
fs.mkdirSync('tmp/stage225-qa',{recursive:true});
try{
  const {stations,judges}=await seedKcrStations(api);
  const config=(await api.rpc('getConfig')).configs;
  const enter=async(page,actor)=>{
    await page.evaluate(({actor,config})=>{hideEval();_judge=actor;_configs=config;_selComp=config.find(c=>c.code==='KCR');setEvaluationPurpose_('competition');showCuppingSetup();},{actor,config});
    await page.waitForFunction(()=>_kcrCompletionState?.ownerToken===_judge.judgeToken);
    await page.waitForFunction(()=>registeredTargetsForRange_('KCR',['1','2']).validated);
  };
  const b=page=>page.locator('#kcr-station-grid [data-station-id="stable-b"]');
  for(const width of [360,768,1440]){
    const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');
    await enter(page,judges[0]);
    if(width===360){
      assert.match(await b(page).innerText(),/미평가 0\/2/);assert.equal(await b(page).isEnabled(),true);
      await b(page).click();await page.locator('#evalCupping').waitFor({state:'visible'});
      const before=submitCalls;loseReply=true;
      await page.evaluate(()=>{_cupping.cups.forEach(c=>{c.flavor=3.4;c.noteOverall='본인 평가 코멘트와 스마트태그 보존';c.flavorTagIds=['nuts'];});renderCuppingAttrCard();cuppingSubmitAll();cuppingSubmitAll();});
      await page.waitForFunction(()=>!_kcrSubmitting);
      assert.equal(submitCalls,before+1,'double click sends only one request');
      assert.equal(api.db.prepare('SELECT COUNT(*) n FROM scores').get().n,2);
      assert.match(await page.evaluate(()=>_cupping.cups[0].noteOverall),/본인 평가/);
      await page.evaluate(()=>cuppingSubmitAll());
      await page.waitForFunction(()=>activePanelId_()==='pCuppingSetup'&&_kcrCompletionState?.officialUnits.length===2);
      assert.equal(ids[ids.length-1],ids[ids.length-2],'retry reuses its persisted submission identity');
      assert.equal(api.db.prepare('SELECT COUNT(*) n FROM scores').get().n,2,'retry cannot add scores');
    }
    await page.waitForFunction(()=>document.querySelector('#kcr-station-grid [data-station-id="stable-b"]')?.disabled);
    assert.match(await b(page).innerText(),/평가완료 2\/2/);
    assert.equal(await page.locator('#kcr-station-help button').innerText(),'내평가 검수');
    await page.evaluate(()=>startKcrStation_('stable-b'));
    assert.equal(await page.evaluate(()=>hasActiveEval_()),false,'direct start cannot bypass completion guard');
    assert.equal(await page.locator('#kcr-station-grid [data-station-id="stable-c"]').isEnabled(),true,'other station remains available');
    const layout=await inspectPage(page);assert.equal(layout.pageOverflow,false);assert.deepEqual(layout.overflow,[]);
    await page.screenshot({path:`tmp/stage225-qa/completed-${width}.png`});
    // Review navigation remains editable, without a second evaluation entry.
    await page.locator('#kcr-station-help button').click();await page.waitForFunction(()=>activePanelId_()==='pReview'&&_reviewState.list?.length>0);
    await enter(page,judges[1]);assert.match(await b(page).innerText(),/미평가 0\/2/);assert.equal(await b(page).isEnabled(),true);
    await page.evaluate(()=>{setEvaluationPurpose_('calibration','station');showCuppingSetup();});
    await page.waitForFunction(()=>_kcrCompletionState!==null);
    assert.equal(await page.locator('#kcr-station-grid [data-station-id="stable-a"]').isEnabled(),true);
    // Failed status loading never offers an unverified station as a new evaluation.
    failState=true;await page.evaluate(()=>{setEvaluationPurpose_('competition');showCuppingSetup();});
    await page.waitForFunction(()=>!document.querySelector('.station-list-refresh[data-code="KCR"]').disabled);
    assert.equal(await b(page).isDisabled(),true);assert.match(await b(page).innerText(),/제출 여부 확인 필요/);
    failState=false;await page.locator('.station-list-refresh[data-code="KCR"]').click();await page.waitForFunction(()=>_kcrCompletionState!==null);
    assert.equal(await b(page).isEnabled(),true);
    assert.deepEqual(page.qaErrors,[]);await page.close();console.log(`Stage225 completion, own-judge isolation, retry, review, failure safety and layout passed at ${width}px.`);
  }
  // The UI selects only outstanding cups when a previous partial record exists.
  await api.rpc('submitScores',stationSubmission(judges[1],stations[1],21));
  api.db.prepare("DELETE FROM scores WHERE judge_name=? AND unit='2'").run(judges[1].name);
  const page=await qa.page();await page.goto(qa.origin+'/assessment/');await enter(page,judges[1]);
  assert.match(await b(page).innerText(),/일부 평가완료 1\/2/);await b(page).click();
  assert.deepEqual(await page.evaluate(()=>_cupping.cups.map(c=>String(c.cupNumber))),['2']);
  await page.evaluate(()=>cuppingSubmitAll());await page.waitForFunction(()=>activePanelId_()==='pCuppingSetup'&&_kcrCompletionState?.officialUnits.length===2);
  assert.equal(api.db.prepare('SELECT COUNT(*) n FROM scores WHERE judge_name=?').get(judges[1].name).n,2);
  assert.deepEqual(page.qaErrors,[]);await page.close();
}finally{await qa.close();api.close();}
