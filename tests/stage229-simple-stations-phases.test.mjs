import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAllDebriefFixture} from './helpers/all-debrief-fixture.mjs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';

// Real API, disposable databases: no production mutations, SMS or external traffic.
const debrief=await createAllDebriefFixture();
try{
  const before=JSON.stringify(debrief.db.prepare('SELECT * FROM scores ORDER BY id').all());
  for(const c of debrief.cases){
    debrief.db.prepare('UPDATE competitions SET debriefing=1 WHERE code=?').run(c.code);
    async function view(phase,name=c.name,phone=c.phone){
      debrief.db.prepare('INSERT INTO otps(competition_code,name,phone,otp,expires_at) VALUES(?,?,?,?,?)').run(c.code,name,phone,'229229','2099-01-01T00:00:00Z');
      return (await debrief.handle({action:'verifyOTP',args:[name,phone,c.code,'229229',phase]})).json();
    }
    for(const phase of ['예선','결선']){
      const result=await view(phase);assert.equal(result.success,true,c.code+': '+result.message);
      assert.equal(result.requestedPhase,phase);assert.ok(result.scores.length>0);
      const matches=r=>phase==='예선'?r==='예선':['본선','결선'].includes(r);
      assert.ok(result.scores.every(s=>matches(s['라운드']||s.round)),c.code+' score phase isolation');
      assert.ok(result.rankInfos.every(r=>matches(r.round)),c.code+' rank phase isolation');
      assert.doesNotMatch(JSON.stringify(result),/OTHER_PRIVATE_BATCH_COMMENT/);
      for(const round of c.rounds.filter(matches)){
        const index=c.rounds.indexOf(round);
        const preview=await debrief.rpc('getAdminDebriefPreview',c.code,c.units[index],round,debrief.actor);
        assert.deepEqual(result.scores.filter(s=>(s['라운드']||s.round)===round),preview.scores,c.code+' exact-round public/preview parity');
      }
    }
    const invalid=await view('전체');assert.equal(invalid.success,false);
    assert.equal(debrief.db.prepare('SELECT used_at FROM otps WHERE competition_code=? ORDER BY id DESC LIMIT 1').get(c.code).used_at,null,'invalid phase must not consume OTP');
    // A real preliminary score exists, but this player has no final assignment.
    const empty=await view('결선','QA 다른 선수',c.phone+'1');
    assert.equal(empty.success,true);assert.deepEqual(empty.scores,[]);assert.deepEqual(empty.rankInfos,[]);
  }
  assert.equal(JSON.stringify(debrief.db.prepare('SELECT * FROM scores ORDER BY id').all()),before);
  console.log('Stage229: all seven public debrief phases, exact preview parity, empty finals and stored records passed.');
}finally{debrief.close();}

