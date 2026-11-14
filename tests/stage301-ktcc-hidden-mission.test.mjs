import test from 'node:test';
import assert from 'node:assert/strict';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
const rule='히든미션: 5컵 중 다른 컵 1개 찾기 (정답 4점 / 오답 0점)';
for(const [name,s3,wrong,expected] of [['correct',1,false,7],['incorrect',0,false,3],['invalid',1,true,3],['out-of-range',2,false,3],['legacy',2,false,7]])test('KTCC hidden mission '+name+' retains other sections and uses only the authorized rule',async()=>{
 const api=await createRpcFixture();try{
  await api.rpc('upsertParticipant',{competitionCode:'KTCC',name:'미션 테스트팀',teamName:'미션 테스트팀',uniqueNo:'1',finalCupNo:'1'},api.actor);
  await api.rpc('updateCompetitionAdminSettings',{code:'KTCC',currentRound:'결선',isActive:true},api.actor);
  const theme=name==='legacy'?'기존 Section3':rule;
  await api.rpc('submitScores',{competitionCode:'KTCC',round:'결선',judgeToken:api.actor.judgeToken,judgeName:api.actor.name,judgeRole:'운영진',rows:[{data:['1','미션 테스트팀','주제','2개',2,'주제','1개',1,theme,String(s3)+'개',s3,99,99,'04:00'],extraFields:{'토너먼트 단계':'8강','Section3 전체오답(Y/N)':wrong?'Y':'N'}}]});
  const rows=api.db.prepare("SELECT * FROM scores WHERE competition_code='KTCC'").all();assert.equal(rows.length,1);assert.equal(rows[0].total_score,expected);
  const list=await api.rpc('getReviewList','KTCC',api.actor);await api.rpc('updateReviewStatusBatch','KTCC',list.list.map(r=>r.rowIndex),'검수완료','관리자',api.actor);
  const ranking=await api.rpc('getRanking','KTCC',api.actor,'결선');assert.equal(ranking.ranking[0].totalScore,expected);
 }finally{api.close();}
});

test('administrator login requires a private environment secret',async()=>{
 const api=await createRpcFixture();try{
  const secret=api.env.KCL_ADMIN_SECRET_CODE;delete api.env.KCL_ADMIN_SECRET_CODE;
  const denied=await (await api.handle({action:'adminLogin',args:['01099990000','local-qa-only',secret]})).json();
  assert.equal(denied.success,false);assert.match(denied.message,/보안 설정/);
  api.env.ADMIN_SECRET_CODE=secret;
  assert.equal((await api.rpc('adminLogin','01099990000','local-qa-only',secret)).success,true);
 }finally{api.close();}
});
