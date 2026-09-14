export async function seedKcrStations(api) {
  const stations=[
    {id:'stable-a',label:'스테이션 1',prefix:'A',start:1,end:2,process:'Blending',useForCalibration:true,useForCompetition:false},
    {id:'stable-b',label:'스테이션 2',prefix:'B',start:1,end:2,process:'Blending',useForCalibration:false,useForCompetition:true},
    {id:'stable-c',label:'스테이션 3',prefix:'C',start:3,end:4,process:'Blending',useForCalibration:false,useForCompetition:true}
  ];
  await api.rpc('updateCompetitionAdminSettings',{code:'KCR',currentRound:'예선',isActive:true,debriefing:false,optionSettings:{kcrProcesses:{blending:true},kcrStations:{stations,byRound:{예선:stations,결선:stations}}}},api.actor);
  for(let i=1;i<=4;i++)await api.rpc('upsertParticipant',{competitionCode:'KCR',name:'KCR QA '+i,uniqueNo:String(i),prelimCupNo:String(i),finalCupNo:String(i),extra:{'대회일':'2026-09-14',custom:'보존'}},api.actor);
  const judges=[];
  for (const [i,role] of ['센서리 헤드 심사위원','센서리 심사위원'].entries()){
    const name='KCR QA '+role,phone='0108877000'+i;
    await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name,phone,access:'KCR',role,teamGroup:i?'다른 팀':'기존 팀'},api.actor);
    judges.push(await api.rpc('judgeLogin',name,phone));
  }
  await api.rpc('upsertOperatorAccount',{accountType:'TEAMLEAD',name:'KCR QA 팀장',phone:'01088770002',access:'KCR',role:'대회팀장'},api.actor);
  const lead=await api.rpc('judgeLogin','KCR QA 팀장','01088770002');
  return {stations,judges,lead};
}
export function stationSubmission(actor,station,score,calibration=false){
  return {competitionCode:'KCR',round:'예선',judgeToken:actor.judgeToken,judgeName:actor.name,judgeRole:actor.role,
    team:'클라이언트 임의 팀',mode:calibration?'KCR 전체 켈리브레이션':'judge',
    stationId:station.id,stationPrefix:station.prefix,stationLabel:station.label,stationProcess:station.process,stationSampleCount:station.end-station.start+1,
    rows:Array.from({length:station.end-station.start+1},(_,i)=>({data:[String(station.start+i),station.process],extraFields:{총점:score,'Flavor(플레이버)':score/7,종합코멘트:station.id+' 독립 코멘트',점수잠금:'{"flavor":true}'}}))};
}
