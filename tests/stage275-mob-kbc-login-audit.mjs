import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
const dir=process.argv[2];if(!dir)throw new Error('Pass private before/after snapshot folder');
const before=JSON.parse(fs.readFileSync(path.join(dir,'before.json'),'utf8')),after=JSON.parse(fs.readFileSync(path.join(dir,'after.json'),'utf8'));
const previous=await createRpcFixture(),api=await createRpcFixture({source:fs.readFileSync('functions/api/rpc.js','utf8')+'\n// Isolated after-snapshot schema cache.\n'});
for(const [fixture,data]of [[previous,before],[api,after]])for(const [table,rows]of [['operators',data.operators],['participants',data.participants],['competitions',data.config]])for(const row of rows){const keys=Object.keys(row);fixture.db.prepare(`INSERT OR REPLACE INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?')})`).run(...Object.values(row));}
const qa=await createBrowserFixture({apiHandler:api.handle});
try{
 const originalRows=after.operators.filter(o=>o.access==='MOB'&&o.account_type==='JUDGE');
 assert.equal(originalRows.length,12);
 const overlap=[];let restored=0,previouslyBlocked=0;
 for(const row of originalRows){
  const old=await(await previous.handle({action:'judgeLogin',args:[row.name,row.phone]})).json();
  if(!old.success){assert.equal(old.errorCode,'PERMISSION_DATE_INACTIVE');previouslyBlocked++;}
  else assert.ok(!old.access.split(',').includes('MOB'),'before the change, shared judges could only see their other competitions');
  const actor=await api.rpc('judgeLogin',row.name,row.phone);restored++;
  assert.ok(actor.access.split(',').includes('MOB'));assert.equal(actor.roleMap.MOB,row.role);assert.equal(actor.teamMap.MOB,row.team_group);
  const mob=await api.rpc('getParticipantAssignments','MOB',actor);assert.equal(mob.currentRound,'결선');assert.equal(mob.assignments.length,6,'each group has its own six finalists');
  const kbcRow=after.operators.find(o=>o.name===row.name&&o.phone===row.phone&&o.access==='KBC');
  if(kbcRow){assert.ok(actor.access.split(',').includes('KBC'));assert.equal(actor.roleMap.KBC,kbcRow.role);assert.equal(actor.teamMap.KBC||'','');const kbc=await api.rpc('getParticipantAssignments','KBC',actor);assert.equal(kbc.currentRound,'본선');assert.equal(kbc.assignments.length,20);assert.equal(kbc.assignments.filter(p=>p.operatingDay==='1').length,10);overlap.push(row);}
 }
 assert.equal(overlap.length,2);
 for(const row of after.operators.filter(o=>o.access==='KBC')){const actor=await api.rpc('judgeLogin',row.name,row.phone);assert.ok(actor.access.split(',').includes('KBC'));assert.equal(actor.roleMap.KBC,row.role);}
 fs.mkdirSync('tmp/stage275-qa',{recursive:true});
 for(const row of overlap){
  const page=await qa.page(390,850);await page.goto(qa.origin+'/assessment/');
  await page.locator('#inp-name').fill(row.name);await page.locator('#inp-phone').fill(row.phone);await page.locator('#judge-login-button').click();
  await page.waitForSelector('#pSelect.active');assert.equal(await page.locator('.comp-card').count(),2);
  for(const code of ['MOB','KBC','MOB']){const config=after.config.find(c=>c.code===code);await page.locator('.comp-card').filter({hasText:config.name}).click();const state=await page.evaluate(code=>({code:_selComp.code,role:roleTextForCode_(code),team:judgeTeamText(code)}),code);assert.equal(state.code,code);assert.equal(state.team,code==='MOB'?row.team_group:'');assert.equal(state.role,code==='MOB'?row.role:'센서리 심사위원');assert.match(await page.locator('#sel-sub').innerText(),new RegExp('선택 대회 · '+code));}
  assert.equal((await inspectPage(page)).pageOverflow,false);assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
  await page.screenshot({path:'tmp/stage275-qa/'+row.id+'-dual-competition.png'});
  await page.locator('#btn-eval').click();await page.locator('#evalMob').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelectorAll('#mob-participant-select option').length===7);
  await page.evaluate(()=>{hideEval();loadSelectPanel();});await page.waitForSelector('#pSelect.active');
  await page.locator('.comp-card').filter({hasText:after.config.find(c=>c.code==='KBC').name}).click();await page.locator('#btn-eval').click();await page.locator('#evalKbc').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelectorAll('#kbc-participant-select option').length===11);
  assert.notEqual(await page.evaluate(()=>kclDraftKey_('MOB')),await page.evaluate(()=>kclDraftKey_('KBC')),'drafts remain competition-specific');
  assert.deepEqual(page.qaErrors,[]);await page.close();
 }
 console.log(JSON.stringify({mobJudgesLoginPassed:restored,previouslyBlocked,sharedMobKbcJudgesPassed:overlap.map(r=>r.name),allKbcAccountsPassed:true,independentCompetitionCardsRolesTeamsAndParticipantLists:true,productionWritesInTests:false}));
}finally{await qa.close();previous.close();api.close();}
