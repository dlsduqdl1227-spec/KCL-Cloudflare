export async function seedIkrcFinal(api) {
 const stations=['A','B'].map((prefix,i)=>({id:'station'+(i+1),label:prefix+'조',prefix,start:1,end:6,useForCalibration:true,useForCompetition:true}));
 await api.rpc('updateCompetitionAdminSettings',{code:'IKRC',currentRound:'결선',isActive:true,debriefing:false,optionSettings:{ikrcStations:{stations,byRound:{결선:stations}}}},api.actor);
 for(let i=1;i<=12;i++)await api.rpc('upsertParticipant',{competitionCode:'IKRC',name:'결선 선수 '+i,affiliation:'로스터스 '+i,phone:'010800000'+String(i).padStart(2,'0'),uniqueNo:String(i),prelimCupNo:String(i),finalCupNo:String(i),extra:{ikrcBlindAssignments:{예선:'P-'+i,결선:(i<=6?'A-':'B-')+((i-1)%6+1)},roundSchedules:{결선:{order:13-i}}}},api.actor);
 await api.rpc('upsertParticipant',{competitionCode:'IKRC',name:'예선만 참가',uniqueNo:'13',prelimCupNo:'13'},api.actor);
 const judges=[];
 for(let i=0;i<6;i++){
  const name='동일 심사위원 '+i,phone='0108800000'+i,role=i?'센서리 심사위원':'센서리 헤드 심사위원';
  await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',name,phone,access:'IKRC',role,teamGroup:'A조'},api.actor);
  judges.push(await api.rpc('judgeLogin',name,phone));
 }
 const participants=api.db.prepare("SELECT * FROM participants WHERE competition_code='IKRC' AND final_cup_no<>'' ORDER BY id").all();
 return {stations,judges,participants};
}
export function ikrcFinalSubmission(actor,station,value=6,mode='judge') {
 return {competitionCode:'IKRC',round:'결선',judgeToken:actor.judgeToken,judgeName:actor.name,judgeRole:actor.role,mode,stationId:station.id,stationPrefix:station.prefix,stationLabel:station.label,
  rows:Array.from({length:6},(_,i)=>({data:[station.prefix+'-'+(i+1),value,4,value,4,value,4,value,4,value,4,'원본 코멘트',value*10,'N','미검수'],extraFields:{'Flavor 스마트태그':'자두','Mouthfeel 스마트태그':'실키',종합코멘트:'원본 코멘트'}}))};
}
