import {createRpcFixture} from './rpc-fixture.mjs';

export async function createMocDebriefFixture() {
  const api=await createRpcFixture();
  const players=[
    {id:168,name:'QA 정확한 선수',phone:'01088880001',prelim:'177',main:'2',final:'1'},
    {id:177,name:'QA 다른 선수',phone:'01088880002',prelim:'168'},
    {id:132,name:'QA 기록 없음',phone:'01088880003',prelim:'132'},
    {id:5,name:'QA 번호 없음',phone:'01088880004'},
    {id:500,name:'QA 본선 타인',phone:'01088880005',prelim:'21',main:'177'},
    {id:501,name:'QA 결선 타인',phone:'01088880006',prelim:'22',final:'177'},
    {id:502,name:'QA 정확한 선수의 동료',phone:'01088880001',prelim:'23'}
  ];
  for(const p of players)api.db.prepare('INSERT INTO participants(id,competition_code,name,phone,unique_no,prelim_cup_no,main_cup_no,final_cup_no,extra_json) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(p.id,'MOC',p.name,p.phone,p.prelim||'',p.prelim||'',p.main||'',p.final||'',JSON.stringify({비고:'QA 정확한 선수',예선참가번호:'5'}));
  function score(code,round,unit,total,time,status='검수완료',mode='',stamp='2026-09-14T01:00:00Z'){
    const extra={'정답수':Math.min(4,total),'가산점':Math.max(0,total-4),'총점':total,'종료시간':time,'종합코멘트':`${round} ${unit} 고유 기록. 관련 없는 숫자 132, 5`};
    api.db.prepare('INSERT INTO scores(submitted_at,competition_code,round,judge_name,role,mode,unit,total_score,review_status,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(stamp,code,round,'QA 운영진','운영진',mode,unit,total,status,JSON.stringify({competitionCode:code,round,mode,rows:[{data:[unit],extraFields:extra}]}));
  }
  score('MOC','예선','177',2,'02분 50초','검수완료','','2026-09-14T00:00:00Z');
  score('MOC','예선','177',3,'02분 25초','수정완료');
  score('MOC','예선','168',5,'02분 44초');
  score('MOC','예선','5',5,'01분 00초');
  score('MOC','예선','23',4,'03분 00초');
  score('MOC','본선','177',7,'01분 30초');
  score('MOC','결선','177',7,'01분 20초');
  score('MOC','본선','2',6,'02분 00초');
  score('MOC','결선','1',5,'03분 00초');
  score('MOC','예선','177',5,'00분 01초','미검수','','2026-09-14T02:00:00Z');
  score('MOC','예선','177',5,'00분 01초','검수완료','켈리브레이션','2026-09-14T03:00:00Z');
  score('MOB','예선','177',99,'01분 00초');
  async function publicView(p=players[0],name=p.name){
    api.db.prepare('INSERT INTO otps(competition_code,name,phone,otp,expires_at) VALUES(?,?,?,?,?)')
      .run('MOC',name,p.phone,'217217','2099-01-01T00:00:00.000Z');
    return (await (await api.handle({action:'verifyOTP',args:[name,p.phone,'MOC','217217']})).json());
  }
  return Object.assign(api,{players,publicView});
}
