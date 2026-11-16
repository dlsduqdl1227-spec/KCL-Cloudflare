import {createKtccHiddenFixture} from './ktcc-hidden-fixture.mjs';

export async function createKtccTournamentFixture(){
  const api=await createKtccHiddenFixture();
  // Only this disposable in-memory fixture is reset, never an operating DB.
  api.db.prepare("DELETE FROM scores WHERE competition_code='KTCC' AND round='결선'").run();
  for(let i=4;i<=8;i++)await api.rpc('upsertParticipant',{competitionCode:'KTCC',name:'미션 팀 '+i,teamName:'미션 팀 '+i,phone:'0107877000'+i,uniqueNo:String(i),prelimCupNo:String(i),finalCupNo:String(i)},api.actor);
  const ids={};
  async function submit(unit,stage,points,time){
    const payload=api.payload(unit,'결선',stage,0),left=points-4,s1=Math.min(2,left),s2=left-s1;
    const row=payload.rows[0];row.data[4]=s1;row.data[7]=s2;row.data[12]=points;row.data[13]=time||'05분 00.00초';
    row.extraFields.종합코멘트=(stage||'최종')+' '+unit+' 원문 의견';
    await api.rpc('submitScores',payload);
    const stored=api.find(unit);ids[stage+'::'+unit]=stored.id;return stored.id;
  }
  for(const [index,points]of [4,7,5,5,4,6,4,4].entries())await submit(index+1,'8강',points,'06분 '+String(index+10)+'초');
  for(const [unit,points,time]of [[1,8,'05분 43초'],[2,7,'02분 06.12초'],[3,7,'06분 03.85초'],[6,4,'06분 10.13초']])await submit(unit,'4강',points,time);
  for(const [unit,mission,time]of [[1,'correct','07분 30.60초'],[2,'incorrect','05분 35.22초']]){
    const id=await submit(unit,'',6,time),current=await api.rpc('getKtccHiddenMission',{rowIndex:id},api.actors.lead);
    await api.rpc('setKtccHiddenMission',{rowIndex:id,revision:current.revision,result:mission},api.actors.lead);
  }
  // Late entry of an earlier paper sheet must not replace an actual final.
  api.db.prepare('UPDATE scores SET submitted_at=? WHERE id=?').run('2098-01-01T00:00:00Z',ids['8강::2']);
  api.db.prepare("UPDATE competitions SET debriefing=1 WHERE code='KTCC'").run();
  const snapshot=()=>JSON.stringify(['scores','participants','operators','competitions'].map(table=>api.db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()).concat([api.db.prepare("SELECT * FROM sessions WHERE kind='KTCC_HIDDEN_MISSION' ORDER BY token").all()]));
  async function player(unit,phase='결선'){
    const name='미션 팀 '+unit,phone='0107877000'+unit;
    api.db.prepare('INSERT INTO otps(competition_code,name,phone,otp,expires_at) VALUES(?,?,?,?,?)').run('KTCC',name,phone,'311311','2099-01-01T00:00:00Z');
    return api.rpc('verifyOTP',name,phone,'KTCC','311311',phase);
  }
  return Object.assign(api,{ids,snapshot,player});
}
