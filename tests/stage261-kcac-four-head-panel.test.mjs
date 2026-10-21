import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
const api=await createRpcFixture();
const roles=['패턴디자인 헤드 심사위원','패턴디자인 헤드 심사위원','일반우유 센서리 헤드 심사위원','오트 센서리 헤드 심사위원'];
const types=['final-pattern','final-pattern','sensory-regular','sensory-oat'];
async function rejected(action,...args){const res=await(await api.handle({action,args})).json();assert.equal(res.success,false,JSON.stringify(res));return res;}
function row(type,value=5){
 const pattern=type==='final-pattern';
 const fields=pattern?['Theme Expression(주제 표현력)','Technical Execution(작업 수행 완성도)','Cleanliness(청결)','Surface Quality(표면 품질)','Position & Symmetry(위치와 대칭)','Design Completion(디자인 완성도)']:['Taste Balance(맛의 균형)','Mouthfeel(질감)','Presentation(프레젠테이션)'];
 return {data:['1'],extraFields:{...Object.fromEntries(fields.map(k=>['결선 '+k,value])),잔용도:pattern?'창작패턴평가':'센서리용아트',패턴종류:type,종합코멘트:type+' 독립 기록',점수잠금:'{"주제표현":true}',시간감점:0}};
}
try{
 await api.rpc('upsertParticipant',{competitionCode:'KCAC',name:'비공개 선수',phone:'01010001000',uniqueNo:'1',prelimCupNo:'1',finalCupNo:'1'},api.actor);
 await api.rpc('updateCompetitionAdminSettings',{code:'KCAC',currentRound:'결선',isActive:true,debriefing:false,optionSettings:{kcacFinalPanelMode:'split-four-heads-160'}},api.actor);
 const heads=[];
 for(let i=0;i<4;i++){
  await api.rpc('upsertOperatorAccount',{name:'배정 헤드'+i,phone:'0107000000'+i,access:'KCAC',accountType:'JUDGE',role:roles[i]},api.actor);
  heads.push(await api.rpc('judgeLogin','배정 헤드'+i,'0107000000'+i));
 }
 for(let i=0;i<4;i++){
  const payload={competitionCode:'KCAC',round:'결선',judgeToken:heads[i].judgeToken,mode:'judge',rows:[row(types[i])]};
  // Payload role spoofing cannot override the operator's competition-specific role.
  const invalid=await rejected('submitScores',{...payload,judgeRole:roles[(i+2)%4],rows:[row(types[(i+2)%4])]});
  assert.match(invalid.message,/배정/);
  assert.equal(api.db.prepare('SELECT COUNT(*) n FROM scores').get().n,i);
  await rejected('submitScores',{...payload,rows:[row(types[i]),row(types[i])]});
  await api.rpc('submitScores',payload);
  const ranks=await api.rpc('getRanking','KCAC',api.actor);
  assert.equal(ranks.ranking[0].score,[60,120,140,160][i],'each head immediately adds their own score');
 }
 assert.equal(api.db.prepare('SELECT COUNT(*) n FROM scores').get().n,4);
 for(let i=0;i<4;i++){
  const own=await api.rpc('getReviewList','KCAC',heads[i]);
  assert.equal(own.list.length,1);assert.equal(own.list[0]['심사위원명'],'배정 헤드'+i);
  assert.equal(own.list[0]['창작주제'],'동물');
  await rejected('submitScores',{competitionCode:'KCAC',round:'결선',judgeToken:heads[i].judgeToken,rows:[row(types[i])]});
 }
 // Return/re-submit: own edits only, milk/panel identity cannot be switched.
 const review=await api.rpc('getReviewList','KCAC',{...api.actor,reviewScope:'manage'});
 const original=review.list.find(x=>x['심사위원명']==='배정 헤드2');
 await api.rpc('returnFinalEvaluations',{competitionCode:'KCAC',round:'결선',reason:'수기표 대조',entries:[{rowIndex:original.rowIndex,revision:original.finalRevision}]},api.actor);
 assert.equal((await api.rpc('getRanking','KCAC',api.actor)).ranking[0].score,140);
 const returned=await api.rpc('getReviewList','KCAC',heads[2]),item=returned.list[0];
 const patternCol=returned.headers.indexOf('패턴종류');assert.ok(patternCol>=0);
 await rejected('resubmitFinalEvaluations',{competitionCode:'KCAC',round:'결선',entries:[{rowIndex:item.rowIndex,revision:item.finalRevision,updates:{[patternCol]:'sensory-oat'}}]},heads[2]);
 await rejected('resubmitFinalEvaluations',{competitionCode:'KCAC',round:'결선',entries:[{rowIndex:item.rowIndex,revision:item.finalRevision,updates:{}}]},heads[3]);
 await api.rpc('resubmitFinalEvaluations',{competitionCode:'KCAC',round:'결선',entries:[{rowIndex:item.rowIndex,revision:item.finalRevision,updates:{}}]},heads[2]);
 assert.equal((await api.rpc('getRanking','KCAC',api.actor)).ranking[0].score,160);
 const preview=await api.rpc('getAdminDebriefPreview','KCAC','1','결선',api.actor);
 assert.equal(preview.rankInfo.score,160);
 assert.equal(preview.scores.length,4);
 const allFull=api.db.prepare('SELECT * FROM scores ORDER BY id').all();
 await rejected('submitScores',{competitionCode:'KCAC',round:'결선',judgeToken:api.actor.judgeToken,rows:[row('final-pattern')]});
 assert.deepEqual(api.db.prepare('SELECT * FROM scores ORDER BY id').all(),allFull,'cannot add a fifth vote to a completed panel');
 const before=api.db.prepare('SELECT * FROM scores ORDER BY id').all();
 await api.rpc('updateCompetitionAdminSettings',{code:'KCAC',currentRound:'예선',isActive:true},api.actor);
 const prelim=await api.rpc('getRanking','KCAC',api.actor,'예선');assert.equal(prelim.ranking.length,0);
 assert.deepEqual(api.db.prepare('SELECT * FROM scores ORDER BY id').all(),before);
 console.log('Stage261: four assigned heads, 60+60+20+20=160, immediate ranking, wrong-area/duplicate rejection, own-only correction, phase isolation passed.');
}finally{api.close();}
