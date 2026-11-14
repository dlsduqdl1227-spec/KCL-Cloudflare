import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
import {auditTextContrast} from './helpers/contrast-audit.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
const raw=async(action,...args)=>(await api.handle({action,args})).json();
const scores=()=>JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
fs.mkdirSync('tmp/stage279-qa',{recursive:true});
try{
 const names=['해월커피','린정','커피화B','예선만 참가'];
 for(let i=0;i<4;i++)await api.rpc('upsertParticipant',{competitionCode:'KTCC',name:names[i],teamName:names[i],affiliation:'팀원 가, 팀원 나',uniqueNo:String(20+i),prelimCupNo:String(20+i),finalCupNo:i<3?String(i+1):''},api.actor);
 const actors={};for(const [i,[key,type,role]]of [['staff','STAFF','운영진'],['head','JUDGE','헤드 심사위원'],['lead','TEAMLEAD','대회팀장'],['dual','STAFF','운영진']].entries()){
  if(key==='dual')await api.rpc('upsertOperatorAccount',{accountType:'TEAMLEAD',name:key,phone:'0107811000'+i,access:'MOC',role:'대회팀장'},api.actor);
  await api.rpc('upsertOperatorAccount',{accountType:type,name:key,phone:'0107811000'+i,access:'KTCC',role},api.actor);actors[key]=await api.rpc('judgeLogin',key,'0107811000'+i);
 }
 await api.rpc('updateCompetitionAdminSettings',{code:'KTCC',currentRound:'결선',isActive:true},api.actor);
 const teams=(await api.rpc('getKtccFinalTeams',actors.staff)).teams;assert.equal(teams.length,3);
 const assignments=await api.rpc('getParticipantAssignments','KTCC',actors.staff);assert.equal(assignments.assignments.length,3);assert.doesNotMatch(assignments.assignments.map(t=>t.display).join(' '),/결선팀번호|결선\s*[123]|경연\s*[123]/);
 const payload=(actor=actors.staff)=>({competitionCode:'KTCC',round:'결선',judgeToken:actor.judgeToken,judgeName:actor.name,judgeRole:'운영진',team:'1번 테이블',rows:[{data:['3',names[2],'동일 컵 제출','2개',2,'동일 컵 제출','1개',1,'주제','2개',2,2,7,'04분 12.34초'],extraFields:{'토너먼트 단계':'8강','상대팀':names[1],'상대팀ID':teams[1].id,'진출판정':''}}]});
 for(const actor of [actors.staff,actors.head,actors.dual]){const forged=payload(actor);forged.rows[0].extraFields['진출판정']='진출';const before=scores(),res=await raw('submitScores',forged);assert.equal(res.success,false);assert.match(res.message,/KTCC 팀장/);assert.equal(scores(),before);}
 const self=payload();self.rows[0].extraFields['상대팀']=names[2];self.rows[0].extraFields['상대팀ID']=teams[2].id;assert.equal((await raw('submitScores',self)).success,false);
 await api.rpc('submitScores',payload());const record=api.db.prepare("SELECT * FROM scores WHERE competition_code='KTCC'").get();assert.equal(record.total_score,7);
 const beforeDecision={...record},originalPayload=JSON.parse(record.payload_json);
 for(const actor of [actors.staff,actors.head,actors.dual]){assert.equal((await raw('getKtccFinalDecision',{rowIndex:record.id},actor)).success,false);assert.equal((await raw('setKtccFinalDecision',{rowIndex:record.id,result:'진출',revision:'fake'},actor)).success,false);}
 const decision=await api.rpc('getKtccFinalDecision',{rowIndex:record.id},actors.lead);
 const saved=await api.rpc('setKtccFinalDecision',{rowIndex:record.id,result:'진출',revision:decision.revision,total:999},actors.lead);assert.equal(saved.result,'진출');
 let current=api.db.prepare('SELECT * FROM scores WHERE id=?').get(record.id);for(const key of Object.keys(record).filter(k=>k!=='payload_json'))assert.deepEqual(current[key],beforeDecision[key],key+' must not change during advancement management');
 const changed=JSON.parse(current.payload_json);assert.deepEqual(changed.rows[0].data,originalPayload.rows[0].data);assert.equal(changed.rows[0].extraFields.진출판정,'진출');assert.deepEqual(changed.rows[0].extraFields.상대팀ID,originalPayload.rows[0].extraFields.상대팀ID);
 const snapshot=scores();assert.equal((await raw('setKtccFinalDecision',{rowIndex:record.id,result:'탈락',revision:decision.revision},actors.lead)).stale,true);assert.equal(scores(),snapshot);
 assert.equal((await raw('setKtccFinalDecision',{rowIndex:record.id,result:'임의',revision:saved.revision},api.actor)).success,false);
 await api.rpc('setKtccFinalDecision',{rowIndex:record.id,result:'',revision:saved.revision},api.actor);
 const oldMatchRow=api.db.prepare('SELECT * FROM scores WHERE id=?').get(record.id),oldMatchPayload=JSON.parse(oldMatchRow.payload_json);oldMatchPayload.rows[0].extraFields['매치번호']='기존 8강 기록';api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(oldMatchPayload),record.id);
 const oldMatchSnapshot=scores();assert.equal((await raw('submitScores',payload())).success,false,'removing match-number input cannot duplicate a historic team/stage');assert.equal(scores(),oldMatchSnapshot);api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(oldMatchRow.payload_json,record.id);
 // Returning a score for correction does not delegate the manager's decision.
 let finalList=await api.rpc('getReviewList','KTCC',{...actors.lead,reviewScope:'manage',round:'결선'}),finalItem=finalList.list.find(r=>Number(r.rowIndex)===record.id);
 await api.rpc('returnFinalEvaluations',{competitionCode:'KTCC',round:'결선',reason:'상대팀 확인',entries:[{rowIndex:finalItem.rowIndex,revision:finalItem.finalRevision}]},actors.lead);
 finalList=await api.rpc('getReviewList','KTCC',{...actors.staff,round:'결선'});finalItem=finalList.list.find(r=>Number(r.rowIndex)===record.id);
 const decisionCol=finalList.headers.indexOf('진출판정'),returnedSnapshot=scores();
 assert.equal((await raw('resubmitFinalEvaluations',{competitionCode:'KTCC',round:'결선',entries:[{rowIndex:finalItem.rowIndex,revision:finalItem.finalRevision,updates:{[decisionCol]:'진출'}}]},actors.staff)).success,false);assert.equal(scores(),returnedSnapshot);
 await api.rpc('resubmitFinalEvaluations',{competitionCode:'KTCC',round:'결선',entries:[{rowIndex:finalItem.rowIndex,revision:finalItem.finalRevision,updates:{}}]},actors.staff);
 // Clearing one row in a legacy batch preserves the other row's inherited decision.
 const beforeLegacy=api.db.prepare('SELECT * FROM scores WHERE id=?').get(record.id),legacy=JSON.parse(beforeLegacy.payload_json);
 legacy.rows.push(JSON.parse(JSON.stringify(legacy.rows[0])));legacy.extraFields={...(legacy.extraFields||{}),'진출판정':'진출'};
 for(const r of legacy.rows)r.extraFields['진출판정']='';api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(legacy),record.id);
 const legacyDecision=await api.rpc('getKtccFinalDecision',{rowIndex:record.id+':0'},actors.lead);
 await api.rpc('setKtccFinalDecision',{rowIndex:record.id+':0',result:'',revision:legacyDecision.revision},actors.lead);
 assert.equal((await api.rpc('getKtccFinalDecision',{rowIndex:record.id+':0'},actors.lead)).result,'');assert.equal((await api.rpc('getKtccFinalDecision',{rowIndex:record.id+':1'},actors.lead)).result,'진출');
 const legacySaved=JSON.parse(api.db.prepare('SELECT payload_json FROM scores WHERE id=?').get(record.id).payload_json);assert.deepEqual(legacySaved.rows.map(r=>r.data),legacy.rows.map(r=>r.data));api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(beforeLegacy.payload_json,record.id);
 // The older preliminary review endpoint must enforce the same permission.
 await api.rpc('updateCompetitionAdminSettings',{code:'KTCC',currentRound:'예선'},api.actor);const prelim=payload();prelim.round='예선';prelim.rows[0].data[0]='20';await api.rpc('submitScores',prelim);
 const review=await api.rpc('getReviewList','KTCC',actors.staff),row=review.list.find(r=>r.round==='예선'),col=review.headers.indexOf('진출판정');assert.ok(col>=0);const protectedScores=scores();assert.equal((await raw('updateReviewRow','KTCC',row.rowIndex,{[col]:'진출'},'미검수','운영진',actors.staff)).success,false);assert.equal(scores(),protectedScores);
 await api.rpc('updateCompetitionAdminSettings',{code:'KTCC',currentRound:'결선'},api.actor);const configs=(await api.rpc('getConfig')).configs;
 const page=await qa.page(390,950);await page.goto(qa.origin+'/assessment/');await page.evaluate(({actor,configs})=>{_judge=actor;_configs=configs;_selComp=configs.find(c=>c.code==='KTCC');showKtccSetup();},{actor:actors.staff,configs});
 await page.waitForFunction(()=>document.querySelectorAll('#ktccSetupParticipantSelect option').length===4);assert.equal(await page.locator('#ktccSetupSingleInput').isVisible(),false);assert.doesNotMatch(await page.locator('#ktccSetupParticipantSelect').innerText(),/결선팀번호|예선만 참가/);
 for(const index of ['0','1']){await page.locator('#ktccSetupParticipantSelect').selectOption(index);await page.getByRole('button',{name:'추가',exact:true}).click();}
 await page.getByRole('button',{name:'평가 시작',exact:true}).click();await page.waitForFunction(()=>_ktccFinalTeams.loaded);await page.evaluate(()=>stopRegistryLiveSync_());
 assert.equal(await page.locator('#ktcc-team-num').isVisible(),false);assert.equal(await page.locator('#ktcc-match-no').isVisible(),false);assert.equal(await page.locator('#ktcc-advance-result').isVisible(),false);assert.equal(await page.locator('#ktcc-advance-result').isDisabled(),true);assert.match(await page.locator('#ktcc-target-nav').innerText(),/해월커피/);
 assert.equal(await page.locator('#ktcc-section3-cups button').count(),2);assert.match(await page.locator('#ktcc-rule-desc').innerText(),/5컵/);
 assert.equal(await page.locator('#ktcc-opponent-team option').count(),3);assert.doesNotMatch(await page.locator('#ktcc-opponent-team').innerText(),/해월커피|예선만 참가/);
 await page.locator('#ktcc-opponent-team').selectOption(String(teams[1].id));await page.evaluate(()=>{setKtccSectionAnswerCount('section1',2);setKtccSectionAnswerCount('section2',1);setKtccSectionAnswerCount('section3',2);document.getElementById('ktcc-end-min').value='4';document.getElementById('ktcc-end-sec').value='12';document.getElementById('ktcc-end-centi').value='34';onKtccSplitTimeInput_();document.getElementById('ktcc-match-stage').value='8강';saveCurrentKtccDraft_();});
 await page.locator('#ktcc-target-nav button').nth(1).click();await page.locator('#ktcc-opponent-team').selectOption(String(teams[0].id));await page.evaluate(()=>setKtccSectionAnswerCount('section1',1));await page.locator('#ktcc-target-nav button').first().click();
 assert.equal(await page.locator('#ktcc-opponent-team').inputValue(),String(teams[1].id));assert.equal(await page.locator('#ktcc-end-centi').inputValue(),'34');assert.equal(await page.locator('#ktcc-score-display').innerText(),'4');assert.equal(await page.locator('#ktcc-final-big').innerText(),'7');
 await page.locator('#ktcc-section3-cups button').filter({hasText:'오답 · 0점'}).click();assert.equal(await page.locator('#ktcc-final-big').innerText(),'3');await page.locator('#ktcc-section3-cups button').filter({hasText:'정답 · 4점'}).click();assert.equal(await page.locator('#ktcc-final-big').innerText(),'7');
 for(const width of [390,1440]){await page.setViewportSize({width,height:950});assert.equal((await inspectPage(page)).pageOverflow,false);assert.deepEqual(await auditTextContrast(page,'#evalKtcc'),[]);await page.screenshot({path:'tmp/stage279-qa/evaluation-'+width+'.png'});}
 const submission=page.waitForResponse(r=>r.request().postDataJSON()?.action==='submitWithSignature');await page.evaluate(()=>submitKtccFinal('data:image/png;base64,AA=='));assert.equal((await(await submission).json()).success,true);
 const later=payload();later.rows[0].data[0]='1';later.rows[0].data[1]=names[0];later.rows[0].extraFields['토너먼트 단계']='4강';await api.rpc('submitScores',later);
 await page.evaluate(a=>{_judge=a;hideEval();goReviewByCode('KTCC','KTCC','pTeam');},actors.lead);await page.locator('.ktcc-decision-btn').first().waitFor();assert.doesNotMatch(await page.locator('#review-list .review-info-name').first().innerText(),/팀번호|결선\s*\d/);
 assert.equal(await page.locator('#review-list .review-item').filter({hasText:names[0]}).count(),2,'quarter-final and semi-final remain separate');
 await page.locator('#review-list .review-item').filter({hasText:names[0]}).locator('.ktcc-decision-btn').first().click();await page.waitForFunction(()=>!!_ktccDecisionUi.loaded);await page.locator('#ktcc-decision-result').selectOption('진출');const decisionId=Number(await page.evaluate(()=>_ktccDecisionUi.loaded.rowIndex)),snapshotBeforeSave=api.db.prepare('SELECT * FROM scores WHERE id=?').get(decisionId);await page.locator('[data-decision-save]').click();await page.waitForFunction(()=>!_ktccDecisionUi.saving&&_ktccDecisionUi.loaded.result==='진출');const afterSave=api.db.prepare('SELECT * FROM scores WHERE id=?').get(snapshotBeforeSave.id);assert.equal(afterSave.total_score,snapshotBeforeSave.total_score);assert.equal(afterSave.review_status,snapshotBeforeSave.review_status);assert.deepEqual(JSON.parse(afterSave.payload_json).rows[0].data,JSON.parse(snapshotBeforeSave.payload_json).rows[0].data);assert.deepEqual(await auditTextContrast(page,'#ktcc-decision-dialog'),[]);await page.screenshot({path:'tmp/stage279-qa/decision.png'});await page.locator('[data-decision-close]').click();
 const management=await api.rpc('getReviewList','KTCC',{...actors.lead,reviewScope:'manage',round:'결선'}),returnedItem=management.list.find(r=>Number(r.rowIndex)===decisionId);
 await api.rpc('returnFinalEvaluations',{competitionCode:'KTCC',round:'결선',reason:'상대팀 변경',entries:[{rowIndex:returnedItem.rowIndex,revision:returnedItem.finalRevision}]},actors.lead);
 await page.evaluate(a=>{_judge=a;goReviewByCode('KTCC','KTCC','pSelect');},actors.staff);await page.locator('#review-list .review-edit-btn').first().waitFor();assert.equal(await page.locator('.ktcc-decision-btn').count(),0);
 await page.locator('#review-list .review-edit-btn').first().click();await page.locator('#review-edit-fields select[data-ktcc-opponent]').waitFor();assert.doesNotMatch(await page.locator('#review-edit-fields').innerText(),/매치번호|진출판정|팀번호/);
 await page.locator('#review-edit-fields select[data-ktcc-opponent]').selectOption(String(teams[2].id));await page.waitForTimeout(1100);
 const correction=page.waitForResponse(r=>r.request().postDataJSON()?.action==='resubmitFinalEvaluations').catch(()=>null);await page.locator('#review-edit-save-only').click().catch(async e=>{console.log('KTCC correction UI',await page.evaluate(()=>({current:_reviewState.current,panel:activePanelId_(),saving:_finalCorrectionSaving,saveDisplay:getComputedStyle(document.getElementById('review-edit-save-only')).display,bodyClass:document.body.className})));throw e;});const correctionResponse=await correction;if(!correctionResponse)console.log('KTCC correction state',await page.evaluate(()=>({current:_reviewState.current,panel:activePanelId_(),saving:_finalCorrectionSaving,toast:document.getElementById('toast')?.textContent,auto:document.getElementById('review-autosave-state')?.textContent})),page.qaErrors);assert.ok(correctionResponse);assert.equal((await correctionResponse.json()).success,true);
 const corrected=api.db.prepare('SELECT * FROM scores WHERE id=?').get(decisionId),correctedPayload=JSON.parse(corrected.payload_json),previousPayload=JSON.parse(snapshotBeforeSave.payload_json);assert.equal(corrected.total_score,snapshotBeforeSave.total_score);assert.equal(correctedPayload.rows[0].extraFields['진출판정'],'진출');assert.equal(correctedPayload.rows[0].extraFields['상대팀'],names[2]);assert.equal(correctedPayload.rows[0].extraFields['종료시간'],previousPayload.rows[0].extraFields['종료시간']||previousPayload.rows[0].data[13]);
 assert.deepEqual(page.qaErrors,[]);assert.deepEqual(page.qaMissing,[]);
 console.log('Stage279 KTCC: final team names without visible numbers, roster-only opponents with independent drafts, protected staff/head/cross-competition permissions, manager-only atomic advancement, stale conflicts, unchanged score/time/status and mobile/desktop contrast passed.');
}finally{await qa.close();api.close();}
