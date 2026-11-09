import assert from 'node:assert/strict';
import {createBrowserFixture} from './helpers/browser-fixture.mjs';

const qa=await createBrowserFixture();
try{
 const page=await qa.page(390);
 await page.goto(qa.origin+'/assessment/');
 const state=await page.evaluate(()=>{
  const requests=[];
  function runner(success,failure){
   return {
    withSuccessHandler(fn){return runner(fn,failure);},
    withFailureHandler(fn){return runner(success,fn);},
    getParticipantAssignments(code,actor){requests.push({code,actor,success,failure});}
   };
  }
  google.script.run=runner();
  _judge={judgeToken:'qa-first-session',role:'센서리 심사위원',access:'KBC'};
  _selComp={code:'KBC',currentRound:'본선'};
  const response=(round,name)=>({success:true,competitionCode:'KBC',currentRound:round,assignments:[{number:'1',name,display:name}]});
  const current=()=>participantListForCode_('KBC').map(p=>p.name);
  loadParticipantAssignmentsForCode_('KBC');
  _selComp.currentRound='결선';
  loadParticipantAssignmentsForCode_('KBC');
  requests[1].success(response('결선','결선 선수'));
  requests[0].success(response('본선','지난 본선 선수'));
  const afterRoundChange=current();
  loadParticipantAssignmentsForCode_('KBC');
  loadParticipantAssignmentsForCode_('KBC');
  requests[3].success(response('결선','최신 결선 선수'));
  requests[2].failure(new Error('QA 늦은 실패'));
  const afterLateFailure=current();
  loadParticipantAssignmentsForCode_('KBC');
  _judge={judgeToken:'qa-new-session',role:'센서리 심사위원',access:'KBC'};
  _participantAssignments={};
  loadParticipantAssignmentsForCode_('KBC');
  requests[5].success(response('결선','새 로그인 선수'));
  requests[4].success(response('결선','이전 로그인 선수'));
  const afterNewLogin=current();
  loadParticipantAssignmentsForCode_('KBC');
  requests[6].success(response('본선','서버의 다른 회차'));
  const afterMismatchedResponse=current();
  const lateLiveAccepted=applyLiveParticipantAssignments_('KBC',{...response('본선','이전 회차 동기화'),participantChanged:true});
  return {afterRoundChange,afterLateFailure,afterNewLogin,afterMismatchedResponse,lateLiveAccepted,current:current(),requestRounds:requests.slice(0,2).map(r=>r.actor.round)};
 });
 assert.deepEqual(state.afterRoundChange,['결선 선수']);
 assert.deepEqual(state.afterLateFailure,['최신 결선 선수']);
 assert.deepEqual(state.afterNewLogin,['새 로그인 선수']);
 assert.deepEqual(state.afterMismatchedResponse,['새 로그인 선수']);
 assert.equal(state.lateLiveAccepted,false);
 assert.deepEqual(state.current,['새 로그인 선수']);
 assert.deepEqual(state.requestRounds,['본선','결선'],'transport cannot merge roster requests from two rounds');
 assert.deepEqual(page.qaErrors,[]);
 console.log('Stage283: late roster responses, obsolete failures, changed sessions, and round-mismatched live updates cannot replace the active roster.');
}finally{await qa.close();}
