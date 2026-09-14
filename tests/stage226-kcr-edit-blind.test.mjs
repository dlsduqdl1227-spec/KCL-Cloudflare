import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {seedKcrStations,stationSubmission} from './helpers/kcr-station-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
fs.mkdirSync('tmp/stage226-qa',{recursive:true});
try{
 const {stations,judges}=await seedKcrStations(api);
 api.db.prepare("UPDATE participants SET name='블라인드실명검증',affiliation='블라인드소속검증' WHERE competition_code='KCR' AND unique_no='1'").run();
 for(const judge of judges){
  const payload=stationSubmission(judge,stations[1],21);
  payload.participantName='블라인드실명검증';payload.extraFields={선수명:'블라인드실명검증',소속:'블라인드소속검증'};
  payload.rows.forEach(row=>Object.assign(row.extraFields,{선수명:'블라인드실명검증',소속:'블라인드소속검증'}));
  await api.rpc('submitScores',payload);
  const list=await api.rpc('getReviewList','KCR',judge);
  assert.doesNotMatch(JSON.stringify(list),/블라인드실명검증|블라인드소속검증/,'head and sensory responses contain no entrant identity');
  const row=list.list.find(r=>r.unit==='1');
  for(const score of [3.4,3.8])await api.rpc('updateReviewRow','KCR',row.rowIndex,{[list.headers.indexOf('Flavor(플레이버)')]:score,[list.headers.indexOf('종합코멘트')]:'제출 후 재수정 '+score},'수정완료',judge.role,judge);
  const updated=await api.rpc('getReviewList','KCR',judge);
  assert.equal(updated.list.find(r=>r.unit==='1')['Flavor(플레이버)'],3.8);
  assert.match(JSON.stringify(updated),/제출 후 재수정 3.8/);
  assert.equal(api.db.prepare('SELECT COUNT(*) n FROM scores WHERE judge_name=?').get(judge.name).n,2,'editing updates original rows, never inserts a duplicate');
  const assignment=await api.rpc('getParticipantAssignments','KCR',judge);assert.doesNotMatch(JSON.stringify(assignment),/블라인드실명검증|블라인드소속검증/);
  assert.deepEqual((await api.rpc('getKcrStationEvaluationState',judge)).completion.participants,[]);
 }
 const admin=await api.rpc('getReviewList','KCR',{...api.actor,reviewScope:'manage'});assert.match(JSON.stringify(admin),/블라인드실명검증/);
 const before=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
 const config=(await api.rpc('getConfig')).configs;
 for(const width of [390,1440]){
  const page=await qa.page(width);await page.goto(qa.origin+'/assessment/');
  const enter=async actor=>{
   await page.evaluate(({actor,config})=>{hideEval();_judge=actor;_configs=config;_selComp=config.find(c=>c.code==='KCR');setEvaluationPurpose_('competition');showCuppingSetup();},{actor,config});
   await page.waitForFunction(()=>_kcrCompletionState?.ownerToken===_judge.judgeToken);
  };
  await enter(api.actor);assert.match(await page.locator('#kcr-station-grid').innerText(),/블라인드실명검증/);
  await page.waitForFunction(()=>registeredTargetsForRange_('KCR',['1','2']).validated);
  await page.locator('#kcr-station-grid [data-station-id="stable-b"]').click();
  assert.match(await page.locator('#cupping-cup-nav').innerText(),/블라인드실명검증/);
  assert.equal((await inspectPage(page)).pageOverflow,false);
  await page.locator('#cupping-cup-nav').screenshot({path:`tmp/stage226-qa/admin-cups-${width}.png`});
  await page.evaluate(()=>{hideEval();goReviewByCode('KCR','KCR','pAdmin');});
  // Admin own review has no rows, so open the explicit manager scope used by the admin card.
  await page.evaluate(()=>adminOpenReview_(_selComp));
  await page.locator('#kcr-review-unit').waitFor();assert.match(await page.locator('#kcr-review-unit').innerText(),/블라인드실명검증/);
  for(const judge of judges){await enter(judge);assert.doesNotMatch(await page.locator('#kcr-station-grid').innerText(),/블라인드실명검증/);
   await page.locator('#kcr-station-help button').click();await page.locator('#kcr-review-unit').waitFor();
   assert.doesNotMatch(await page.locator('#review-list').innerText(),/블라인드실명검증|블라인드소속검증/);
   assert.equal(await page.evaluate(()=>canReviewEditDetails()),true);
   await page.locator('.review-edit-btn').first().click();await page.locator('#pReviewEdit.active').waitFor();
   assert.doesNotMatch(await page.locator('#pReviewEdit').innerText(),/블라인드실명검증|블라인드소속검증/);
   assert.equal(await page.locator('#review-edit-save-only').isVisible(),true);
   await page.evaluate(()=>backToReviewList());
   await page.waitForFunction(()=>!document.getElementById('overlay').classList.contains('active'));
  }
  assert.deepEqual(page.qaErrors,[]);await page.close();
 }
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),before,'viewing/redaction never changes saved evaluations');
 console.log('Stage226 repeated head/sensory edits, duplicate-free updates, nested blind identity, admin names and responsive UI passed.');
}finally{await qa.close();api.close();}
