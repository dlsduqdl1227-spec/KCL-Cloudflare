import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
import {createBrowserFixture,inspectPage,selectOperationsCompetition} from './helpers/browser-fixture.mjs';

function finalsOnly(api){for(const cfg of api.db.prepare('SELECT code,option_settings FROM competitions').all()){
  const options=JSON.parse(cfg.option_settings||'{}');delete options.debriefingPhases;
  api.db.prepare('UPDATE competitions SET debriefing=1,option_settings=? WHERE code=?').run(JSON.stringify(options),cfg.code);
}}
const snapshot=api=>JSON.stringify(['scores','participants'].map(table=>api.db.prepare('SELECT * FROM '+table+' ORDER BY id').all()));

test('players cannot see or select prelim; genuine OTP flow opens only the selected post-prelim round in all seven competitions',async()=>{
  const api=await createAllDebriefFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
  fs.mkdirSync('tmp/stage316-qa',{recursive:true});
  try{
    finalsOnly(api);const before=snapshot(api);
    for(const c of api.cases){
      const page=await qa.page(390,1000),sends=[];
      page.on('request',request=>{if(new URL(request.url()).pathname==='/api/rpc'){const payload=request.postDataJSON();if(payload?.action==='sendOTP')sends.push(payload.args);}});
      await page.goto(qa.origin+'/debriefing/');await page.locator('#sel-comp option[value="'+c.code+'"]').waitFor({state:'attached'});
      await page.locator('#sel-comp').selectOption(c.code);
      const phases=await page.locator('#sel-phase option').allTextContents();assert.deepEqual(phases,c.rounds.filter(round=>round!=='예선'));
      assert.ok(!phases.includes('예선'));await page.locator('#sel-phase').selectOption('결선');
      await page.locator('#inp-name').fill(c.name);await page.locator('#inp-phone').fill(c.phone);await page.locator('#btn-send-otp').click();
      await page.waitForFunction(()=>document.getElementById('pStep2').classList.contains('active'));
      assert.equal(sends.length,1);assert.equal(sends[0][3],'결선');
      const otp=api.db.prepare('SELECT otp FROM otps WHERE competition_code=? AND name=? AND phone=? ORDER BY id DESC LIMIT 1').get(c.code,c.name,c.phone).otp;
      await page.locator('#inp-otp').fill(otp);await page.locator('#btn-verify').click();
      await page.waitForFunction(()=>document.getElementById('pResult').classList.contains('active'));
      assert.deepEqual(await page.locator('.round-section>.round-title').allTextContents(),['결선']);
      assert.equal(await page.locator('#res-body').getByRole('button',{name:'예선 디브리핑'}).count(),0);
      assert.ok((await page.evaluate(()=>_lastResult.scores)).every(row=>row.round==='결선'));
      for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});assert.equal((await inspectPage(page)).pageOverflow,false);}
      assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);await page.close();
    }
    assert.equal(snapshot(api),before);
  }finally{await qa.close();api.close();}
});

test('manager selects the release stage independently of the competition round and private previews retain all history',async()=>{
  const api=await createAllDebriefFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
  try{
    finalsOnly(api);const before=snapshot(api),page=await qa.page(390,1000);
    await page.addInitScript(actor=>localStorage.setItem('kclAdminActor',JSON.stringify(actor)),api.actor);
    await page.goto(qa.origin+'/assessment/?admin=1');await selectOperationsCompetition(page,'KCR','config');
    const select=page.locator('#admin-cfg-debrief-phase-KCR');assert.equal(await select.inputValue(),'본결선');
    for(const [phase,expected]of [['예선',['예선']],['본결선',['결선']]]){
      await select.selectOption(phase);await page.locator('#admin-config-card-KCR [data-save="KCR"]').click();
      await page.waitForFunction(phases=>JSON.stringify(_adminConsole.configs.find(c=>c.code==='KCR').debriefingPhases)===JSON.stringify(phases),expected);
      assert.deepEqual(JSON.parse(api.db.prepare("SELECT option_settings FROM competitions WHERE code='KCR'").get().option_settings).debriefingPhases,expected);
      const publicPage=await qa.page(390);await publicPage.goto(qa.origin+'/debriefing/');await publicPage.locator('#sel-comp option[value=KCR]').waitFor({state:'attached'});await publicPage.locator('#sel-comp').selectOption('KCR');
      assert.deepEqual(await publicPage.locator('#sel-phase option').allTextContents(),expected);await publicPage.close();
    }
    const preview=await qa.page(390);await preview.addInitScript(actor=>localStorage.setItem('kclAdminActor',JSON.stringify(actor)),api.actor);
    await preview.goto(qa.origin+'/debriefing/?from=admin&preview=1&comp=KCR');await preview.locator('#admin-preview-unit option').nth(1).waitFor({state:'attached'});
    assert.deepEqual(await preview.locator('#sel-phase option').allTextContents(),['예선','결선']);
    await preview.locator('#sel-phase').selectOption('예선');assert.ok(await preview.locator('#admin-preview-unit option').count()>1,'prelim remains available only to authorized private preview');
    for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});const layout=await inspectPage(page);assert.equal(layout.pageOverflow,false);assert.deepEqual(layout.overflow,[]);}
    await page.locator('#admin-config-card-KCR').screenshot({path:'tmp/stage316-qa/release-control.png'});
    assert.deepEqual(page.qaErrors,[]);assert.deepEqual(preview.qaErrors,[]);await preview.close();await page.close();assert.equal(snapshot(api),before);
  }finally{await qa.close();api.close();}
});
