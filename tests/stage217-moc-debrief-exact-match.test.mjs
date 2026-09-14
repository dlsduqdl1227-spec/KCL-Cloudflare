import assert from 'node:assert/strict';
import {createMocDebriefFixture} from './helpers/moc-debrief-fixture.mjs';

const api=await createMocDebriefFixture();
const originalScores=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
const originalPlayers=JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all());
try{
  const closed=await api.publicView();assert.equal(closed.success,false);assert.match(closed.message,/공개 전/);
  const previews=[];
  for(const [round,unit,score] of [['예선','177',3],['본선','2',6],['결선','1',5]]){
    const res=await api.rpc('getAdminDebriefPreview','MOC',unit,round,api.actor);
    assert.equal(res.scores.length,1);assert.equal(res.rankInfo.totalScore,score);previews.push(res);
    const rank=(await api.rpc('getRanking','MOC',api.actor,round)).ranking.find(x=>x.unit===unit);
    assert.deepEqual(res.rankInfo,rank,'debriefing must preserve the official rank and score');
  }
  assert.equal(api.db.prepare("SELECT debriefing FROM competitions WHERE code='MOC'").get().debriefing,0,'preview does not publish');
  api.db.prepare("UPDATE competitions SET debriefing=1 WHERE code='MOC'").run();
  const publicView=await api.publicView();assert.equal(publicView.success,true);
  assert.equal(publicView.scores.length,3);
  assert.deepEqual(publicView.scores,previews.flatMap(x=>x.scores),'public/preview share identical full score objects');
  assert.deepEqual(publicView.rankInfos,previews.flatMap(x=>x.rankInfos));
  assert.deepEqual(publicView.playerInfo.identifiers,['177','2','1'],'never include internal ID 168');
  for(const i of [2,3]){
    const empty=await api.publicView(api.players[i]);assert.equal(empty.success,true);
    assert.deepEqual(empty.scores,[]);assert.deepEqual(empty.rankInfos,[]);assert.equal(empty.rankInfo,null);
  }
  const other=await api.publicView(api.players[1]);assert.equal(other.scores.length,1);
  assert.equal(other.scores[0]['참가자번호'],'168');assert.equal(other.scores[0].round,'예선');
  const partial=await api.publicView(api.players[0],'QA 정확한');assert.equal(partial.success,false,'same phone plus a partial name or extra metadata cannot match another identity');
  const wrongSend=await(await api.handle({action:'sendOTP',args:['QA 정확한',api.players[0].phone,'MOC']})).json();
  assert.equal(wrongSend.success,false);assert.match(wrongSend.message,/등록된 선수/);
  const invalid=await(await api.handle({action:'getAdminDebriefPreview',args:['MOC','177','본·결선',api.actor]})).json();assert.equal(invalid.success,false);
  const denied=await(await api.handle({action:'getAdminDebriefPreview',args:['MOC','177','예선',{}]})).json();assert.equal(denied.success,false);
  const afterRank=(await api.rpc('getRanking','MOC',api.actor,'예선')).ranking;
  assert.equal(afterRank.find(x=>x.unit==='177').totalScore,3);
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),originalScores,'all competitions, comments, statuses and scores are unchanged');
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM participants ORDER BY id').all()),originalPlayers);
  console.log('Stage217 MOC exact identity/round matching, missing results, ID collisions, partial searches, calibration exclusion, public/preview parity and original-record preservation passed.');
}finally{api.close();}
