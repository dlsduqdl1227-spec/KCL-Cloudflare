import {createRpcFixture} from './rpc-fixture.mjs';
export const debriefCodes=['KBC','KTCC','MOC','MOB','KCR','IKRC','KCAC'];
export async function createAllDebriefFixture(){
  const api=await createRpcFixture(),cases=[];
  for(const [index,code] of debriefCodes.entries()){
    const rounds=['KBC','MOC'].includes(code)?['예선','본선','결선']:['예선','결선'];
    const units=code==='IKRC'?['A-1','C-3']:rounds.map((_,i)=>String(177-i));
    const id=1000+index*100,phone='0108888'+String(index).padStart(4,'0');
    const extra=code==='IKRC'?{ikrcBlindAssignments:Object.fromEntries(rounds.map((r,i)=>[r,units[i]]))}:{'팀원 이름':'QA 팀원, QA 동료',비고:'QA 일부 이름 132'};
    function participant(pid,name,pPhone,prelim,main,final,e={}){
      api.db.prepare('INSERT INTO participants(id,competition_code,name,phone,unique_no,prelim_cup_no,main_cup_no,final_cup_no,team_name,team_no,extra_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(pid,code,name,pPhone,prelim,prelim,main,final,code==='KTCC'?name:'',code==='KTCC'?prelim:'',JSON.stringify(e));
    }
    participant(id,'QA 같은 이름',phone,'177',rounds.length===3?'176':'',rounds.length===3?'175':'176',extra);
    participant(id+1,'QA 다른 선수',phone+'1',String(id),'','','');
    participant(id+2,'QA 미평가',phone+'2','132','','');
    const mixed=[];
    function score(round,unit,total,mode='',status='검수완료',rows=null){
      const extra={'참가자번호':unit,'총점':total,'정답수':3,'가산점':1,'종료시간':'02분 00초','종합코멘트':`${code} ${round} ${unit} 개별 코멘트`};
      api.db.prepare('INSERT INTO scores(competition_code,round,unit,role,judge_name,review_status,mode,total_score,submitted_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(code,round,unit,'센서리 심사위원','QA 심사',status,mode,total,'2026-09-14T00:00:00Z',JSON.stringify({competitionCode:code,round,mode,rows:rows||[{data:[unit],extraFields:extra}]}));
    }
    rounds.forEach((round,i)=>{
      score(round,units[i],30+i);
      // Reusing the first-round number in a later round belongs to someone else.
      if(i)score(round,units[0],90);
      score(round,units[i],99,'켈리브레이션');
    });
    score('예선',String(id),99);score('예선','5',99);
    if(code==='IKRC'){
      // Same physical submission contains two different competitors.
      const rows=[{data:['A-1'],extraFields:{'참가자번호':'A-1','총점':70,'종합코멘트':'본인 기록'}},{data:['D-9'],extraFields:{'참가자번호':'D-9','총점':95,'종합코멘트':'OTHER_PRIVATE_BATCH_COMMENT'}}];
      score('예선','A-1',70,'','검수완료',rows);mixed.push('OTHER_PRIVATE_BATCH_COMMENT');
    }
    cases.push({code,id,phone,name:'QA 같은 이름',rounds,units,missingName:'QA 미평가',missingPhone:phone+'2',mixed});
  }
  async function publicView(c,name=c.name,phone=c.phone){
    api.db.prepare('INSERT INTO otps(competition_code,name,phone,otp,expires_at) VALUES(?,?,?,?,?)').run(c.code,name,phone,'219219','2099-01-01T00:00:00Z');
    return(await(await api.handle({action:'verifyOTP',args:[name,phone,c.code,'219219']})).json());
  }
  return Object.assign(api,{cases,publicView});
}