const api=await createRpcFixture({source:fs.readFileSync('functions/api/rpc.js','utf8')+'\n// isolated station QA module'});const qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage229-qa',{recursive:true});
const stations=[
  {id:'stable-a',prefix:'A',start:1,end:9,process:'Blending',prelimDay:1,useForCalibration:false,useForCompetition:true},
  {id:'stable-b',prefix:'B',start:10,end:18,process:'Blending',prelimDay:2,useForCalibration:false,useForCompetition:true},
  {id:'stable-cal',prefix:'C',start:1,end:3,process:'Blending',useForCalibration:true,useForCompetition:false}
];
async function seed(){
  for(const code of ['KCR','IKRC']){
    const key=code==='KCR'?'kcrStations':'ikrcStations';
    await api.rpc('updateCompetitionAdminSettings',{code,currentRound:'예선',isActive:true,debriefing:false,optionSettings:{kcrProcesses:{blending:true},[key]:{stations,byRound:{예선:stations,결선:[{...stations[0],id:'final-only',end:5}]}}}},api.actor);
  }
}
try{
  for(const width of [360,768,1440]){
    await seed();const page=await qa.page(width);
    await page.goto(qa.origin+'/assessment/');
    await page.evaluate(actor=>{_judge=actor;_adminPreferredSection='run';loadAdminPanel();},api.actor);
    await page.waitForSelector('#admin-comp-list [data-act=station-settings]');
    const card=page.locator('#admin-comp-list .admin-comp-card').filter({has:page.locator('[data-act=kcr-cal-station]')});
    assert.deepEqual(await card.locator('.station-workflow-actions button').evaluateAll(els=>els.map(el=>el.dataset.act)),['kcr-cal-station','kcr-cal-result','eval','review']);
    assert.equal(await card.locator('[data-act=score-backup]').isVisible(),false);
    await card.locator('.station-tools summary').click();
    assert.equal(await card.locator('[data-act=score-backup]').isVisible(),true);
    assert.equal(await card.locator('[data-act=judge-qr]').evaluate(el=>typeof el.onclick),'function','moved controls retain handlers');
    await card.locator('[data-act=station-settings]').click();
    const panel=page.locator('#admin-config-card-KCR');
    await panel.waitFor({state:'visible'});
    const list=panel.locator('.ikrc-station-config-list');
    const first=list.locator('[data-station-id=stable-a]');
    assert.equal(await list.locator('details[open]').count(),0);
    assert.match(await first.locator('[data-station-summary]').innerText(),/1 ~ 9 · 9명/);
    await first.locator('summary').focus();await page.keyboard.press('Enter');
    await first.locator('[data-field=end]').fill('8');
    assert.match(await first.locator('[data-station-summary]').innerText(),/1 ~ 8 · 8명/);
    assert.match(await panel.locator('[data-station-edit-status]').innerText(),/변경사항/);
    assert.ok(await first.locator('[data-field=end]').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
    // Changing rounds must never silently discard typed station settings.
    page.removeAllListeners('dialog');page.once('dialog',d=>d.dismiss());
    await panel.locator('#admin-cfg-round-KCR').selectOption('결선');
    assert.equal(await panel.locator('#admin-cfg-round-KCR').inputValue(),'예선');
    assert.equal(await first.locator('[data-field=end]').inputValue(),'8');
    page.on('dialog',d=>d.accept());
    await list.locator('[data-station-id=stable-b] summary').click();
    await page.waitForFunction(()=>document.querySelectorAll('#admin-cfg-ikrc-stations-KCR details[open]').length===1);
    assert.equal(await first.evaluate(el=>el.open),false);
    await panel.locator('[data-kcr-day-filter]').selectOption('1');
    assert.equal(await list.locator('[data-ikrc-station-row]:visible').count(),1);
    const savedResponse=page.waitForResponse(r=>r.request().postDataJSON()?.action==='updateCompetitionAdminSettings');
    await panel.locator('[data-save=KCR]').click();assert.equal((await(await savedResponse).json()).success,true);
    await page.waitForFunction(()=>_configs.find(c=>c.code==='KCR').optionSettings.kcrStations.stations[0].end===8);
    const saved=JSON.parse(api.db.prepare("SELECT option_settings FROM competitions WHERE code='KCR'").get().option_settings).kcrStations;
    assert.equal(saved.byRound.예선.length,3,'filtered-out station rows must also be saved');
    assert.deepEqual(saved.byRound.예선.map(s=>s.id),stations.map(s=>s.id));
    assert.equal(saved.byRound.결선[0].end,5);
    await panel.locator('.ikrc-station-add').click();
    const added=list.locator('[data-ikrc-station-row]').last();
    assert.equal(await added.evaluate(el=>el.open),true);assert.equal(await added.locator('[data-field=end]').inputValue(),'27');
    await added.locator('.ikrc-station-remove').click();assert.equal(await list.locator('[data-ikrc-station-row]').count(),3);
    await panel.locator('#admin-cfg-round-KCR').selectOption('결선');
    assert.equal(await list.locator('[data-station-id=final-only]').count(),1);
    assert.equal(await panel.locator('[data-station-edit-status]').innerText(),'');
    await list.locator('summary').click();
    assert.equal(await list.locator('[data-field=end]').inputValue(),'5');
    const layout=await inspectPage(page);assert.equal(layout.pageOverflow,false);assert.deepEqual(layout.overflow,[]);
    await page.screenshot({path:`tmp/stage229-qa/kcr-${width}.png`});
    // IKRC uses the same compact controls, not KCR's participant-number model.
    await page.locator('#admin-config-card-IKRC details.station-editor').first().locator('summary').click();
    const ikrc=page.locator('#admin-config-card-IKRC details.station-editor').first();
    await ikrc.locator('[data-field=prefix]').fill('Z');
    assert.match(await ikrc.locator('[data-station-summary]').innerText(),/Z-1 ~ Z-9/);
    const tags=await page.evaluate(()=>({qual:KCAC_SMART_TAGS.qual,final:KCAC_SMART_TAGS.finalPattern}));
    assert.match(JSON.stringify(tags.qual),/리프 형태 식별 가능/);
    assert.doesNotMatch(JSON.stringify(tags.final),/리프|중심줄기/);
    for(const tag of ['언더필','기포 없음','광택 유지','크레마 경계 번짐','라인 번짐','크레마 얼룩 없음'])assert.ok(JSON.stringify(tags.final).includes(tag),tag+' carried into appropriate final attribute');
    assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);await page.close();
    console.log('Stage229 station keyboard/mobile edit, dirty guard, save, add/delete, day/round/competition isolation passed at '+width+'px.');
  }
}finally{await qa.close();api.close();}
