import assert from 'node:assert/strict';
import test from 'node:test';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage,selectOperationsCompetition} from './helpers/browser-fixture.mjs';
import {seedRoundRankings,competitionCodes,roundsFor} from './helpers/round-ranking-fixture.mjs';
import {seedIkrcFinal,ikrcFinalSubmission} from './helpers/ikrc-final-fixture.mjs';

const token=actor=>({judgeToken:actor.judgeToken});
const raw=(api,action,...args)=>api.handle({action,args}).then(r=>r.json());
const snapshot=api=>JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());

test('administrators can inspect all rounds and directly edit and delete existing official records',async()=>{
 const api=await createRpcFixture();
 try{
  await seedRoundRankings(api);
  const admin=token(api.actor);
  await api.rpc('upsertOperatorAccount',{name:'결선 팀장 QA',phone:'01088002861',accountType:'TEAMLEAD',role:'대회팀장',access:'MOB'},api.actor);
  const lead=await api.rpc('judgeLogin','결선 팀장 QA','01088002861');
  const config=JSON.stringify(await api.rpc('getConfig'));
  for(const code of competitionCodes){
   for(const round of roundsFor(code)){
    const list=await api.rpc('getReviewList',code,{...admin,round});
    assert.equal(list.ownOnly,false);
    assert.ok(list.list.length&&list.list.every(row=>row.round===round),code+' '+round);
   }
   const list=()=>api.rpc('getReviewList',code,{...admin,round:'결선'});
   const before=(await list()).list[0],id=Number(String(before.rowIndex).split(':')[0]);
   const original=api.db.prepare('SELECT * FROM scores WHERE id=?').get(id);
   const commentIndex=(await list()).headers.indexOf('종합코멘트');
   assert.ok(commentIndex>=0,code);
   const correction={competitionCode:code,round:'결선',entries:[{rowIndex:before.rowIndex,revision:before.finalRevision,updates:{[commentIndex]:'관리자 직접 검수 QA'}}]};
   if(code==='MOB'){
    assert.equal((await raw(api,'resubmitFinalEvaluations',correction,{...token(lead),type:'ADMIN',role:'관리자'})).success,false);
    assert.equal((await raw(api,'resubmitFinalEvaluations',correction,{name:api.actor.name,phone:api.actor.phone})).success,false,'a verified admin login is required');
    assert.equal((await raw(api,'deleteReviewRow',code,before.rowIndex,{...token(lead),type:'ADMIN'})).success,false);
   }
   await api.rpc('resubmitFinalEvaluations',correction,admin);
   const current=api.db.prepare('SELECT * FROM scores WHERE id=?').get(id);
   assert.equal(current.judge_name,original.judge_name,'preserve original judge identity');
   assert.equal(current.role,original.role);
   assert.equal(current.unit,original.unit);
   assert.equal(current.round,original.round);
   assert.equal(JSON.parse(current.payload_json).finalReview.history.at(-1).action,'admin-edit');
   const edited=(await list()).list.find(row=>row.rowIndex===before.rowIndex);
   assert.equal(edited['종합코멘트'],'관리자 직접 검수 QA');
   const preDelete=snapshot(api);
   assert.equal((await raw(api,'deleteReviewRow',code,before.rowIndex,'관리자',admin,before.finalRevision)).stale,true);
   assert.equal(snapshot(api),preDelete);
   await api.rpc('deleteReviewRow',code,edited.rowIndex,'관리자',admin,edited.finalRevision);
   assert.deepEqual(JSON.parse(snapshot(api)),JSON.parse(preDelete).filter(row=>row.id!==id),'delete only the confirmed submission');
  }
  assert.equal(JSON.stringify(await api.rpc('getConfig')),config,'viewing rounds never changes the live round');
 }finally{api.close();}
});

