export const kbcMainNames = ['김다정','여재혁','우희영','김시율','윤여원','주위림','한소영','권순우','박재성','한윤호','최준호','고경민','임찬호','조세윤','최수빈','박수민','조민준','이주용','여상원','이영찬'];
export async function seedKbcTimetable(api) {
  await api.rpc('updateCompetitionAdminSettings',{code:'KBC',currentRound:'본선',isActive:true},api.actor);
  for(let i=0;i<20;i++) await api.rpc('upsertParticipant',{
    competitionCode:'KBC',uniqueNo:String(100+i),prelimCupNo:String(100+i),mainCupNo:String(i+1),
    name:kbcMainNames[i],affiliation:'보존할 소속 '+i,phone:'0108800'+String(i).padStart(4,'0'),
    extra:{'예선일':'2026-08-19',roundSchedules:{예선:{date:'2026-08-19'}},memo:'보존할 등록정보'}
  },api.actor);
  await api.rpc('upsertParticipant',{competitionCode:'KBC',uniqueNo:'999',name:'예선만 참가',phone:'01088999999',extra:{memo:'제외하되 보존'}},api.actor);
}
