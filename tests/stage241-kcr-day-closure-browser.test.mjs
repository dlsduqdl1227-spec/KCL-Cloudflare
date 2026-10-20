import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrDayClosure} from './helpers/kcr-day-closure-fixture.mjs';
import {stationSubmission} from './helpers/kcr-station-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage241-qa',{recursive:true});
try {
  const {stations,judges,save}=await seedKcrDayClosure(api);
  for(const judge of judges)await api.rpc('submitScores',stationSubmission(judge,stations[2],35));
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  for(const width of [360,768,1440]) {
    await save([]);
    const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');
    await page.evaluate(actor=>{_judge=actor;_adminPreferredSection='config';loadAdminPanel();},api.actor);
    const panel=page.locator('#admin-config-card-KCR [data-kcr-station-manager]');await panel.waitFor();
    await panel.locator('[data-kcr-close-day="1"]').check();
    const saved=page.waitForResponse(r=>r.request().postDataJSON()?.action==='updateCompetitionAdminSettings');
    await page.locator('#admin-config-card-KCR [data-save=KCR]').click();assert.equal((await(await saved).json()).success,true);
    await page.waitForFunction(()=>document.querySelectorAll('#admin-config-card-KCR fieldset[disabled]').length===2);
    await panel.locator('[data-station-id="stable-b"] > summary').click();
    assert.equal(await panel.locator('[data-station-id="stable-b"] [data-field=start]').isDisabled(),true);
    assert.equal(await panel.locator('[data-station-id="stable-c"] [data-field=start]').isDisabled(),false);
    assert.match(await panel.innerText(),/마감/); assert.equal((await inspectPage(page)).pageOverflow,false);
    await page.screenshot({path:`tmp/stage241-qa/manager-${width}.png`});
    await page.evaluate(()=>goReviewByCode('KCR','KCR','pAdmin'));
    await page.waitForSelector('#review-list .review-edit-btn');
    await page.locator('#kcr-review-station').selectOption({label:'예선 · 스테이션 2'});
    assert.match(await page.locator('#review-list .review-edit-btn').first().innerText(),/마감.*상세보기/);
    assert.equal(await page.locator('#review-list .review-delete-btn').count(),0);
    await page.locator('#review-list .review-edit-btn').first().click();await page.waitForSelector('#pReviewEdit.active');
    assert.equal(await page.locator('#review-edit-save-only').isVisible(),false);
    assert.equal(await page.locator('#review-edit-delete').isVisible(),false);
    assert.equal(await page.evaluate(()=>canReviewEditAny_()),false);
    assert.match(await page.locator('#review-edit-sub').innerText(),/마감/);
    assert.deepEqual(await page.locator('#review-edit-fields input:not([type=hidden]):not([disabled]):not([readonly]), #review-edit-fields textarea:not([disabled]):not([readonly])').evaluateAll(nodes=>nodes.map(n=>({id:n.id,type:n.type}))),[]);
    assert.equal((await inspectPage(page)).pageOverflow,false);
    await page.screenshot({path:`tmp/stage241-qa/closed-review-${width}.png`});
    // Returning from read-only history must not disable the open day's editor.
    await page.evaluate(()=>goReviewByCode('KCR','KCR','pAdmin'));await page.waitForSelector('#kcr-review-station');
    await page.locator('#kcr-review-station').selectOption({label:'예선 · 스테이션 3'});
    await page.locator('#review-list .review-edit-btn').first().click();
    await page.waitForSelector('#pReviewEdit.active');
    assert.equal(await page.evaluate(()=>canReviewEditDetails()),true);
    assert.equal(await page.locator('#review-edit-save-only').isVisible(),true);
    for(const judge of judges) {
      await page.evaluate(actor=>{_judge=actor;_selComp=_configs.find(c=>c.code==='KCR');setEvaluationPurpose_('competition');showCuppingSetup();},judge);
      await page.waitForFunction(()=>document.querySelectorAll('#kcr-station-grid button').length===1);
      assert.match(await page.locator('#kcr-station-grid').innerText(),/114.*115/s);
      assert.doesNotMatch(await page.locator('#kcr-station-grid').innerText(),/1일차|KCR QA|2일차 선수/);
      assert.deepEqual(await page.evaluate(()=>({disabled:document.querySelector('#kcr-evaluation-day option[value="1"]').disabled,hidden:document.querySelector('#kcr-evaluation-day option[value="1"]').hidden,manager:isTeamLeaderForCode_('KCR'),closed:competitionOptionSettings_(_selComp).kcrStations.closedPrelimDays})),{disabled:true,hidden:true,manager:false,closed:[1]});
      await page.evaluate(()=>goReview());await page.waitForSelector('#kcr-review-unit');
      assert.deepEqual(await page.locator('#kcr-review-unit option').evaluateAll(options=>options.map(o=>o.value).sort()),['114','115']);
      assert.equal((await inspectPage(page)).pageOverflow,false);
    }
    assert.deepEqual(page.qaErrors,[]);await page.close();
    console.log(`Stage241 closure controls, admin read-only history, day-two editor and head/sensory hiding passed at ${width}px.`);
  }
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before,'UI inspection never changes stored evaluation content');
} finally {await qa.close();api.close();}
