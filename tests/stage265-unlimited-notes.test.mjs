import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
const api=await createRpcFixture();
const notes=Array.from({length:12},(_,i)=>'향미관찰'+String(i+1).padStart(2,'0'));
const long='아주긴향미표현을글자수로자르지않고저장합니다'.repeat(8);
notes.push(long);
try{
 const generated=await api.rpc('generateKbcComment',{judgeToken:api.actor.judgeToken,isMain:true,evaluatedItems:[{id:'flavor',label:'플레이버',section:'에스프레소',score:3,tags:notes,comment:long}]});
 for(const comment of generated.comments)for(const note of notes)assert.ok(comment.includes(note),'generated comments include every selected note');
 for(const payload of [
  {type:'qual',scores:{완성도:3},smartTags:{완성도:notes}},
  {cups:[{scores:{완성도:3},smartTags:{완성도:notes},patternType:'Rosetta'}]}
 ]){
  const kcac=await api.rpc('generateKcacComment',{judgeToken:api.actor.judgeToken,...payload});
  for(const comment of kcac.comments)for(const note of notes)assert.ok(comment.includes(note),'KCAC single and combined comments retain all custom observations');
 }
 await api.rpc('upsertParticipant',{competitionCode:'KBC',name:'향미 검증 선수',uniqueNo:'17',prelimCupNo:'17'},api.actor);
 const header='Espresso Flavor 스마트태그';
 await api.rpc('submitScores',{competitionCode:'KBC',round:'예선',judgeToken:api.actor.judgeToken,judgeName:api.actor.name,mode:'대회평가',role:'헤드 심사위원',rows:[{extraFields:{'참가자번호':'17','총점':20,'종합코멘트':long,[header]:notes.join(', ')}}]});
 const review=await api.rpc('getReviewList','KBC',{...api.actor,reviewScope:'manage',manageReview:true});
 assert.equal(review.list[0][header],notes.join(', '));
 assert.equal(review.list[0]['종합코멘트'],long);
 await api.rpc('updateReviewStatusBatch','KBC',review.list.map(row=>row.rowIndex),'검수완료',api.actor.name,api.actor);
 const preview=await api.rpc('getAdminDebriefPreview','KBC','17','예선',api.actor);
 assert.ok(preview.scores.length);
 assert.equal(preview.scores[0][header],notes.join(', '));
 assert.equal(preview.scores[0]['종합코멘트'],long);
 console.log('Stage265 every note in generated comments, 13 notes and long authored comments in actual submit/review/debrief transport passed.');
}finally{api.close();}