test('IKRC admin can preview both stations and manage a judge record without submitting an official vote',async()=>{
 const api=await createRpcFixture();
 let officialAttempts=0;
 const qa=await createBrowserFixture({apiHandler:request=>{if(request.action==='submitScores')officialAttempts++;return api.handle(request);}});
 try{
  const {judges,stations}=await seedIkrcFinal(api);
  const ids=judges.map(j=>j.operatorRows.find(row=>row.access==='IKRC').rowIndex);
  api.db.prepare("INSERT INTO system_settings(setting_key,setting_value,updated_at) VALUES('ikrc_final_judge_roster',?,?)")
   .run(JSON.stringify({headOperatorId:ids[0],sensoryOperatorIds:ids.slice(1)}),new Date().toISOString());
  await api.rpc('updateCompetitionAdminSettings',{code:'IKRC',currentRound:'예선'},api.actor);
  await api.rpc('submitScores',{...ikrcFinalSubmission(judges[0],stations[0]),round:'예선'});
  await api.rpc('updateCompetitionAdminSettings',{code:'IKRC',currentRound:'결선'},api.actor);
  await api.rpc('submitScores',ikrcFinalSubmission(judges[1],stations[1]));
  const before=snapshot(api);
  const page=await qa.page(390,900);
  await page.goto(qa.origin+'/assessment/');
  await page.evaluate(actor=>{_judge=actor;loadAdminPanel();},api.actor);
  await selectOperationsCompetition(page,'IKRC');
  await page.getByRole('button',{name:'결선 평가표 미리보기',exact:true}).click();
  await page.locator('#pIkrcSetup.active').waitFor();
  assert.equal(await page.locator('#ikrc-station-grid button').count(),2);
  await page.locator('#ikrc-station-grid button').filter({hasText:'A조'}).click();
  await page.locator('#evalIkrc.active').waitFor();
  assert.equal(await page.locator('#ikrc-submit-all').isVisible(),false);
  assert.equal(await page.locator('#ikrc-score-slider').isDisabled(),true);
  await page.getByRole('button',{name:'다음 컵',exact:true}).click();
  assert.equal(await page.locator('#ikrc-current-number').innerText(),'Cup A-2');
  await page.getByRole('button',{name:'컵 설정으로',exact:true}).click();
  await page.locator('#ikrc-station-grid button').filter({hasText:'B조'}).click();
  await page.locator('#evalIkrc.active').waitFor();
  assert.equal(await page.locator('#ikrc-current-number').innerText(),'Cup B-1');
  assert.equal(await page.evaluate(()=>kclEvaluationSubmissionContext_()),null);
  await page.evaluate(()=>{kclSaveActiveEvalDraftNow_(true);ikrcSubmitAll();});
  assert.equal(officialAttempts,0);
  assert.equal(snapshot(api),before);
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   assert.equal((await inspectPage(page)).pageOverflow,false);
  }
  await page.getByRole('button',{name:'제출 평가 관리',exact:true}).click();
  await page.locator('#review-list .review-edit-btn').first().waitFor();
  const selector=page.locator('#review-admin-round');
  assert.equal(await selector.inputValue(),'결선');
  await selector.selectOption('예선');
  await page.waitForFunction(()=>_reviewState.list.length===6&&_reviewState.list.every(row=>row.round==='예선')&&!document.getElementById('overlay').classList.contains('active'));
  await selector.selectOption('결선');
  await page.waitForFunction(()=>_reviewState.list.length===6&&_reviewState.list.every(row=>row.round==='결선')&&!document.getElementById('overlay').classList.contains('active'));
  await page.locator('#review-list .review-edit-btn').first().click();
  const currentId=await page.evaluate(()=>Number(String(_reviewState.current.rowIndex).split(':')[0]));
  assert.equal(await page.locator('#review-edit-delete').isVisible(),true);
  const commentIndex=await page.evaluate(()=>_reviewState.headers.indexOf('종합코멘트'));
  await page.locator('#review-edit-fields textarea[data-col="'+commentIndex+'"]').first().fill('결선 관리자 수정 QA');
  const editResponse=page.waitForResponse(r=>r.request().postDataJSON()?.action==='resubmitFinalEvaluations');
  await page.locator('#review-edit-save-only').click();
  assert.equal((await (await editResponse).json()).success,true);
  await page.locator('#pReview.active #review-list .review-edit-btn').first().waitFor();
  const saved=api.db.prepare('SELECT * FROM scores WHERE id=?').get(currentId);
  assert.equal(saved.judge_name,judges[1].name);
  assert.match(saved.payload_json,/결선 관리자 수정 QA/);
  assert.equal(await selector.inputValue(),'결선');
  await page.locator('#review-list .review-edit-btn').first().click();
  const deleteId=await page.evaluate(()=>Number(String(_reviewState.current.rowIndex).split(':')[0]));
  const deleteResponse=page.waitForResponse(r=>r.request().postDataJSON()?.action==='deleteReviewRow');
  const preDelete=snapshot(api);
  await page.locator('#review-edit-delete').click();
  assert.equal((await (await deleteResponse).json()).success,true);
  assert.deepEqual(JSON.parse(snapshot(api)),JSON.parse(preDelete).filter(row=>row.id!==deleteId));
  assert.deepEqual(page.qaErrors,[]);
 }finally{await qa.close();api.close();}
});
