import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommentMetadataFixture,commentMetadata,authoredComment} from './helpers/debrief-comment-metadata-fixture.mjs';

function assertPublicResponse(response,context){
 assert.equal(response.success,true,context);
 const text=JSON.stringify(response);
 for(const key of Object.keys(commentMetadata))assert.ok(!text.includes(JSON.stringify(key)+':'),context+' must not return '+key);
 assert.doesNotMatch(text,/AI 자동 생성|자동 생성 사용 안 함|INTERNAL_(?:GENERATION_STATE|COMMENT_STATE|COMMENT_SOURCE|COMMENT_MODE)/,context+' no positional metadata values');
 assert.ok(response.scores.length,context+' evaluations remain');
 assert.ok(response.scores.every(score=>score.종합코멘트===authoredComment),context+' original overall comments remain');
}

test('all seven public, admin-preview and phase-switch debriefs exclude comment configuration without changing saved data',async()=>{
 const api=await createCommentMetadataFixture();
 try{
  const stored=JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all());
  for(const c of api.cases){
   const publicView=await api.publicView(c);assertPublicResponse(publicView,c.code+' public');
   for(const [index,round]of c.rounds.entries()){
    const preview=await api.rpc('getAdminDebriefPreview',c.code,c.units[index],round,api.actor);assertPublicResponse(preview,c.code+' '+round+' preview');
    assert.deepEqual(preview.scores,publicView.scores.filter(score=>score.round===round),c.code+' public/preview parity');
   }
   for(const phase of ['예선','결선'])assertPublicResponse(await api.rpc('getDebriefPhase',publicView.debriefToken,phase),c.code+' '+phase+' switch');
  }
  assert.equal(JSON.stringify(api.db.prepare('SELECT * FROM scores ORDER BY id').all()),stored,'saved comments, settings, scores and review states are byte-identical');
 }finally{api.close();}
});
