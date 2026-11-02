import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage277-qa',{recursive:true});
const codes=['KBC','MOC','MOB','KTCC','IKRC','KCAC','KCR'];
const snapshot=()=>JSON.stringify(['participants','operators','scores','competitions'].map(t=>api.db.prepare('SELECT * FROM '+t).all()));
try{
 for(const code of codes){
  await api.rpc('updateCompetitionAdminSettings',{code,currentRound:'결선'},api.actor);
  for(let i=1;i<=4;i++)assert.equal((await api.rpc('upsertParticipant',{competitionCode:code,name:code+' 선수 '+i,teamName:code+' 팀 '+i,affiliation:'보존 소속',phone:'0107777000'+i,uniqueNo:String(i),prelimCupNo:String(i),mainCupNo:['KBC','MOC'].includes(code)&&[2,3].includes(i)?String(i===2?20:10):'',finalCupNo:i===2?'90':i===4?'3':'',competitionDate:'2026-08-06',extra:{roundSchedules:{본선:{day:i===2?'1':'2',date:'2026-11-12'},결선:{date:i===4?'':'2026-11-14'}}}},api.actor)).success,true);
 }
 const before=snapshot(),page=await qa.page(390,1000);await page.goto(qa.origin+'/registry/');
 await page.evaluate(a=>{actor=a;document.getElementById('loginCard').classList.add('hidden');document.getElementById('main').classList.remove('hidden');loadRegistry();},api.actor);
 const rows=()=>page.locator('#partTable [data-edit-part]');
 for(const code of codes){
  await page.locator('#comp').selectOption(code);await page.waitForFunction(c=>participantRows.length===4&&participantRows[0].competitionCode===c,code);
  await page.locator('#participantSortMode').selectOption('number-asc');
  assert.equal(await page.locator('[data-roster-phase=prelim]').getAttribute('aria-selected'),'true',code+' consistently opens the preliminary roster regardless of active competition round');
  assert.equal(await rows().count(),4);assert.deepEqual(await page.locator('#partTable td.cell-number').allTextContents(),['1','2','3','4']);
  await page.locator('#participantSelectAll').check();await page.locator('[data-roster-phase=finals]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#partTable input:checked').length===0);
  if(['MOC','KBC'].includes(code)){
   assert.equal(await rows().count(),2);assert.deepEqual(await page.locator('#partTable td.cell-number').allTextContents(),['10','20']);
   if(code==='KBC'){await page.locator('#kbc-roster-day1').click();assert.equal(await rows().count(),1);assert.match(await page.locator('#partTable').innerText(),/선수 2/);await page.locator('#kbc-roster-day2').click();assert.match(await page.locator('#partTable').innerText(),/선수 3/);}
   await page.locator('[data-roster-round="결선"]').click();
  }else assert.equal(await page.locator('.registry-round-tabs').isVisible(),false);
  assert.equal(await rows().count(),2);assert.deepEqual(await page.locator('#partTable td.cell-number').allTextContents(),['3','90']);
  assert.doesNotMatch(await page.locator('#partTable').innerText(),/2026-08-06/,'final schedules must not show the preliminary date');
  await page.locator('[data-roster-phase=all]').click();assert.equal(await rows().count(),4);assert.match(await page.locator('#partTable').innerText(),/결선 90/);
  assert.equal((await inspectPage(page)).pageOverflow,false);
 }
 assert.equal(snapshot(),before,'viewing and switching every competition/round must not write any database records');
 await page.locator('#comp').selectOption('MOB');await page.waitForFunction(()=>participantRows[0]?.competitionCode==='MOB');await page.locator('[data-roster-phase=finals]').click();
 await page.locator('#partTable [data-schedule-part]').first().check();await page.locator('#registry-tools-participants [data-registry-action=edit]').click();
 assert.equal(await page.locator('#registry-bulk-dialog [data-registry-field=date]').inputValue(),'','an unscheduled final must not inherit the preliminary date');
 await page.getByRole('combobox',{name:'공통 수정 항목',exact:true}).selectOption('date');await page.getByLabel('공통 입력값',{exact:true}).fill('2026-11-15');await page.locator('#registry-bulk-preview').click();await page.waitForFunction(()=>!document.getElementById('registry-bulk-apply').disabled);await page.locator('#registry-bulk-apply').click();await page.waitForFunction(()=>!document.getElementById('registry-bulk-dialog').open);
 const player=api.db.prepare("SELECT * FROM participants WHERE competition_code='MOB' AND final_cup_no='3'").get();const listed=(await api.rpc('listParticipants','MOB',api.actor)).participants.find(p=>Number(p.rowIndex)===player.id);assert.equal(listed.competitionDate,'2026-08-06');assert.equal(JSON.parse(player.extra_json).roundSchedules.결선.date,'2026-11-15');assert.equal(player.prelim_cup_no,'4');
 await page.locator('[data-roster-phase=all]').click();await page.locator('#participantSelectAll').check();await page.locator('#registry-tools-participants [data-registry-action=edit]').click();assert.deepEqual(await page.locator('#registry-bulk-dialog [data-registry-row]').first().locator('[data-registry-field]').evaluateAll(ns=>ns.map(n=>n.dataset.registryField)),['name','affiliation','phone']);await page.getByRole('button',{name:'닫기',exact:true}).click();
 for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));const state=await inspectPage(page);await page.screenshot({path:'tmp/stage277-qa/registry-'+width+'.png',fullPage:true});assert.equal(state.pageOverflow,false);assert.deepEqual(state.overflow,[],width+'px '+JSON.stringify(await page.locator('#partTable button').evaluateAll(ns=>ns.map(n=>({text:n.innerText,x:Math.round(n.getBoundingClientRect().x)})))));}
 await page.locator('[data-roster-phase=prelim]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-roster-phase=finals]').getAttribute('aria-selected'),'true');
 const appearance=await page.evaluate(()=>({background:getComputedStyle(document.body).backgroundColor,button:getComputedStyle(document.querySelector('.registry-create')).backgroundColor}));assert.equal(appearance.background,'rgb(245, 245, 247)');assert.equal(appearance.button,'rgb(0, 113, 227)');
 assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
 console.log('Stage277: seven competitions share preliminary/final/all tabs; KBC days and main/final remain separate; numbers, dates, selection and batch edit round are isolated; read-only views preserve data; light/blue layout and 360–1440px responsive checks passed.');
}finally{await qa.close();api.close();}
