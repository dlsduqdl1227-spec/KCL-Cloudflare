import {createRpcFixture} from './rpc-fixture.mjs';

export async function createKtccHiddenFixture(){
  const api=await createRpcFixture();
  const actors={admin:api.actor};
  const accounts=[['lead','TEAMLEAD','KTCC','대회팀장'],['staff','STAFF','KTCC','운영진'],['head','JUDGE','KTCC','헤드 심사위원'],['foreign','TEAMLEAD','MOC','대회팀장']];
  for(const [i,[name,accountType,access,role]]of accounts.entries()){
    const phone='0107869000'+i;
    await api.rpc('upsertOperatorAccount',{accountType,name,phone,access,role},api.actor);
    actors[name]=await api.rpc('judgeLogin',name,phone);
  }
  // A different contest's lead is a KTCC staff member, not a KTCC manager.
  await api.rpc('upsertOperatorAccount',{accountType:'STAFF',name:'foreign',phone:'01078690003',access:'KTCC',role:'운영진'},api.actor);
  actors.foreign=await api.rpc('judgeLogin','foreign','01078690003');
  for(let i=1;i<=3;i++)await api.rpc('upsertParticipant',{competitionCode:'KTCC',name:'미션 팀 '+i,teamName:'미션 팀 '+i,phone:'0107877000'+i,uniqueNo:String(i),prelimCupNo:String(i),finalCupNo:String(i)},api.actor);
  const payload=(unit,round='결선',stage='8강',s2=1)=>({competitionCode:'KTCC',round,judgeToken:actors.staff.judgeToken,judgeName:actors.staff.name,judgeRole:'운영진',
    rows:[{data:[String(unit),'미션 팀 '+unit,'동일 컵','2개',2,'동일 컵',String(s2)+'개',s2,'동일 컵','2개',2,2,6+s2,'04분 12.34초','data:image/png;base64,AA==','N'],extraFields:{'토너먼트 단계':stage,'종합코멘트':'기존 기록은 유지','진출판정':''}}]});
  for(const round of ['예선','결선']){
    await api.rpc('updateCompetitionAdminSettings',{code:'KTCC',currentRound:round,isActive:true},api.actor);
    await api.rpc('submitScores',payload(1,round));await api.rpc('submitScores',payload(2,round,'8강',2));
  }
  api.db.prepare("UPDATE scores SET review_status='검수완료' WHERE competition_code='KTCC' AND round='예선'").run();
  const raw=async(action,...args)=>(await api.handle({action,args})).json();
  const find=(unit,round='결선')=>api.db.prepare('SELECT * FROM scores WHERE competition_code=? AND round=? AND unit=? ORDER BY id DESC').get('KTCC',round,String(unit));
  return Object.assign(api,{actors,payload,raw,find});
}
