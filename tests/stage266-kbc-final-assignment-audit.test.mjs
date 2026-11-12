import assert from 'node:assert/strict';
import {createBrowserFixture} from './helpers/browser-fixture.mjs';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedKbcMain} from './stage264-kbc-main-days.test.mjs';
const api=await createRpcFixture(),qa=await createBrowserFixture({apiHandler:api.handle});
try{
 await seedKbcMain(api);
 const plan=await api.rpc('getKbcFinalistPlan',api.actor);
 await api.rpc('assignKbcFinalists',{revision:plan.revision},api.actor);
 await api.rpc('updateCompetitionAdminSettings',{code:'KBC',currentRound:'결선'},api.actor);
 await api.rpc('submitScores',{competitionCode:'KBC',round:'결선',judgeToken:api.actor.judgeToken,judgeName:api.actor.name,mode:'대회평가',role:'헤드 심사위원',rows:[{extraFields:{'참가자번호':'3','총점':22,'종합코멘트':'결선 3번의 제출 기록'}}]});
 const page=await qa.page(390,950);await page.goto(qa.origin+'/assessment/');
 await page.evaluate(a=>{_judge=a;_selComp={code:'KBC',name:'KBC',currentRound:'결선',isActive:true};startKbc();},api.actor);
 await page.waitForFunction(()=>participantListForCode_('KBC').length===6);
 const actual=await page.evaluate(()=>({
   final6:participantAssignmentByNumber_('KBC','6'),
   final3:participantAssignmentByNumber_('KBC','3'),
   oldMain8:participantAssignmentByNumber_('KBC','8')
 }));
 assert.equal(actual.final6.number,'6','the active-round number wins over another player’s original participant number');
 assert.equal(actual.final6.name,'본선 선수 8');
 assert.equal(actual.final6.evaluationCompleted,false,'another finalist’s completion cannot block this participant');
 assert.equal(actual.final3.name,'본선 선수 5');assert.equal(actual.final3.evaluationCompleted,true);
 assert.equal(actual.oldMain8,null,'an old main number cannot masquerade as a final number');
 await page.locator('#kbc-num').fill('6');
 assert.equal(await page.locator('#kbc-name').inputValue(),'본선 선수 8');
 assert.equal(await page.locator('#kbc-participant-complete').isVisible(),false);
 await page.locator('#kbc-num').fill('3');
 assert.equal(await page.locator('#kbc-name').inputValue(),'본선 선수 5');
 assert.equal(await page.locator('#kbc-participant-complete').isVisible(),true);
 await page.locator('#kbc-num').fill('8');
 assert.equal(await page.locator('#kbc-name').inputValue(),'','an unassigned final number cannot retain the previously selected player name');
 const beforeInvalid=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
 const invalid=await(await api.handle({action:'submitScores',args:[{competitionCode:'KBC',round:'결선',judgeToken:api.actor.judgeToken,mode:'대회평가',rows:[{extraFields:{'참가자번호':'8','총점':20}}]}]})).json();
 assert.equal(invalid.success,false,'once finalists are assigned, main-only numbers cannot enter final scoring');
 assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),beforeInvalid);
 await page.locator('#kbc-num').fill('6');
 await page.locator('#kbc-end-time').fill('1005');
 await page.locator('#kbc-comment').fill('재접속 후에도 보존할 직접 작성 의견');
 const draftKey=await page.evaluate(()=>{
   for(let i=1;i<=12;i++)kbcToggleTagValue_('service','Service Professionalism','복원할 표현 '+i);
   kbcRefreshInlineTagCategory_('service','Service Professionalism');
   kclSaveActiveEvalDraftNow_(true);return kclDraftKey_('KBC');
 });
 await page.reload();
 await page.evaluate(a=>{_judge=a;_selComp={code:'KBC',name:'KBC',currentRound:'결선',isActive:true};kclMaybeRestoreDraftForActiveEval_=()=>{};startKbc();},api.actor);
 await page.waitForFunction(()=>participantListForCode_('KBC').length===6);
 await page.evaluate(key=>kclRestoreDraftForCode_('KBC',JSON.parse(localStorage.getItem(key))),draftKey);
 assert.equal(await page.evaluate(()=>kbcCollectTagPayload_().service['Service Professionalism'].length),12);
 assert.match(await page.locator('#evalKbc .kcl-tag-launch').first().innerText(),/12개/,'restored notes must be visible in the picker count');
 await page.locator('#evalKbc .kcl-tag-launch').first().click();
 assert.equal(await page.locator('#kcl-smart-tag-picker .kcl-tag-picker-chip').count(),12);
 await page.locator('#kcl-smart-tag-picker .kcl-tag-picker-done').click();
 assert.equal(await page.locator('#kbc-comment').inputValue(),'재접속 후에도 보존할 직접 작성 의견');
 assert.equal(await page.locator('#kbc-end-time').inputValue(),'10분05초');
 await page.waitForFunction(()=>!_kclDraftApplying);
 await page.evaluate(()=>{hideEval();_selComp={code:'MOB',name:'MOB',currentRound:'예선'};startMob();});
 const mobDraftKey=await page.evaluate(()=>{
   const meta=mobAttrTagMeta_(MOB_TECH[0]);
   for(let i=1;i<=12;i++)mobToggleTagValue_(meta.group,meta.category,'MOB 복원 표현 '+i);
   mobRefreshInlineTagCategory_(meta.group,meta.category);kclSaveActiveEvalDraftNow_(true);return kclDraftKey_('MOB');
 });
 await page.waitForFunction(()=>document.querySelector('#evalMob .kcl-tag-launch')?.textContent.includes('12개'));
 assert.match(await page.locator('#evalMob .kcl-tag-launch').first().innerText(),/12개/,'the fixture must populate the visible MOB field before reload');
 assert.equal(await page.evaluate(key=>!!JSON.parse(localStorage.getItem(key))?.state?.mobTags,mobDraftKey),true);
 await page.reload();
 await page.evaluate(a=>{_judge=a;_selComp={code:'MOB',name:'MOB',currentRound:'예선'};kclMaybeRestoreDraftForActiveEval_=()=>{};startMob();},api.actor);
 await page.evaluate(key=>kclRestoreDraftForCode_('MOB',JSON.parse(localStorage.getItem(key))),mobDraftKey);
 assert.match(await page.locator('#evalMob .kcl-tag-launch').first().innerText(),/12개/);
 await page.locator('#evalMob .kcl-tag-launch').first().click();
 assert.equal(await page.locator('#kcl-smart-tag-picker .kcl-tag-picker-chip').count(),12);
 await page.locator('#kcl-smart-tag-picker .kcl-tag-picker-done').click();
 assert.deepEqual(page.qaErrors,[]);await page.close();
 console.log('Stage266 active-round identity/completion isolation and KBC/MOB 12-note UI restoration after reload passed.');
}finally{await qa.close();api.close();}
