import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {createBrowserFixture,inspectPage} from './helpers/browser-fixture.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
const manage={...api.actor,reviewScope:'manage',manageReview:true,round:'결선'};
const request=async(action,...args)=>(await api.handle({action,args})).json();
try{
 await api.rpc('upsertParticipant',{competitionCode:'KCAC',name:'블라인드 보호 선수',phone:'01088881234',uniqueNo:'1',finalCupNo:'1'},api.actor);
 await api.rpc('updateCompetitionAdminSettings',{code:'KCAC',currentRound:'결선',isActive:true,debriefing:false},api.actor);
 for(const [name,phone,access,role] of [['원본 심사','01077770001','KCAC','센서리 헤드 심사위원'],['다른 심사','01077770002','KCAC','센서리 헤드 심사위원'],['다른 팀장','01077770003','MOB','팀장'],['담당 팀장','01077770004','KCAC','팀장']]){
  await api.rpc('upsertOperatorAccount',{accountType:role==='팀장'?'TEAM_LEAD':'JUDGE',name,phone,access,role},api.actor);
 }
 const owner=await api.rpc('judgeLogin','원본 심사','01077770001'),other=await api.rpc('judgeLogin','다른 심사','01077770002'),otherLead=await api.rpc('judgeLogin','다른 팀장','01077770003');
 const row=(score,comment)=>({data:['1'],extraFields:{잔용도:'센서리평가','결선 Taste Balance(맛의 균형)':score,'결선 Mouthfeel(질감)':3,'결선 Presentation(프레젠테이션)':3,'종합코멘트':comment,'점수잠금':'{"맛균형":true,"질감":true,"프레젠":true}','결선 Taste Balance 스마트태그':'균형 있는 맛'},media:{count:0}});
 const sensory={competitionCode:'KCAC',round:'결선',judgeToken:owner.judgeToken,mode:'judge',overallCommentMode:'per-row',rows:[row(3.2,'첫 잔 원본'),row(2.4,'둘째 잔 원본')]};
 await api.rpc('submitScores',sensory);
 const original=api.db.prepare("SELECT * FROM scores WHERE competition_code='KCAC'").get();
 const stored=JSON.parse(original.payload_json);
 const assignments=await api.rpc('getParticipantAssignments','KCAC',owner);
 const sensoryOnly=assignments.assignments.find(item=>item.number==='1');
 assert.deepEqual(sensoryOnly.completedEvaluationScopes,['sensory']);
 // A separate final judging area must not be mistaken for duplicate submission.
 await api.rpc('submitScores',{...sensory,rows:[{data:['1'],extraFields:{잔용도:'창작패턴평가','결선 Theme Expression(주제 표현력)':3,'결선 Technical Execution(작업 수행 완성도)':3,'결선 Cleanliness(청결)':3,'결선 Surface Quality(표면 품질)':3,'결선 Position & Symmetry(위치와 대칭)':3,'결선 Design Completion(디자인 완성도)':3}}]});
 assert.equal((await request('submitScores',sensory)).success,false,'same area remains duplicate');
 let list=await api.rpc('getReviewList','KCAC',manage);
 const entries=list.list.filter(r=>r.scoreRowId===original.id).map(r=>({rowIndex:r.rowIndex,revision:r.finalRevision}));assert.equal(entries.length,2);
 assert.equal((await request('returnFinalEvaluations',{competitionCode:'KCAC',round:'결선',reason:'수정',entries},otherLead)).success,false,'other competition lead denied');
 const lead=await api.rpc('judgeLogin','담당 팀장','01077770004');
 await api.rpc('returnFinalEvaluations',{competitionCode:'KCAC',round:'결선',reason:'두 잔 코멘트 대조',entries},lead);
 assert.equal((await api.rpc('getReviewList','KCAC',{...other,round:'결선',returnedOnly:true})).list.length,0);
 const own=await api.rpc('getReviewList','KCAC',{...owner,round:'결선',returnedOnly:true});
 assert.equal(own.list.length,2);assert.doesNotMatch(JSON.stringify(own),/블라인드 보호 선수/);
 const bad=await request('resubmitFinalEvaluations',{competitionCode:'KCAC',round:'결선',entries:[{rowIndex:original.id+':99',revision:own.list[0].finalRevision,updates:{}}]},owner);assert.equal(bad.success,false);
 const noAccess=await request('resubmitFinalEvaluations',{competitionCode:'KCAC',round:'결선',entries:own.list.map(r=>({rowIndex:r.rowIndex,revision:r.finalRevision,updates:{}}))},other);assert.equal(noAccess.success,false);
 const page=await qa.page(390);await page.goto(qa.origin+'/assessment/');
 const completion=await page.evaluate(item=>{
  _selComp={code:'KCAC',currentRound:'결선'};
  _kcac.jars=[{type:'final-pattern'}];
  const pattern=participantCompletionForActiveArea_('KCAC',item);
  _kcac.jars=[{type:'final-sensory'}];
  const sensory=participantCompletionForActiveArea_('KCAC',item);
  _kcac.jars=[];
  return {pattern,sensory};
 },sensoryOnly);
 assert.equal(completion.pattern.evaluationCompleted,false);
 assert.doesNotMatch(completion.pattern.display,/평가완료/);
 assert.equal(completion.sensory.evaluationCompleted,true);
 assert.match(completion.sensory.display,/평가완료/);
 await page.evaluate(actor=>{_judge=actor;_selComp={code:'KCAC',currentRound:'결선',name:'KCAC'};hideOverlay();goReviewByCode('KCAC','KCAC','pSelect');},owner);
 await page.locator('#review-list .review-edit-btn').first().waitFor();
 assert.equal(await page.locator('.final-return-btn').count(),0);
 await page.locator('#review-list .review-edit-btn').first().click();
 const ci=own.headers.indexOf('종합코멘트');
 const comment=page.locator('#review-edit-fields textarea[data-col="'+ci+'"]').first();
 const tabs=page.locator('.review-group-tabs button');assert.equal(await tabs.count(),2);
 const firstIndex=await page.evaluate(()=>_reviewState.current.payloadRowIndex);
 await comment.fill('첫 번째 수정 기록');
 await tabs.nth(1).click();await comment.fill('두 번째 수정 기록');
 await tabs.first().click();assert.equal(await comment.inputValue(),'첫 번째 수정 기록');
 const before=api.db.prepare('SELECT * FROM scores WHERE id=?').get(original.id);
 assert.deepEqual(JSON.parse(before.payload_json).rows,stored.rows,'tab edits cannot change server until resubmit');
 assert.equal(before.total_score,original.total_score);
 assert.equal(await page.locator('#review-edit-fields input[type=range]:not([disabled])').count(),0,'cup score locks preserved');
 assert.equal((await inspectPage(page)).pageOverflow,false);
 // Reload the list and editor: both local drafts must survive.
 await page.evaluate(()=>backToReviewList());await page.locator('#review-list .review-edit-btn').first().click();
 assert.equal(await comment.inputValue(),'첫 번째 수정 기록');await tabs.nth(1).click();assert.equal(await comment.inputValue(),'두 번째 수정 기록');
 const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/rpc'&&r.request().postDataJSON()?.action==='resubmitFinalEvaluations');
 await page.locator('#review-edit-save-only').click();assert.equal((await(await saved).json()).success,true);
 await page.waitForFunction(()=>activePanelId_()==='pReview'&&document.getElementById('review-list').innerText.includes('반려된 평가가 없습니다'));
 const final=api.db.prepare('SELECT * FROM scores WHERE id=?').get(original.id),p=JSON.parse(final.payload_json);
 assert.equal(final.total_score,original.total_score,'comment-only correction preserves exact total');
 assert.equal(p.rows[firstIndex].extraFields.종합코멘트,'첫 번째 수정 기록');assert.equal(p.rows[1-firstIndex].extraFields.종합코멘트,'두 번째 수정 기록');
 for(let i=0;i<2;i++)for(const key of ['결선 Taste Balance(맛의 균형)','결선 Mouthfeel(질감)','결선 Presentation(프레젠테이션)','점수잠금','결선 Taste Balance 스마트태그']){
  const numeric=typeof stored.rows[i].extraFields[key]==='number';
  assert.equal(numeric?Number(p.rows[i].extraFields[key]):p.rows[i].extraFields[key],stored.rows[i].extraFields[key],key+' preserved');
 }
 // A slow return response must not pull the operator back from another competition.
 await page.evaluate(actor=>{_judge=actor;goReviewByCode('KCAC','KCAC','pAdmin');},api.actor);
 await page.locator('.final-return-btn').first().waitFor();
 page.removeAllListeners('dialog');page.on('dialog',d=>d.accept(d.type()==='prompt'?'종이 기록 확인':undefined));
 let releaseReturn;
 const returnWaiting=new Promise(resolve=>{releaseReturn=resolve;});
 let notifyReturn;
 const returnStarted=new Promise(resolve=>{notifyReturn=resolve;});
 await page.route('**/api/rpc*',async route=>{
  if(route.request().postDataJSON()?.action!=='returnFinalEvaluations')return route.fallback();
  const response=await route.fetch();notifyReturn();await returnWaiting;await route.fulfill({response});
 });
 await page.locator('.final-return-btn').first().click();await returnStarted;
 await page.evaluate(()=>{_selComp={code:'KBC',currentRound:'결선'};_reviewState.code='KBC';showPanel('pSelect');});
 const returnFinished=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/rpc'&&r.request().postDataJSON()?.action==='returnFinalEvaluations');
 releaseReturn();await returnFinished;await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>activePanelId_()),'pSelect','late response preserves current navigation');
 assert.deepEqual(page.qaErrors,[]);await page.close();
 // Tournament matches are separate evaluations, not a duplicate of the preceding match.
 await api.rpc('updateCompetitionAdminSettings',{code:'KTCC',currentRound:'결선',isActive:true},api.actor);
 const match=stage=>({competitionCode:'KTCC',round:'결선',judgeToken:api.actor.judgeToken,rows:[{data:['1'],extraFields:{'Section1 정답수':2,'Section2 정답수':3,'Section3 정답수':4,'종료시간':'04분 00초 20','토너먼트 단계':stage,'매치번호':'1'}}]});
 await api.rpc('submitScores',match('8강'));await api.rpc('submitScores',match('4강'));
 assert.equal((await request('submitScores',match('4강'))).success,false);
 assert.equal(api.db.prepare("SELECT COUNT(*) n FROM scores WHERE competition_code='KTCC'").get().n,2);
 console.log('Stage235 real two-cup correction preserves independent scores, locks, tags, comments and total; owner/lead scope, local draft recovery, final areas and tournament matches passed.');
}finally{await qa.close();api.close();}
