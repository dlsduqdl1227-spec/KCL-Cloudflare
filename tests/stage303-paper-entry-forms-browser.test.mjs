import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPaperEntryFixture} from './helpers/paper-entry-fixture.mjs';
import {roundsFor} from './helpers/round-ranking-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';

const api=await createPaperEntryFixture(),qa=await createBrowserFixture({apiHandler:api.handle,pagesHeaders:true});
fs.mkdirSync('tmp/stage303-qa',{recursive:true});
try{
 const kbc=api.db.prepare("SELECT * FROM participants WHERE competition_code='KBC'").get(),extra=JSON.parse(kbc.extra_json||'{}');
 extra.roundSchedules={...extra.roundSchedules,본선:{day:'1',order:1}};
 api.db.prepare('UPDATE participants SET extra_json=? WHERE id=?').run(JSON.stringify(extra),kbc.id);
 api.db.prepare('UPDATE operators SET role=? WHERE id=?').run('패턴디자인 헤드 심사위원',api.targets.KCAC[0].id);
 const original=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
 for(const code of api.codes)for(const round of roundsFor(code)){
  const page=await qa.page(390,900),failures=[];
  page.on('response',async response=>{if(response.url().endsWith('/api/rpc')){const result=await response.json();if(!result.success)failures.push({action:response.request().postDataJSON().action,message:result.message});}});
  await page.goto(qa.origin+'/assessment/');
  await page.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;loadTeamPanel();},{actor:api.leads[code],configs:(await api.rpc('getConfig')).configs});
  await page.locator('#team-comp-list [data-act=paper-entry]').click();await page.locator('#paper-roster input').first().waitFor();
  await page.locator('#paper-round').selectOption(round);await page.locator('#paper-participant').selectOption({index:1});await page.locator('#paper-roster input[value="'+api.targets[code][0].id+'"]').check();
  await page.locator('#paper-confirm').check();await page.locator('#paper-start').click();
  await page.waitForFunction(()=>_paperWorkspace.frames[0]?.contentWindow._paperEntryFrameContext);
  const frame=page.frames().find(f=>f!==page.mainFrame()&&f.url().includes('paperEntry=1'));
  assert.equal(await frame.evaluate(()=>_selComp.currentRound),round,code+' uses the requested phase, never the live phase');
  if(code==='KCR'){
   await frame.locator('#evalCupping.active').waitFor();assert.equal(await frame.evaluate(()=>_cupping.cups.length),1);
  }else if(code==='IKRC'){
   await frame.locator('#evalIkrc.active').waitFor();assert.equal(await frame.evaluate(()=>_ikrcSamples.length),1);
  }else if(code==='MOC'){
   await frame.locator('#evalMoc.active').waitFor();assert.equal(await frame.evaluate(()=>_moc.targets.length),1);assert.equal(await frame.locator('#moc-player-num').getAttribute('readonly'),'');assert.equal(await frame.locator('#moc-player-name').getAttribute('readonly'),'');
  }else if(code==='KTCC'){
   await frame.locator('#evalKtcc.active').waitFor();assert.equal(await frame.evaluate(()=>_ktcc.targets.length),1);if(round==='결선'){assert.equal(await frame.locator('#ktcc-match-stage').inputValue(),'8강');assert.equal(await frame.locator('#ktcc-match-stage').isDisabled(),true);}
  }else{
   await frame.locator('#eval'+({KBC:'Kbc',MOB:'Mob',KCAC:'Kcac'}[code])+'.active').waitFor();
   await frame.waitForFunction(code=>participantListForCode_(code).length>0,code);
   const selector={KBC:'#kbc-participant-select',MOB:'#mob-participant-select',KCAC:'#kcac-participant-select'}[code];
   await frame.waitForFunction(selector=>document.querySelector(selector).value==='0',selector);assert.equal(await frame.locator(selector).isDisabled(),true);
   if(code==='KCAC')assert.equal(await frame.locator('#kcac-attrs input[data-kcac-score]').count(),round==='예선'?5:6);
  }
  assert.equal((await inspectPage(page)).pageOverflow,false,code+' '+round+' manager workspace fits mobile');
  assert.equal((await inspectPage(frame)).pageOverflow,false,code+' '+round+' original scoring form fits mobile');
  assert.deepEqual(failures,[],code+' '+round+' original form RPC calls are allowed and successful');
  assert.deepEqual(page.qaErrors,[],code+' '+round+' has no console/page error');
  await page.screenshot({path:'tmp/stage303-qa/form-'+code+'-'+round+'.png'});await page.close();
 }
 // The other KCAC assigned heads must open their own sensory form, not pattern.
 for(const [i,role,type]of [[0,'일반우유 센서리 헤드 심사위원','sensory-regular'],[1,'오트 센서리 헤드 심사위원','sensory-oat']]){
  api.db.prepare('UPDATE operators SET role=? WHERE id=?').run(role,api.targets.KCAC[i].id);
  const page=await qa.page(390,900);await page.goto(qa.origin+'/assessment/');
  await page.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;loadTeamPanel();},{actor:api.leads.KCAC,configs:(await api.rpc('getConfig')).configs});
  await page.locator('#team-comp-list [data-act=paper-entry]').click();await page.locator('#paper-roster input').first().waitFor();
  await page.locator('#paper-round').selectOption('결선');await page.locator('#paper-participant').selectOption({index:1});await page.locator('#paper-roster input[value="'+api.targets.KCAC[i].id+'"]').check();
  await page.locator('#paper-confirm').check();await page.locator('#paper-start').click();
  await page.waitForFunction(()=>_paperWorkspace.frames[0]?.contentWindow._paperEntryFrameContext);
  const frame=page.frames().find(f=>f!==page.mainFrame()&&f.url().includes('paperEntry=1'));
  await frame.waitForFunction(()=>document.getElementById('kcac-num').value==='1');assert.equal(await frame.locator('#kcac-participant-select').isDisabled(),true);
  assert.deepEqual(await frame.evaluate(()=>_kcac.jars.map(j=>j.patternType)),[type]);assert.equal(await frame.locator('#kcac-attrs input[data-kcac-score]').count(),3);
  assert.deepEqual(page.qaErrors,[]);await page.close();
 }
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),original,'opening paper forms never changes scores');
 console.log('Stage303 original forms: seven competitions, every preliminary/main/final phase, KBC day, KCR/IKRC stations, MOC/KTCC staff-style entry, all KCAC areas and mobile layouts passed.');
}finally{await qa.close();api.close();}
