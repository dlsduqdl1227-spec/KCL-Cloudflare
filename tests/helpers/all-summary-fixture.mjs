import {createAllDebriefFixture} from './all-debrief-fixture.mjs';

export async function createAllSummaryFixture(){
  const api=await createAllDebriefFixture();
  try{
    api.db.prepare('UPDATE competitions SET debriefing=1').run();
    const insert=api.db.prepare('INSERT INTO scores(competition_code,round,unit,role,judge_name,review_status,mode,total_score,submitted_at,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)');
    for(const c of api.cases.filter(item=>item.code!=='IKRC'))for(const [i,round]of c.rounds.entries()){
      const row=api.db.prepare("SELECT * FROM scores WHERE competition_code=? AND round=? AND unit=? AND mode='' ORDER BY id LIMIT 1").get(c.code,round,c.units[i]);
      if(!row)throw Error('Missing summary fixture row '+c.code+' '+round);
      for(let judge=0;judge<2;judge++){
        const payload=JSON.parse(row.payload_json),extra=payload.rows[0].extraFields;
        extra.종합코멘트=c.code+' '+round+' '+(judge?'두번째':'첫번째')+' 심사 원문입니다.';
        let role='센서리 심사위원';
        if(c.code==='KCAC'){
          const final=round==='결선';role='패턴디자인 헤드 심사위원';
          extra.잔용도=final?'창작패턴평가':'패턴평가';extra.패턴종류=final?'final-pattern':judge?'slow':'fast';
          extra[(final?'결선 Theme Expression':'예선 Pattern Definition')+' 스마트태그']=judge?'라인 명확, 중심축 안정':'라인 명확, 여백 보완';
          extra[final?'결선 Theme Expression(주제 표현력)':'예선 Pattern Definition(패턴 선명도)']=3+judge*.2;
          extra.시간감점=0;
        }else if(c.code==='KBC'){
          extra['Espresso Flavor 스마트태그']=judge?'오렌지, 곡물':'오렌지, 당밀';extra['Espresso Flavor(플레이버)']=3+judge*.2;
          extra['Espresso Mouthfeel 스마트태그']='크리미한';extra['Espresso Mouthfeel(마우스필)']=2;
          if(round==='결선'){extra['Signature Flavor 스마트태그']='시그니처 레몬';extra['Signature Flavor(플레이버)']=4;}
        }else if(c.code!=='KTCC'){
          extra['Flavor 스마트태그']=judge?'오렌지, 곡물':'오렌지, 당밀';extra['Flavor(플레이버)']=3+judge*.2;
          extra['Acidity 스마트태그']='선명한';extra['Acidity(산미)']=2;
          extra['Mouthfeel 스마트태그']='크리미한';
          if(c.code==='MOB'&&round==='결선'){extra.메뉴='창작';extra['Creative Flavor 스마트태그']='창작 레몬';extra['Creative Flavor(창작 향미)']=4;}
        }
        if(judge)insert.run(c.code,round,c.units[i],role,'QA 두번째 심사','검수완료','',row.total_score,'2026-09-14T00:01:00Z',JSON.stringify(payload));
        else api.db.prepare('UPDATE scores SET role=?,payload_json=? WHERE id=?').run(role,JSON.stringify(payload),row.id);
      }
    }
    const snapshot=()=>JSON.stringify(['scores','participants','operators','competitions'].map(table=>api.db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()));
    async function publicRound(c,round){
      api.db.prepare('INSERT INTO otps(competition_code,name,phone,otp,expires_at) VALUES(?,?,?,?,?)').run(c.code,c.name,c.phone,'314314','2099-01-01T00:00:00Z');
      return api.rpc('verifyOTP',c.name,c.phone,c.code,'314314',round);
    }
    return Object.assign(api,{snapshot,publicRound});
  }catch(error){api.close();throw error;}
}
