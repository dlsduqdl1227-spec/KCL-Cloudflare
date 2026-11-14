import {createAllDebriefFixture} from './all-debrief-fixture.mjs';
export async function createMocManualFinalFixture(options={}){
  const api=await createAllDebriefFixture(options),moc=api.cases.find(c=>c.code==='MOC');
  const entries=Array.from({length:10},(_,i)=>({rank:i+1,name:'MOC 수기 테스트 선수 '+(i+1)}));
  for(const [i,e] of entries.entries())await api.rpc('upsertParticipant',{competitionCode:'MOC',name:e.name,phone:moc.phone,uniqueNo:String(501+i),mainCupNo:String(301+i),finalCupNo:String(110-i)},api.actor);
  await api.rpc('updateCompetitionAdminSettings',{code:'MOC',currentRound:'본선',isActive:true,debriefing:true},api.actor);
  const snapshot=()=>JSON.stringify(['scores','participants'].map(t=>api.db.prepare('SELECT * FROM '+t+' ORDER BY 1').all()));
  return Object.assign(api,{entries,moc,snapshot});
}
