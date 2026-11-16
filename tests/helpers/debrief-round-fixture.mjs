import {createCommentMetadataFixture} from './debrief-comment-metadata-fixture.mjs';

export const roundMarkers={예선:'PRELIMINARY_ONLY',본선:'MAIN_ONLY',결선:'FINAL_ONLY'};
export async function createDebriefRoundFixture(){
 const api=await createCommentMetadataFixture();
 for(const c of api.cases.filter(c=>['KBC','MOC'].includes(c.code)))for(const [index,round]of c.rounds.entries()){
  const row=api.db.prepare("SELECT * FROM scores WHERE competition_code=? AND round=? AND unit=? AND mode='' ORDER BY id LIMIT 1").get(c.code,round,c.units[index]);
  const payload=JSON.parse(row.payload_json);payload.rows[0].extraFields.종합코멘트=roundMarkers[round]+' '+c.code+' 심사 의견입니다.';
  api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(payload),row.id);
  if(c.code==='KBC')for(let judge=2;judge<=4;judge++)api.db.prepare('INSERT INTO scores(competition_code,round,unit,role,judge_name,review_status,mode,total_score,submitted_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)')
   .run(c.code,round,c.units[index],row.role,'QA KBC 심사 '+judge,row.review_status,row.mode,row.total_score,row.submitted_at,JSON.stringify(payload));
 }
 await api.rpc('upsertOperatorAccount',{name:'라운드 확인 팀장',phone:'01088003090',accountType:'TEAMLEAD',role:'팀장',access:'KBC,MOC'},api.actor);
 api.previewLead=await api.rpc('judgeLogin','라운드 확인 팀장','01088003090');
 return api;
}
