import {seedKcrStations,stationSubmission} from './kcr-station-fixture.mjs';
export async function seedFreeCups(api){
 const seeded=await seedKcrStations(api);
 const cups=['3','18','42','77','114'];
 for(const n of [...cups,'8','20','45','80','115','150','180','192'])await api.rpc('upsertParticipant',{
  competitionCode:'KCR',name:'독립 선수 '+n,phone:'0107777'+String(n).padStart(4,'0'),
  uniqueNo:n,prelimCupNo:n,finalCupNo:n,affiliation:'확인용'
 },api.actor);
 await api.rpc('submitScores',stationSubmission(seeded.judges[0],seeded.stations[1],21));
 const config=(await api.rpc('getConfig')).configs.find(c=>c.code==='KCR');
 const finalStation={id:'final-free',label:'스테이션 1',prefix:'Z',start:1,end:1,cupNumbers:cups,process:'Blending',useForCalibration:false,useForCompetition:true};
 const second={...finalStation,id:'final-eight',prefix:'Y',cupNumbers:['192','8','20','45','80','115','150','180']};
 return {...seeded,config,cups,finalStation,second};
}
export function freeCupSubmission(judge,station,round='결선'){
 return {competitionCode:'KCR',round,judgeToken:judge.judgeToken,mode:'judge',
  stationId:station.id,stationPrefix:station.prefix,stationLabel:station.label,stationProcess:station.process,
  rows:station.cupNumbers.map((n,i)=>({data:[n,station.process],extraFields:{
   총점:28+i/10,'Flavor(플레이버)':4,'종합코멘트':round+' 독립 코멘트 '+n,'Flavor 스마트태그':'과일','점수잠금':'{"flavor":true}'
  }}))};
}
