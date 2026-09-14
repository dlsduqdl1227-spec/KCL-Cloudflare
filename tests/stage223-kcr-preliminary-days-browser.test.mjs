import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrStations} from './helpers/kcr-station-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage223-qa',{recursive:true});
try{
  const {stations,judges}=await seedKcrStations(api);
  const rows=stations.map((s,i)=>({...s,prelimDay:i===2?2:i===1?1:null}));
  const save=()=>api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'예선',isActive:true,optionSettings:{kcrProcesses:{blending:true},kcrStations:{stations:rows,byRound:{예선:rows,결선:stations}}}},api.actor);
  for(const width of [360,768,1440]){
    await save();const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');
    await page.evaluate(actor=>{_judge=actor;_adminPreferredSection='config';loadAdminPanel();},api.actor);
    const panel=page.locator('#admin-config-card-KCR [data-kcr-station-manager]');await panel.waitFor();
    const filter=panel.locator('[data-kcr-day-filter]'),all=panel.locator('[data-ikrc-station-row]');
    assert.equal(await all.count(),3);
    await filter.selectOption('2');assert.equal(await all.filter({visible:true}).count(),1);
    const visible=panel.locator('[data-ikrc-station-row]:visible');assert.equal(await visible.getAttribute('data-station-id'),'stable-c');
    // Add inherits the selected day, and hidden day-one/calibration rows stay in the save payload.
    await panel.locator('.ikrc-station-add').click();
    assert.equal(await all.count(),4);assert.equal(await all.last().locator('[data-field=prelimDay]').inputValue(),'2');
    await all.last().locator('[data-field=start]').fill('5');await all.last().locator('[data-field=end]').fill('11');
    const saving=page.waitForResponse(r=>r.request().postDataJSON()?.action==='updateCompetitionAdminSettings');
    await page.locator('#admin-config-card-KCR [data-save=KCR]').click();const response=await saving;assert.equal((await response.json()).success,true);
    await page.waitForFunction(()=>document.querySelectorAll('#admin-config-card-KCR [data-ikrc-station-row]').length===4);
    const cfg=JSON.parse(api.db.prepare("SELECT option_settings FROM competitions WHERE code='KCR'").get().option_settings);
    assert.deepEqual(cfg.kcrStations.byRound.예선.map(s=>s.prelimDay),[null,1,2,2]);
    assert.deepEqual(cfg.kcrStations.byRound.예선.slice(0,3).map(s=>s.id),stations.map(s=>s.id));
    assert.equal(cfg.kcrStations.byRound.결선.length,3);
    await filter.selectOption('1');await panel.scrollIntoViewIfNeeded();
    const layout=await inspectPage(page);assert.equal(layout.pageOverflow,false);assert.deepEqual(layout.overflow,[]);
    await page.screenshot({path:`tmp/stage223-qa/manager-${width}.png`});
    // Switching round removes day controls without splitting or relabeling the scoring round.
    await page.locator('#admin-cfg-round-KCR').selectOption('결선');
    assert.equal(await filter.isVisible(),false);assert.equal(await panel.locator('[data-field=prelimDay]:visible').count(),0);
    assert.equal(await panel.locator('[data-ikrc-station-row]:visible').count(),3);
    await page.locator('#admin-cfg-round-KCR').selectOption('예선');assert.equal(await filter.inputValue(),'all');
    // Evaluation picker respects day + purpose together and contains no real names.
    await page.evaluate(actor=>{_judge=actor;_selComp=_configs.find(c=>c.code==='KCR');setEvaluationPurpose_('competition');showCuppingSetup();},judges[0]);
    await page.waitForFunction(()=>document.querySelectorAll('#kcr-station-grid button').length===3);
    await page.locator('#kcr-evaluation-day').selectOption('1');assert.equal(await page.locator('#kcr-station-grid button').count(),1);
    assert.match(await page.locator('#kcr-station-grid').innerText(),/1일차 예선/);
    await page.locator('#kcr-evaluation-day').selectOption('2');assert.equal(await page.locator('#kcr-station-grid button').count(),2);
    assert.doesNotMatch(await page.locator('#kcr-station-grid').innerText(),/KCR QA/);
    assert.equal((await inspectPage(page)).pageOverflow,false);
    await page.screenshot({path:`tmp/stage223-qa/picker-${width}.png`});
    await page.evaluate(()=>{setEvaluationPurpose_('calibration','station');renderKcrStationChoices_();});
    assert.equal(await page.locator('#kcr-station-grid button').count(),0);
    await page.locator('#kcr-evaluation-day').selectOption('all');assert.equal(await page.locator('#kcr-station-grid button').count(),1);
    await page.locator('#kcr-evaluation-day').selectOption('2');
    await page.evaluate(()=>showCuppingSetup());
    await page.waitForFunction(()=>document.querySelectorAll('#kcr-station-grid button').length===1);
    assert.equal(await page.locator('#kcr-evaluation-day').inputValue(),'all','new entry clears an old-purpose day filter');
    assert.deepEqual(page.qaErrors,[]);await page.close();console.log(`Stage223 day filter, add/save, hidden-row preservation, round and purpose isolation passed at ${width}px.`);
  }
}finally{await qa.close();api.close();}
