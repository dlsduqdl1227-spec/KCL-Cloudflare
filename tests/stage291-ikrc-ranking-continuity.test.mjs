import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedIkrcFinal,ikrcFinalSubmission} from './helpers/ikrc-final-fixture.mjs';

test('legacy rows using the current final round still resolve the head and all five sensory accounts',async()=>{
  const api=await createRpcFixture();
  try{
    const {judges,stations}=await seedIkrcFinal(api);
    const ids=judges.map(j=>j.operatorRows.find(r=>r.access==='IKRC').rowIndex);
    api.db.prepare('INSERT INTO system_settings(setting_key,setting_value,updated_at) VALUES(?,?,?)').run('ikrc_final_judge_roster',JSON.stringify({headOperatorId:ids[0],sensoryOperatorIds:ids.slice(1)}),new Date().toISOString());
    for(let i=0;i<judges.length;i++)await api.rpc('submitScores',ikrcFinalSubmission(judges[i],stations[0],i?6+i/10:10));
    for(const row of api.db.prepare("SELECT id,payload_json,judge_name FROM scores WHERE competition_code='IKRC'").all()){
      const payload=JSON.parse(row.payload_json);delete payload.round;delete payload.currentRound;delete payload.roundName;
      api.db.prepare('UPDATE scores SET round=?,role=?,payload_json=? WHERE id=?').run('',row.judge_name===judges[0].name?'심사위원':'센서리 심사위원',JSON.stringify(payload),row.id);
    }
    const snapshot=JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE competition_code='IKRC' ORDER BY id").all());
    const result=await api.rpc('getRanking','IKRC',api.actor,'결선'),first=result.ranking.find(r=>r.unit==='A-1');
    assert.equal(first.avgScore,63);assert.equal(first.confirmedJudgeCount,5);assert.equal(first.headCount,1);assert.ok(!first.sensoryJudgeNames.includes(judges[0].name));assert.equal(first.panelComplete,true);
    const detail=await api.rpc('getRankingDetail','IKRC','A-1','결선',api.actor);assert.equal(detail.rows.length,5);assert.equal(detail.comparisonRows.length,1);
    const monitor=await api.rpc('getIkrcOfficialCalibrationResultsByCup','A-1',{scope:'station',stationId:stations[0].id},judges[0]);assert.equal(monitor.finalAverage,63);assert.equal(monitor.judgeCount,5);
    assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE competition_code='IKRC' ORDER BY id").all()),snapshot);
  }finally{api.close();}
});

const html=fs.readFileSync(new URL('../public/assessment/index.html',import.meta.url),'utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0);const next=html.slice(start+1).search(/\nfunction\s/);return html.slice(start,start+1+next);}
function rankingUi(code='IKRC'){
  const elements={},rendered=[],callbacks={},draft={value:'6.5',comment:'진행 중 평가 원문'};
  const stale={success:true,compCode:code,selectedRound:'결선',ranking:[{round:'결선',unit:'A-1',avgScore:90,rankingScore:90}]};
  const chain={withSuccessHandler(fn){callbacks.success=fn;return this;},withFailureHandler(fn){callbacks.failure=fn;return this;},getRanking(){}};
  const c=vm.createContext({_rankingRequestToken:0,_rankingDetailRequestToken:0,_rankingContext:null,_ranking:null,_rankingDetail:null,_selComp:{code,currentRound:'결선'},_rankingCacheByCode:{[code+'::결선']:stale},
    document:{getElementById:id=>id==='ikrc-score-slider'?draft:(elements[id]||(elements[id]={value:'결선',hidden:false,remove(){},innerHTML:''}))},
    normalizeRoundForCompetition_:(_code,round)=>round,usesSharedFinalRules_:()=>false,adminRoundOptionsHtml_:()=>'',canPrintRanking:()=>false,competitionRoundLabel_:(_code,round)=>round,
    renderRanking:r=>{rendered.push(r);},showPanel(){},showOverlay(){},hideOverlay(){},adminActorPayload_:()=>({judgeToken:'local-ranking-qa'}),setTimeout:fn=>{callbacks.timeout=fn;return 1;},clearTimeout(){},google:{script:{run:chain}},localStorage:{setItem(){throw new Error('ranking must never write evaluation drafts');},clear(){throw new Error('ranking must never clear evaluation drafts');}}});
  vm.runInContext(fn('rankingScopedResponse_'),c);vm.runInContext(fn('goRankingByCode'),c);
  return {c,elements,rendered,callbacks,draft};
}
test('IKRC refresh never keeps a cached head-inclusive ranking on failure or timeout',()=>{
  for(const failure of ['failure','timeout']){
    const {c,elements,rendered,callbacks,draft}=rankingUi();
    c.goRankingByCode('IKRC','IKRC','결선');
    assert.equal(rendered.length,0,'old numeric results must wait for a fresh sensory-only response');assert.equal(c._ranking,null);assert.equal(elements['ranking-list'].innerHTML,'');
    callbacks[failure](new Error('네트워크 지연'));assert.equal(rendered.length,0);assert.equal(c._ranking,null);assert.match(elements['rank-summary-sub'].textContent,/실패|지연/);
    assert.equal(draft.value,'6.5');assert.equal(draft.comment,'진행 중 평가 원문');
  }
});
test('fresh sensory rankings render successfully and other competitions retain their existing cache behavior',()=>{
  const u=rankingUi();u.c.goRankingByCode('IKRC','IKRC','결선');
  u.callbacks.success({success:true,compCode:'IKRC',selectedRound:'결선',ranking:[{round:'결선',unit:'A-1',avgScore:63,rankingScore:66,seedBonus:3}]});
  assert.equal(u.c._ranking.ranking[0].avgScore,63);assert.equal(u.rendered.at(-1).ranking[0].rankingScore,66);assert.equal(u.draft.value,'6.5');
  const kcr=rankingUi('KCR');kcr.c.goRankingByCode('KCR','KCR','결선');assert.equal(kcr.rendered.length,1);assert.equal(kcr.rendered[0].ranking[0].avgScore,90);
});
