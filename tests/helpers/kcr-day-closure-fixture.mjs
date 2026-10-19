import {seedKcrStations,stationSubmission} from './kcr-station-fixture.mjs';
export async function seedKcrDayClosure(api) {
  const seeded=await seedKcrStations(api);
  const stations=seeded.stations.map((s,i)=>({...s,prelimDay:i===2?2:1,...(i===2?{start:114,end:115}:{})}));
  for(const unit of [114,115])await api.rpc('upsertParticipant',{competitionCode:'KCR',name:'2일차 선수 '+unit,uniqueNo:String(unit),prelimCupNo:String(unit)},api.actor);
  const save=(closedPrelimDays,actor=api.actor,list=stations)=>api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'예선',isActive:true,optionSettings:{kcrProcesses:{blending:true},kcrStations:{stations:list,byRound:{예선:list,결선:seeded.stations},closedPrelimDays}}},actor);
  await save([]);
  for(const judge of seeded.judges){
    await api.rpc('submitScores',stationSubmission(judge,stations[0],21,true));
    await api.rpc('submitScores',stationSubmission(judge,stations[1],28));
  }
  return {...seeded,stations,save};
}
