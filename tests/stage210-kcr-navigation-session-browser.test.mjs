import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrStations} from './helpers/kcr-station-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage210-qa',{recursive:true});
try {
  const {judges,lead}=await seedKcrStations(api);
  for(const width of [360,768,1440]){
    const page=await qa.page(width);
    for(const route of ['assessment','admin','registry','debriefing','camera']){
      await page.goto(qa.origin+'/'+route+'/');
      const nav=page.locator('.global-nav-buttons');await nav.waitFor();
      assert.equal(await nav.locator('button').count(),2);
      const box=await nav.boundingBox();assert.equal(Math.round(box.x),8);assert.equal(Math.round(box.y),8);
      assert.equal(await nav.locator('button').first().innerText(),'← 뒤로가기');
      assert.equal((await inspectPage(page)).pageOverflow,false,route+' '+width);
    }
    await page.goto(qa.origin+'/assessment/');
    for(const [actor,panel] of [[api.actor,'pAdmin'],[lead,'pTeam'],[judges[0],'pSelect'],[judges[1],'pSelect']]){
      await page.evaluate(actor=>{stopRegistryLiveSync_();_judge=actor;if(isAdminRole())loadAdminPanel();else if(isTeamLeaderRole())loadTeamPanel();else loadSelectPanel();},actor);
      const entry=page.locator('#'+panel+' [data-act=kcr-cal-station],#'+panel+' [data-kcr-mode=cal-station]');
      await entry.waitFor();assert.equal(await entry.count(),1);assert.equal(await entry.innerText(),'켈리브레이션');
      assert.equal(await page.locator('[data-act=kcr-cal-all],[data-kcr-mode=cal-all]').count(),0);
      await entry.click();
      await page.waitForSelector('#kcr-station-grid button');
      assert.equal(await page.locator('#kcr-station-grid button').count(),1);
      assert.match(await page.locator('#kcr-station-grid').innerText(),/스테이션 1/);
      assert.equal(await page.evaluate(()=>_evaluationPurpose.scope),'station');
    }
    await page.evaluate(()=>{
      setEvaluationPurpose_('competition');showCuppingSetup();
    });
    await page.waitForFunction(()=>document.querySelectorAll('#kcr-station-grid button').length===2);
    assert.ok(!(await page.locator('#kcr-station-grid').innerText()).includes('스테이션 1'));
    await page.evaluate(actor=>{_judge=actor;loadAdminPanel();},api.actor);
    await page.waitForSelector('#admin-comp-list [data-act=station-settings]');
    const stationCard=page.locator('#admin-comp-list .admin-comp-card').filter({has:page.locator('[data-act=kcr-cal-station]')});
    // Render the real station editor at every size; add defaults must be competition-only.
    await page.evaluate(()=>{
      var cfg=_configs.find(c=>c.code==='KCR');
      document.getElementById('admin-comp-list').innerHTML=configSelectableOptionsHtml_(cfg,'qa');
    });
    const select=page.locator('#qa-ikrc-stations-KCR [data-field=purpose]');
    assert.deepEqual(await select.evaluateAll(nodes=>nodes.map(n=>n.value)),['calibration','competition','competition']);
    await page.evaluate(()=>ikrcAddStationConfigRow_('qa','KCR'));
    assert.equal(await select.last().inputValue(),'competition');
    await select.first().scrollIntoViewIfNeeded();
    for(const field of await page.locator('#qa-ikrc-stations-KCR input,#qa-ikrc-stations-KCR select,#qa-ikrc-stations-KCR button').all()){
      const bounds=await field.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1,'station control must fit '+width+' '+await field.getAttribute('data-field')+' '+JSON.stringify(bounds));
    }
    assert.equal((await inspectPage(page)).pageOverflow,false,'station settings '+width);
    await page.screenshot({path:'tmp/stage210-qa/stations-'+width+'.png'});
    assert.deepEqual(page.qaErrors,[]);
    await page.close();console.log('Stage210 common navigation and KCR four-role station menus passed at '+width+'px.');
  }
  const page=await qa.page(390);
  await page.goto(qa.origin+'/assessment/');
  await page.locator('#inp-name').fill(judges[1].name);
  await page.locator('#inp-phone').fill(judges[1].phone);
  await page.locator('#judge-login-button').click();
  await page.waitForSelector('#pSelect.active');
  const token=await page.evaluate(()=>JSON.parse(localStorage.getItem('kclAssessmentSession')));
  assert.deepEqual(Object.keys(token),['judgeToken']);
  await page.locator('.global-nav-buttons button').nth(1).click();
  await page.waitForURL(qa.origin+'/');
  await page.goto(qa.origin+'/assessment/');await page.waitForSelector('#pSelect.active');
  assert.equal(await page.evaluate(()=>_judge.judgeToken),token.judgeToken);
  await page.reload();await page.waitForSelector('#pSelect.active');
  assert.equal(await page.evaluate(()=>_judge.judgeToken),token.judgeToken);
  const revoke=page.waitForResponse(r=>r.request().postDataJSON()?.action==='logoutSession');
  await page.evaluate(()=>doLogout());await revoke;
  await page.reload();assert.equal(await page.locator('#pLogin').isVisible(),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('kclAssessmentSession')),null);
  await page.evaluate(token=>localStorage.setItem('kclAssessmentSession',JSON.stringify(token)),token);
  await page.reload();
  await page.waitForFunction(()=>localStorage.getItem('kclAssessmentSession')===null);
  assert.equal(await page.locator('#pLogin').isVisible(),true,'a revoked token must not restore the judge');
  await page.evaluate(actor=>localStorage.setItem('kclAdminActor',JSON.stringify(actor)),api.actor);
  await page.goto(qa.origin+'/registry/');
  await page.selectOption('#comp','KCR');
  await page.waitForFunction(()=>document.getElementById('partCount').textContent.includes('KCR 등록 4건'));
  assert.equal(await page.locator('#mDate').isVisible(),false);
  assert.equal(await page.locator('#bulkParticipantDate').isVisible(),false);
  assert.equal(await page.locator('#opTeam').isVisible(),false);
  assert.equal(await page.locator('#bulkParticipantDateButton').isVisible(),false);
  await page.locator('[data-edit-part]').first().click();
  await page.locator('#mAff').fill('수정 소속');
  const save=page.waitForResponse(r=>r.request().postDataJSON()?.action==='upsertParticipant');
  await page.locator('#participantSaveBtn').click();
  const saved=(await save).request().postDataJSON().args[0];
  assert.equal(saved.competitionDate,undefined);
  assert.equal(saved.extra['대회일'],'2026-09-14');
  assert.equal(saved.extra.custom,'보존');
  assert.equal((await inspectPage(page)).pageOverflow,false);
  await page.selectOption('#comp','MOB');
  assert.equal(await page.locator('#mDate').isVisible(),true);
  assert.equal(await page.locator('#bulkParticipantDateButton').isVisible(),true);
  assert.deepEqual(page.qaErrors,[]);await page.close();
  console.log('Stage210 real login/home/reload/logout and KCR-only date UI with historic data preservation passed.');
}finally{await qa.close();api.close();}
