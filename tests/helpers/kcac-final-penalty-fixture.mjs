import assert from 'node:assert/strict';
import {createRpcFixture} from './rpc-fixture.mjs';

export async function createKcacFinalPenaltyFixture(penalties=[2,2,2,2]){
  const api=await createRpcFixture();
  try{
    await api.rpc('upsertParticipant',{competitionCode:'KCAC',name:'QA 결선 선수',phone:'01070001111',uniqueNo:'1',prelimCupNo:'1',finalCupNo:'1'},api.actor);
    await api.rpc('updateCompetitionAdminSettings',{code:'KCAC',currentRound:'결선',isActive:true,debriefing:true,optionSettings:{kcacFinalPanelMode:'split-four-heads-160'}},api.actor);
    const roles=['패턴디자인 헤드 심사위원','패턴디자인 헤드 심사위원','일반우유 센서리 헤드 심사위원','오트 센서리 헤드 심사위원'];
    const types=['final-pattern','final-pattern','sensory-regular','sensory-oat'];
    for(let i=0;i<4;i++){
      const name='QA 결선 헤드 '+i,phone='0107000000'+i;
      await api.rpc('upsertOperatorAccount',{name,phone,access:'KCAC',accountType:'JUDGE',role:roles[i]},api.actor);
      const actor=await api.rpc('judgeLogin',name,phone),pattern=i<2;
      const fields=pattern?['Theme Expression(주제 표현력)','Technical Execution(작업 수행 완성도)','Cleanliness(청결)','Surface Quality(표면 품질)','Position & Symmetry(위치와 대칭)','Design Completion(디자인 완성도)']:['Taste Balance(맛의 균형)','Mouthfeel(질감)','Presentation(프레젠테이션)'];
      const result=await api.rpc('submitScores',{competitionCode:'KCAC',round:'결선',judgeToken:actor.judgeToken,mode:'judge',rows:[{data:['1'],extraFields:{...Object.fromEntries(fields.map(key=>['결선 '+key,4])),잔용도:pattern?'창작패턴평가':'센서리용아트',패턴종류:types[i],시간감점:penalties[i],종합코멘트:'QA 원문 '+types[i]}}]});
      assert.equal(result.success,true);
    }
    const snapshot=()=>JSON.stringify(['scores','participants','operators','competitions'].map(table=>api.db.prepare('SELECT * FROM '+table+' ORDER BY id').all()));
    return {...api,snapshot};
  }catch(error){api.close();throw error;}
}
