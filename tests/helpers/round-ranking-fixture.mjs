export const competitionCodes = ['KBC','MOC','MOB','KCAC','KCR','IKRC','KTCC'];
export const roundsFor = code => ['KBC','MOC'].includes(code) ? ['예선','본선','결선'] : ['예선','결선'];

// Real submissions into the disposable RPC fixture, never the live service.
export async function seedRoundRankings(api) {
  for (const code of competitionCodes) {
    await api.rpc('upsertParticipant', {competitionCode:code,name:code+' QA 선수',phone:'01012341234',uniqueNo:'1',prelimCupNo:'1',mainCupNo:'1',finalCupNo:'1'},api.actor);
    const station = {id:'station1',label:'스테이션 1',prefix:code==='IKRC'?'A':'KCR',start:1,end:1,useForCompetition:true,useForCalibration:true,process:'Blending'};
    const options = code==='IKRC' ? {ikrcStations:{byRound:{예선:[station],결선:[station]},stations:[station]}}
      : code==='KCR' ? {kcrProcesses:{blending:true},kcrStations:{byRound:{예선:[station],결선:[station]},stations:[station]}} : {};
    for (const round of roundsFor(code)) {
      await api.rpc('updateCompetitionAdminSettings',{code,currentRound:round,isActive:true,debriefing:false,optionSettings:options},api.actor);
      const unit=code==='IKRC'?'A-1':'1';
      const score=round==='예선'?20:round==='본선'?30:40;
      const extra={총점:score,종합코멘트:code+' '+round+' 독립 기록',점수잠금:'{"score":true}'};
      if(code==='MOC')Object.assign(extra,{정답수:round==='예선'?4:round==='본선'?5:6,가산점:0,종료시간:'04:30'});
      if(code==='KTCC')Object.assign(extra,{'Section1 정답수':round==='예선'?1:2,'Section2 정답수':1,'Section3 정답수':1,종료시간:'04:30.20'});
      if(code==='KCAC')extra['잔용도']=round==='예선'?'예선 패턴평가':'창작패턴평가';
      await api.rpc('submitScores',{
        competitionCode:code,round,judgeToken:api.actor.judgeToken,judgeName:api.actor.name,
        judgeRole:'센서리 헤드 심사위원',mode:'judge',stationId:station.id,stationLabel:station.label,
        stationPrefix:station.prefix,stationProcess:'Blending',stationSampleCount:1,
        rows:[{data:code==='KCR'?[unit,'Blending']:[unit],extraFields:extra}]
      });
    }
    const list=await api.rpc('getReviewList',code,{...api.actor,reviewScope:'manage',manageReview:true});
    await api.rpc('updateReviewStatusBatch',code,list.list.map(row=>row.rowIndex),'검수완료','관리자',api.actor);
  }
}
