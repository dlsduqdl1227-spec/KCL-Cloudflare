import {seedKcrStations,stationSubmission} from './kcr-station-fixture.mjs';
export async function seedKcrComparison(api){
  const seeded=await seedKcrStations(api),{stations,judges}=seeded;
  const extra={...stations[0],id:'other-cal',prefix:'D',label:'스테이션 4'};
  stations.push(extra);
  await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'예선',isActive:true,optionSettings:{kcrProcesses:{blending:true},kcrStations:{stations,byRound:{예선:stations,결선:stations}}}},api.actor);
  const addHead=async(name,phone)=>{
    await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name,phone,access:'KCR',role:'센서리 헤드 심사위원'},api.actor);
    return api.rpc('judgeLogin',name,phone);
  };
  const head2=await addHead('QA 두 번째 헤드','01088770004');
  const outsider=await addHead('QA 다른 스테이션 헤드','01088770005');
  const freshHead=await addHead('QA 제출 전 헤드','01088770006');
  for(const [actor,score] of [[judges[0],3],[head2,4],[judges[1],5]]){
    for(const [station,calibration] of [[stations[0],true],[stations[1],false]]){
      const payload=stationSubmission(actor,station,score*7,calibration);
      payload.rows.forEach(row=>Object.assign(row.extraFields,{
        'Flavor(플레이버)':score,'Aftertaste(에프터테이스트)':score,'Acidity(산미)':score,'Sweetness(단맛) ×2':score,'Mouthfeel(마우스필)':score,'Overall(오버롤)':score,
        'Flavor 코멘트':actor.name+' 플레이버 기록',종합코멘트:actor.name+' '+(calibration?'켈리':'대회')+' 기록'
      }));
      await api.rpc('submitScores',payload);
    }
  }
  await api.rpc('submitScores',stationSubmission(outsider,extra,42,true));
  await api.rpc('submitScores',stationSubmission(outsider,stations[2],42));
  return {...seeded,head2,outsider,freshHead};
}
