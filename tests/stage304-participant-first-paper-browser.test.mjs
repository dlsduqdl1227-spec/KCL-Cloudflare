import assert from 'node:assert/strict';
import {createPaperEntryFixture} from './helpers/paper-entry-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
const api=await createPaperEntryFixture(),qa=await createBrowserFixture({apiHandler:api.handle,pagesHeaders:true});
async function open(page,code){
 await page.goto(qa.origin+'/assessment/');
 await page.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;saveAssessmentSession_();loadTeamPanel();},{actor:api.leads[code],configs:(await api.rpc('getConfig')).configs});
 await page.locator('#team-comp-list [data-act=paper-entry]').click();await page.locator('#paper-roster input').first().waitFor();
}
async function begin(page,code,unit){
 await page.waitForFunction(unit=>_paperWorkspace.participants.some(p=>p.unit===unit),unit);
 const key=await page.evaluate(unit=>_paperWorkspace.participants.find(p=>p.unit===unit).key,unit);
 await page.locator('#paper-participant').selectOption(key);
 for(const judge of api.targets[code])await page.locator('#paper-roster input[value="'+judge.id+'"]').check();
 await page.locator('#paper-confirm').check();
 const old=await page.evaluate(()=>_paperWorkspace.entries[0]?.token);
 await page.locator('#paper-start').click();
 await page.waitForFunction(old=>_paperWorkspace.entries[0]?.token!==old&&_paperWorkspace.frames[0]?.contentWindow._paperEntryFrameContext,old);
 return page.frames().find(f=>f!==page.mainFrame()&&f.url().includes('paperEntry=1'));
}
try{
 for(const code of ['KBC','KCR','IKRC']){
  await api.rpc('upsertParticipant',{competitionCode:code,name:code+' 두 번째 선수',affiliation:'두 번째 소속',uniqueNo:'2',prelimCupNo:'2',mainCupNo:'2',finalCupNo:'2',extra:code==='IKRC'?{ikrcBlindAssignments:{예선:'A-2',결선:'A-2'}}:{}},api.actor);
  if(code!=='KBC'){
   const cfg=api.db.prepare('SELECT * FROM competitions WHERE code=?').get(code),options=JSON.parse(cfg.option_settings),field=code==='KCR'?'kcrStations':'ikrcStations';
   for(const stations of Object.values(options[field].byRound))stations[0].end=2;options[field].stations[0].end=2;
   await api.rpc('updateCompetitionAdminSettings',{code,optionSettings:options},api.actor);
  }
 }
 const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
 const page=await qa.page(390,900);await open(page,'KBC');
 assert.equal(await page.locator('#paper-roster input').first().isDisabled(),true,'judges cannot be selected before the player');
 let first=await begin(page,'KBC','1');await first.waitForFunction(()=>document.getElementById('kbc-num').value==='1');
 assert.equal(await first.locator('#kbc-participant-select').isDisabled(),true);assert.equal(await first.locator('#kbc-num').getAttribute('readonly'),'');
 await first.locator('#kbc-comment').fill('선수1 심사위원1 초안');const firstScope=await first.evaluate(()=>_paperEntryFrameContext.draftScope);
 await page.locator('#paper-judge-tabs button').nth(1).click();
 await page.waitForFunction(()=>_paperWorkspace.frames[1]?.contentWindow._paperEntryFrameContext);
 let second=page.frames().find(f=>f!==page.mainFrame()&&f!==first&&f.url().includes('paperEntry=1'));
 await second.waitForFunction(()=>document.getElementById('kbc-num').value==='1');await second.locator('#kbc-comment').fill('선수1 심사위원2 초안');
 // Simulate the short draft-restore window and immediately switch athletes.
 await second.evaluate(()=>{_kclDraftApplying=true;setTimeout(()=>{_kclDraftApplying=false;},250);});
 await page.locator('#paper-reselect').click();first=await begin(page,'KBC','2');await first.waitForFunction(()=>document.getElementById('kbc-num').value==='2');
 assert.equal(await first.locator('#kbc-comment').inputValue(),'');assert.notEqual(await first.evaluate(()=>_paperEntryFrameContext.draftScope),firstScope);
 assert.match(await page.locator('#paper-player-summary').innerText(),/두 번째 선수/);
 await first.locator('#kbc-comment').fill('선수2 심사위원1 초안');
 await page.locator('#paper-reselect').click();first=await begin(page,'KBC','1');
 await first.waitForFunction(()=>document.getElementById('kbc-comment').value==='선수1 심사위원1 초안');
 await page.locator('#paper-judge-tabs button').nth(1).click();
 await page.waitForFunction(()=>_paperWorkspace.frames[1]?.contentWindow._paperEntryFrameContext);
 second=page.frames().find(f=>f!==page.mainFrame()&&f!==first&&f.url().includes('paperEntry=1'));
 await second.waitForFunction(()=>document.getElementById('kbc-comment').value==='선수1 심사위원2 초안');
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before,'selecting athletes and restoring drafts never submits or deletes scores');
 assert.equal((await inspectPage(page)).pageOverflow,false);assert.deepEqual(page.qaErrors,[]);await page.close();
 for(const code of ['KCR','IKRC']){
  const page=await qa.page(390,900);await open(page,code);const frame=await begin(page,code,code==='KCR'?'2':'A-2');
  await frame.locator(code==='KCR'?'#evalCupping.active':'#evalIkrc.active').waitFor();
  assert.deepEqual(await frame.evaluate(code=>code==='KCR'?_cupping.cups.map(c=>String(c.cupNumber)):_ikrcSamples.map(c=>c.no),code),[code==='KCR'?'2':'A-2']);
  assert.equal((await inspectPage(frame)).pageOverflow,false);assert.deepEqual(page.qaErrors,[]);await page.close();
 }
 // A late previous-round response cannot replace the current target list.
 const race=await qa.page();await open(race,'KBC');let release,arrived;
 const held=new Promise(resolve=>{release=resolve;}),seen=new Promise(resolve=>{arrived=resolve;});
 await race.route('**/api/rpc*',async route=>{
  const body=route.request().postDataJSON();
  if(body.action==='getPaperEntryParticipants'&&body.args[0].round==='예선'){const response=await route.fetch();arrived();await held;await route.fulfill({response});}else await route.continue();
 });
 await race.locator('#paper-round').selectOption('예선');await seen;
 await race.locator('#paper-round').selectOption('결선');await race.waitForFunction(()=>_paperWorkspace.participants.length===2);
 const keys=await race.locator('#paper-participant option').evaluateAll(options=>options.map(o=>o.value));release();
 await race.waitForResponse(r=>r.request().postDataJSON()?.action==='getPaperEntryParticipants'&&r.request().postDataJSON().args[0].round==='예선');
 assert.deepEqual(await race.locator('#paper-participant option').evaluateAll(options=>options.map(o=>o.value)),keys);
 assert.deepEqual(race.qaErrors,[]);await race.close();
 console.log('Stage304 UI: player-first gating, automatic shared selection and locked fields, multi-judge/multi-player draft isolation, safe rapid switching, single selected KCR/IKRC cups and stale-round response rejection passed.');
}finally{await qa.close();api.close();}
