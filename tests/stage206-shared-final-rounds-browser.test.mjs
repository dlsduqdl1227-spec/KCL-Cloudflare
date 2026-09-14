import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';

const api=await createRpcFixture();const qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/rounds-qa',{recursive:true});
try{
  for(const width of [360,768,1440]){
    const page=await qa.page(width);
    await page.goto(qa.origin+'/assessment/');
    await page.evaluate(actor=>{_judge=actor;loadAdminPanel();},api.actor);
    await page.waitForSelector('#admin-cfg-round-KBC-group',{state:'attached'});
    await page.evaluate(()=>adminSwitchSection('config'));
    for(const code of ['KBC','MOC']){
      const id='#admin-cfg-round-'+code;
      assert.deepEqual(await page.locator(id+'-group option').allTextContents(),['예선','본·결선']);
      await page.locator(id+'-group').selectOption('본·결선');
      await page.locator(id+'-stage').selectOption('결선');
      assert.equal(await page.locator(id).inputValue(),'결선');
      await page.locator(id+'-group').selectOption('예선');
      assert.equal(await page.locator(id+'-stage').isVisible(),false);
      assert.equal(await page.locator(id).inputValue(),'예선');
      await page.locator(id+'-group').selectOption('본·결선');
      assert.equal(await page.locator(id+'-stage').inputValue(),'결선','reselecting a shared sheet preserves the chosen stage');
      const response=page.waitForResponse(r=>r.url().includes('/api/rpc')&&r.request().postDataJSON()?.action==='updateCompetitionAdminSettings');
      const refreshed=page.waitForResponse(r=>r.url().includes('/api/rpc')&&r.request().postDataJSON()?.action==='getAdminConsoleData');
      await page.locator('#admin-config-card-'+code+' [data-save]').click();
      assert.equal((await (await response).json()).success,true);
      await (await refreshed).finished();
      await page.waitForFunction(({code})=>document.getElementById('admin-cfg-round-'+code+'-group')?.value==='본·결선'&&document.getElementById('admin-cfg-round-'+code)?.value==='결선',{code});
      assert.equal(api.db.prepare('SELECT current_round FROM competitions WHERE code=?').get(code).current_round,'결선');
    }
    for(const code of ['MOB','KCAC','IKRC','KCR','KTCC']){
      assert.equal(await page.locator('#admin-cfg-round-'+code+'-group').count(),0);
      assert.deepEqual(await page.locator('#admin-cfg-round-'+code+' option').allTextContents(),['예선','결선']);
    }
    await page.locator('#admin-config-card-KBC').scrollIntoViewIfNeeded();
    await page.screenshot({path:'tmp/rounds-qa/admin-'+width+'.png'});
    assert.equal((await inspectPage(page)).pageOverflow,false);
    // Reuse the real API with a team-lead-shaped UI actor; auth remains local-only.
    await page.evaluate(actor=>{_judge={judgeToken:actor.judgeToken,name:'QA 팀장',phone:actor.phone,type:'TEAMLEAD',accountType:'TEAMLEAD',role:'대회팀장',access:'KBC,MOC',accountTypeMap:{KBC:'TEAMLEAD',MOC:'TEAMLEAD'},roleMap:{KBC:'대회팀장',MOC:'대회팀장'}};loadTeamPanel();},api.actor);
    await page.waitForSelector('#team-cfg-round-KBC-group');
    assert.equal(await page.locator('#team-cfg-round-KBC-group').inputValue(),'본·결선');
    await page.locator('#team-cfg-round-KBC-stage').selectOption('본선');
    const saved=page.waitForResponse(r=>r.url().includes('/api/rpc')&&r.request().postDataJSON()?.action==='updateCompetitionAdminSettings');
    await page.locator('.admin-comp-card').filter({has:page.locator('#team-cfg-round-KBC')}).locator('[data-act=save-cfg]').click();
    assert.equal((await (await saved).json()).success,true);
    await page.waitForFunction(()=>document.getElementById('team-cfg-round-KBC')?.value==='본선');
    assert.equal(api.db.prepare('SELECT current_round FROM competitions WHERE code=?').get('KBC').current_round,'본선');
    await page.screenshot({path:'tmp/rounds-qa/team-'+width+'.png'});
    assert.equal((await inspectPage(page)).pageOverflow,false);
    // Same scoring form in both stages; only storage/draft identities differ.
    await page.evaluate(actor=>{_judge=actor;refreshParticipantAssignmentsForActiveComp_=()=>{};},api.actor);
    const kbc=[];const moc=[];
    for(const round of ['본선','결선']){
      kbc.push(await page.evaluate(round=>{hideOverlay();_selComp={code:'KBC',currentRound:round};startKbc();const attrs=KBC_SERVICE.concat(KBC_ESPRESSO,KBC_SIGNATURE_SENSORY,KBC_MACHINE);attrs.forEach(a=>document.getElementById(a.id).value='5');calcKbcTotal();return {attrs:attrs.map(a=>[a.id,a.weight||1]),total:document.getElementById('kbc-total').textContent,key:kclDraftKey_('KBC')};},round));
      moc.push(await page.evaluate(round=>{_selComp={code:'MOC',currentRound:round};initMocTargets([1]);return {cups:[_moc.s1Cups.length,_moc.s2Cups.length],limit:mocTimeLimitMs_(),key:kclDraftKey_('MOC')};},round));
    }
    assert.deepEqual(kbc[0].attrs,kbc[1].attrs);assert.equal(Number(kbc[0].total),60);assert.equal(Number(kbc[1].total),60);assert.notEqual(kbc[0].key,kbc[1].key);
    assert.deepEqual(moc[0].cups,[6,6]);assert.deepEqual(moc[1].cups,[6,6]);assert.equal(moc[0].limit,360000);assert.equal(moc[1].limit,360000);assert.notEqual(moc[0].key,moc[1].key);
    assert.deepEqual(page.qaErrors,[]);await page.close({runBeforeUnload:false});
    console.log('Stage206 shared final admin/team UI, canonical saves and score-sheet parity passed at '+width+'px.');
  }
}finally{await qa.close();api.close();}
