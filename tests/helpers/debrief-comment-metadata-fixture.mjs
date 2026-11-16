import {createAllDebriefFixture} from './all-debrief-fixture.mjs';

export const commentMetadata={
 '종합코멘트 사용여부':'AI 자동 생성 사용',
 '종합 코멘트 사용 여부':'자동 생성 사용 안 함 · 직접 입력',
 'AI 코멘트 생성 방식':'AI 자동 생성',
 'Flavor 자동생성상태':JSON.stringify({generatedComment:'INTERNAL_GENERATION_STATE',commentTouched:false}),
 'Mouthfeel Comment State':'INTERNAL_COMMENT_STATE',
 overallCommentEnabled:true,
 autoCommentEnabled:false,
 commentEdited:true,
 commentTouched:false,
 'generated_comment_state':{source:'INTERNAL_COMMENT_SOURCE'},
 commentMeta:{mode:'INTERNAL_COMMENT_MODE'}
};
export const authoredComment='오렌지가 첫인상을 이룹니다.\n\n달콤한 여운과 매끄러운 질감이 느껴졌습니다.';

export async function createCommentMetadataFixture(){
 const api=await createAllDebriefFixture();
 for(const row of api.db.prepare('SELECT id,payload_json FROM scores').all()){
  const payload=JSON.parse(row.payload_json);
  for(const item of payload.rows||[])item.extraFields={...item.extraFields,...commentMetadata,'종합코멘트':authoredComment,'Flavor 코멘트':'선명한 오렌지와 캐러멜이 느껴졌습니다.','Flavor 스마트태그':'오렌지, 캐러멜'};
  api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(payload),row.id);
 }
 api.db.prepare('UPDATE competitions SET debriefing=1').run();
 return api;
}
