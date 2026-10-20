import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedFreeCups} from './helpers/kcr-free-cups-fixture.mjs';
fs.mkdirSync('tmp/stage247-qa',{recursive:true});
for(const width of [360,768,1440]){
 const api=await createRpcFixture({source:fs.readFileSync('functions/api/rpc.js','utf8')+'\n// free cup QA '+width}),qa=await createBrowserFixture({apiHandler:api.handle});
 try{
  const {judges,config,cups,second}=await seedFreeCups(api);
  const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  const prelim=JSON.stringify(config.optionSettings.kcrStations.byRound.예선);
  const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');
  const configs=(await api.rpc('getConfig')).configs;
  await page.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;_adminConsole.configs=configs;showPanel('pAdmin');adminSwitchSection('config');adminRenderConfigList_();},{actor:api.actor,configs});
  const panel=page.locator('#admin-config-card-KCR [data-kcr-station-manager]');
  await panel.locator('[data-kcr-edit-round]').selectOption('결선');
  assert.equal(await page.locator('#admin-cfg-round-KCR').inputValue(),'예선','editing round is not live round');
  const list=panel.locator('.ikrc-station-config-list');
  for(let i=0;i<2;i++){
   const last=list.locator('[data-ikrc-station-row]').last();
   await last.locator('summary').click();await last.locator('.ikrc-station-remove').click();
  }
  const row=list.locator('[data-ikrc-station-row]').first();await row.locator('summary').click();
  await row.locator('[data-field=purpose]').selectOption('competition');
  await row.locator('[data-field=cupSelection]').selectOption('individual');
  await row.locator('[data-field=cupNumbers]').fill('003, 18\n42 77,114');
  assert.match(await row.locator('[data-cup-selection-status]').innerText(),/5컵/);
  assert.equal(await row.locator('[data-field=start]').isVisible(),false);
  assert.match(await row.locator('[data-station-summary]').innerText(),/3, 18, 42, 77, 114 · 5명/);
  const save=async()=>{
   const response=page.waitForResponse(r=>r.request().postDataJSON()?.action==='saveKcrStationSettings');
   await panel.locator('[data-kcr-save-stations]').click();
   const res=await(await response).json();assert.equal(res.success,true,res.message);
   await page.waitForFunction(()=>document.querySelector('#admin-config-card-KCR [data-kcr-station-manager]').dataset.saving==='false');
   return res;
  };
  await save();
  assert.equal(api.db.prepare("SELECT current_round FROM competitions WHERE code='KCR'").get().current_round,'예선');
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before);
  assert.equal(JSON.stringify(JSON.parse(api.db.prepare("SELECT option_settings FROM competitions WHERE code='KCR'").get().option_settings).kcrStations.byRound.예선),prelim);
  await panel.locator('.ikrc-station-add').click();
  const added=list.locator('[data-ikrc-station-row]').last();
  assert.equal(await added.locator('[data-field=cupSelection]').inputValue(),'individual');
  assert.equal(await added.locator('[data-field=cupNumbers]').inputValue(),'','new final station does not guess finalists');
  await added.locator('[data-field=process]').selectOption('Blending');
  await added.locator('[data-field=cupNumbers]').fill(second.cupNumbers.join(', '));
  assert.match(await added.locator('[data-cup-selection-status]').innerText(),/8컵/);
  await save();
  await added.locator('[data-field=cupNumbers]').fill('8, 008');
  assert.match(await added.locator('[data-cup-selection-status]').innerText(),/중복/);
  const stateBefore=api.db.prepare("SELECT option_settings FROM competitions WHERE code='KCR'").get().option_settings;
  await panel.locator('[data-kcr-save-stations]').click();
  assert.equal(api.db.prepare("SELECT option_settings FROM competitions WHERE code='KCR'").get().option_settings,stateBefore);
  await added.locator('[data-field=cupNumbers]').fill(second.cupNumbers.join(', '));
  // Declining a round switch preserves unsaved cup input.
  page.removeAllListeners('dialog');page.once('dialog',d=>d.dismiss());
  await panel.locator('[data-kcr-edit-round]').selectOption('예선');
  assert.equal(await panel.locator('[data-kcr-edit-round]').inputValue(),'결선');
  assert.equal(await added.locator('[data-field=cupNumbers]').inputValue(),second.cupNumbers.join(', '));
  page.on('dialog',d=>d.accept());
  await save();
  const layout=await inspectPage(page);assert.equal(layout.pageOverflow,false);assert.deepEqual(layout.overflow,[]);
  await page.screenshot({path:`tmp/stage247-qa/editor-${width}.png`});
  // Reopen final setup; settings persist independently of the active preliminary.
  await page.evaluate(()=>adminRenderConfigList_());await panel.locator('[data-kcr-edit-round]').selectOption('결선');
  await list.locator('[data-ikrc-station-row]').first().locator('summary').click();
  assert.equal(await list.locator('[data-ikrc-station-row]').first().locator('[data-field=cupNumbers]').inputValue(),cups.join(', '));
  // Activate finals only in this disposable test database, then use the real judging UI.
  await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'결선',isActive:true},api.actor);
  const active=(await api.rpc('getConfig')).configs;
  await page.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;_selComp=configs.find(c=>c.code==='KCR');setEvaluationPurpose_('competition');showCuppingSetup();},{actor:judges[1],configs:active});
  await page.waitForFunction(()=>_kcrCompletionState?.ownerToken===_judge.judgeToken&&registeredTargetsForRange_('KCR',['3','18']).validated);
  const first=page.locator('#kcr-station-grid [data-station-id=stable-a]');
  assert.match(await first.innerText(),/3, 18, 42, 77, 114/);
  assert.doesNotMatch(await first.innerText(),/독립 선수|확인용/,'judges see blind numbers only');
  await first.click();
  assert.deepEqual(await page.evaluate(()=>_cupping.cups.map(c=>String(c.cupNumber))),cups);
  await page.evaluate(()=>{
   _cupping.cups[0].flavor=2.4;_cupping.cups[0].noteOverall='3번 결선 독립 기록';
   _cupping.cups[4].flavor=4.2;_cupping.cups[4].noteOverall='114번 결선 독립 기록';
   cuppingSubmitAll();
  });
  await page.waitForFunction(()=>activePanelId_()==='pCuppingSetup'&&_kcrCompletionState?.officialUnits.length===5);
  assert.equal(await first.isDisabled(),true);assert.match(await first.innerText(),/평가완료 5\/5/);
  const finals=api.db.prepare("SELECT * FROM scores WHERE round='결선' ORDER BY id").all();
  assert.deepEqual(finals.map(r=>r.unit),cups);
  assert.match(finals[0].payload_json,/3번 결선 독립 기록/);
  assert.match(finals[4].payload_json,/114번 결선 독립 기록/);
  assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE round='예선' ORDER BY id").all()),before);
  assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
  await page.close();console.log('Stage247 sparse final setup, dedicated save, duplicate/dirty guards, blind judging and independent 5-cup submit passed at '+width+'px.');
 }finally{await qa.close();api.close();}
}
