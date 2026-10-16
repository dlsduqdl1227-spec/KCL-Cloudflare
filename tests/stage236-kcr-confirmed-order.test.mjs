import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrStations,stationSubmission} from './helpers/kcr-station-fixture.mjs';
import {buildKcrPrelimOrderPlan} from '../maintenance/kcr-prelim-order-plan.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage236-qa',{recursive:true});
try {
 const {stations,judges}=await seedKcrStations(api);
 await api.rpc('upsertParticipant',{competitionCode:'MOB',name:'다른 대회 선수',prelimCupNo:'1',phone:'01012340000'},api.actor);
 const before=api.db.prepare('SELECT * FROM participants ORDER BY id').all();
 const kcr=before.filter(p=>p.competition_code==='KCR');
 const chosen=[kcr[2],kcr[0],kcr[1]].map((row,i)=>({id:row.id,number:i+1,name:row.name}));
 const options={source:'QA confirmed source',timestamp:'2026-10-16T10:00:00Z'};
 const {plan,sql,statement,params}=buildKcrPrelimOrderPlan(before,chosen,options);
 assert.ok(Buffer.byteLength(statement)<100000,'D1 statement size limit; participant data uses bound JSON');
 assert.equal(plan.length,4);
 assert.throws(()=>buildKcrPrelimOrderPlan(before,[...chosen,chosen[0]],options),/중복|누락/);
 // A concurrent edit, new entrant, or evaluation makes the entire plan a no-op.
 api.db.prepare('UPDATE participants SET affiliation=? WHERE id=?').run('동시 수정',kcr[0].id);
 const changed=api.db.prepare('SELECT * FROM participants ORDER BY id').all();api.db.exec(sql);
 assert.deepEqual(api.db.prepare('SELECT * FROM participants ORDER BY id').all(),changed);
 api.db.prepare('UPDATE participants SET affiliation=? WHERE id=?').run(kcr[0].affiliation,kcr[0].id);
 api.db.prepare("INSERT INTO scores(competition_code,round,unit,payload_json,submitted_at) VALUES('KCR','예선','1','{}','2026-10-16')").run();
 api.db.exec(sql);assert.deepEqual(api.db.prepare('SELECT * FROM participants ORDER BY id').all(),before);
 api.db.exec("DELETE FROM scores WHERE competition_code='KCR'");
 api.db.prepare(statement).run(...params);
 const after=api.db.prepare('SELECT * FROM participants ORDER BY id').all();
 api.db.exec(sql);assert.deepEqual(api.db.prepare('SELECT * FROM participants ORDER BY id').all(),after,'stale retry does not overwrite');
 for(const old of before){
  const row=after.find(p=>p.id===old.id);
  if(old.competition_code!=='KCR'){assert.deepEqual(row,old);continue;}
  for(const key of ['id','name','affiliation','phone','main_cup_no','final_cup_no','created_at'])assert.equal(row[key],old[key]);
  assert.equal(JSON.parse(row.extra_json).custom,'보존');
 }
 const assignments=await api.rpc('getParticipantAssignments','KCR',api.actor);
 assert.deepEqual(assignments.assignments.map(p=>[p.number,p.name]),chosen.map(p=>[String(p.number),p.name]));
 assert.equal(assignments.policy.pendingPrelimAssignments,true);
 const blind=await api.rpc('getParticipantAssignments','KCR',judges[0]);
 assert.ok(blind.assignments.every(p=>!p.name&&!p.affiliation));
 const links=await api.rpc('getStationCupParticipants','KCR','예선',api.actor);
 assert.equal(links.stations[0].cups[0].participants[0].name,chosen[0].name);
 assert.equal(links.stations[1].cups[1].status,'unassigned');
 const pending=(await api.rpc('listParticipants','KCR',api.actor)).participants.find(p=>p.extra.kcrPrelimPending);
 assert.equal(pending.prelimCupNo,'');assert.equal(pending.displayNo,'');
 // Editing a pending contact does not silently restore a legacy number.
 await api.rpc('upsertParticipant',{...pending,affiliation:'대기 선수 소속 수정'},api.actor);
 assert.equal((await api.rpc('getParticipantAssignments','KCR',api.actor)).assignments.length,3);
 const withEmpty=[...stations,{id:'pending-section',label:'대기 스테이션',prefix:'P',start:5,end:6,process:'Blending',useForCompetition:true,useForCalibration:false}];
 await api.rpc('updateCompetitionAdminSettings',{code:'KCR',optionSettings:{kcrStations:{stations:withEmpty,byRound:{예선:withEmpty,결선:stations}}}},api.actor);
 const configs=(await api.rpc('getConfig')).configs;
 for(const width of [360,1440]){
  const page=await qa.page(width);await page.goto(qa.origin+'/registry/');
  await page.evaluate(a=>{actor=a;document.getElementById('loginCard').classList.add('hidden');document.getElementById('main').classList.remove('hidden');loadRegistry();},api.actor);
  await page.locator('#comp option[value=KCR]').waitFor({state:'attached'});await page.locator('#comp').selectOption('KCR');
  await page.waitForFunction(()=>document.getElementById('partTable').textContent.includes('예선 배정 대기'));
  const numbers=await page.locator('#partTable td.cell-number').allTextContents();
  assert.deepEqual(numbers,['1','2','3','예선 배정 대기']);
  assert.match(await page.locator('#partCount').innerText(),/예선 배정 3명 · 대기 1명/);
  await page.locator(`[data-edit-part="${pending.rowIndex}"]`).click();assert.equal(await page.locator('#mNo').inputValue(),'');
  assert.equal((await inspectPage(page)).pageOverflow,false);
  await page.screenshot({path:`tmp/stage236-qa/registry-${width}.png`});await page.close();
  const evalPage=await qa.page(width);await evalPage.goto(qa.origin+'/assessment/');
  await evalPage.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;_selComp=configs.find(c=>c.code==='KCR');setEvaluationPurpose_('competition');showCuppingSetup();},{actor:judges[0],configs});
  await evalPage.waitForFunction(()=>participantStateForCode_('KCR').policy?.pendingPrelimAssignments);
  assert.match(await evalPage.locator('[data-station-id="stable-c"]').innerText(),/0\/1/);
  assert.equal(await evalPage.locator('[data-station-id="pending-section"]').isDisabled(),true);
  assert.match(await evalPage.locator('[data-station-id="pending-section"]').innerText(),/예선 배정 대기/);
  await evalPage.locator('[data-station-id="stable-c"]').click();
  assert.deepEqual(await evalPage.evaluate(()=>_cupping.cups.map(c=>String(c.cupNumber))),['3']);
  assert.deepEqual(evalPage.qaErrors,[]);await evalPage.close();
 }
 const partial=stationSubmission(judges[0],stations[2],21);partial.rows=partial.rows.slice(0,1);
 assert.equal((await api.rpc('submitScores',partial)).inserted,1,'only assigned cups in the last section are required');
 const invalid=await(await api.handle({action:'submitScores',args:[stationSubmission(judges[1],stations[2],21)]})).json();
 assert.equal(invalid.success,false,'unassigned cups cannot be submitted by an old client');
 const scoresBefore=JSON.stringify(api.db.prepare('SELECT * FROM scores').all());
 // Reassign on the same row, with duplicate protection and stale aliases ignored.
 const duplicate=await(await api.handle({action:'upsertParticipant',args:[{...pending,uniqueNo:'1',prelimCupNo:'1'},api.actor]})).json();assert.equal(duplicate.success,false);
 await api.rpc('upsertParticipant',{...pending,uniqueNo:'4',prelimCupNo:'4',extra:{...pending.extra,'예선컵번호':'99','고유번호':'99'}},api.actor);
 const assignedAgain=(await api.rpc('getParticipantAssignments','KCR',api.actor)).assignments;
 assert.equal(assignedAgain.length,4);assert.equal(assignedAgain.at(-1).rowIndex,pending.rowIndex);assert.equal(assignedAgain.at(-1).number,'4');
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores').all()),scoresBefore);
 await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'결선'},api.actor);
 assert.equal((await api.rpc('getParticipantAssignments','KCR',api.actor)).assignments.length,4,'final assignments unchanged');
 assert.deepEqual(api.db.prepare("SELECT * FROM participants WHERE competition_code='MOB'").all(),before.filter(r=>r.competition_code==='MOB'));
 console.log('Stage236 confirmed ordering, pending preservation/reassignment, alias/duplicate guards, atomic import, blind links, partial section submission and mobile/desktop passed.');
} finally {await qa.close();api.close();}
