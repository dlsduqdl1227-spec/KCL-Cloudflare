import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedIkrcFinal,ikrcFinalSubmission} from './helpers/ikrc-final-fixture.mjs';

const html=fs.readFileSync(new URL('../public/assessment/index.html',import.meta.url),'utf8');
const debrief=fs.readFileSync(new URL('../public/debriefing/index.html',import.meta.url),'utf8');
function fn(source,name) {
  const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);
  const next=source.slice(start+1).search(/\n(?:async )?function\s/);
  return source.slice(start,next<0?source.length:start+1+next);
}
function roster(api,judges) {
  const ids=judges.map(j=>j.operatorRows.find(row=>row.access==='IKRC').rowIndex);
  api.db.prepare('INSERT INTO system_settings(setting_key,setting_value,updated_at) VALUES(?,?,?)')
    .run('ikrc_final_judge_roster',JSON.stringify({headOperatorId:ids[0],sensoryOperatorIds:ids.slice(1)}),new Date().toISOString());
}
async function setup(api,round) {
  const data=await seedIkrcFinal(api);
  await api.rpc('updateCompetitionAdminSettings',{code:'IKRC',currentRound:round,isActive:true,optionSettings:{ikrcStations:{stations:data.stations,byRound:{[round]:data.stations}}}},api.actor);
  if(round==='예선')for(const p of data.participants){
    const extra=JSON.parse(p.extra_json);extra.ikrcBlindAssignments.예선=extra.ikrcBlindAssignments.결선;
    api.db.prepare('UPDATE participants SET extra_json=? WHERE id=?').run(JSON.stringify(extra),p.id);
  }
  return data;
}
function submission(judge,station,round,values) {
  const p=ikrcFinalSubmission(judge,station,values[0]);p.round=round;
  p.rows.forEach((r,i)=>{const value=values[i]??values[0];for(const index of [1,3,5,7,9])r.data[index]=value;r.data[12]=value*10;});
  return p;
}

for(const round of ['예선','결선'])test('IKRC '+round+' ranks sensory scores only and keeps every head comparison card',async()=>{
  const api=await createRpcFixture();
  try {
    const {judges,stations}=await setup(api,round),station=stations[0];
    await api.rpc('submitScores',submission(judges[0],station,round,[10,0]));
    assert.equal((await api.rpc('getRanking','IKRC',api.actor,round)).ranking.length,0,'a head-only entry cannot receive a rank');
    const headOnly=await api.rpc('getRankingDetail','IKRC','A-1',round,api.actor);
    assert.equal(headOnly.totalScore,0);assert.equal(headOnly.avgScore,0);assert.equal(headOnly.rows.length,1);
    await api.rpc('submitScores',submission(judges[1],station,round,[6,8]));
    await api.rpc('submitScores',submission(judges[2],station,round,[8,8]));
    const saved=JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE competition_code='IKRC' ORDER BY id").all());
    const ranking=(await api.rpc('getRanking','IKRC',api.actor,round)).ranking;
    const first=ranking.find(r=>r.unit==='A-1'),second=ranking.find(r=>r.unit==='A-2');
    assert.equal(first.avgScore,70);assert.equal(first.rankingScore,70);assert.equal(first.confirmedJudgeCount,2);assert.equal(first.headCount,1);assert.equal(first.headScoreIncluded,false);
    assert.equal(second.avgScore,80);assert.ok(second.rank<first.rank,'head 100 versus 0 must not reverse the sensory ranking');
    assert.deepEqual(first.sensoryJudgeNames,[judges[1].name,judges[2].name]);
    const detail=await api.rpc('getRankingDetail','IKRC','A-1',round,api.actor);
    assert.equal(detail.avgScore,70);assert.equal(detail.totalScore,70);assert.equal(detail.rows.length,3);
    const comparison=await api.rpc('getIkrcOfficialCalibrationResultsByCup','A-1',{scope:'station',stationId:station.id},judges[0]);
    assert.equal(comparison.finalAverage,70);assert.equal(comparison.headScoreIncluded,false);assert.equal(comparison.rows.length,3);
    const preview=await api.rpc('getAdminDebriefPreview','IKRC','A-1',round,api.actor);
    assert.equal(preview.scores.length,3);assert.equal(preview.rankInfo.avgScore,70);assert.equal(preview.rankInfo.displayedScoreSum,140);assert.equal(preview.rankInfo.displayedScoreCount,2);
    const report=await api.rpc('getFinalReport','IKRC',api.actor,round);
    assert.equal(report.ranking.find(r=>r.unit==='A-1').rankingScore,70);
    assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE competition_code='IKRC' ORDER BY id").all()),saved,'read-time correction must not rewrite original evaluations');
  }finally{api.close();}
});

test('all five assigned sensory judges count, including a historical score mislabeled as head',async()=>{
  const api=await createRpcFixture();
  try {
    const {judges,stations,participants}=await setup(api,'결선');roster(api,judges);
    await api.rpc('updateIkrcSeedToCupResult',{targetType:'participantId',targetValue:String(participants[0].id),expectedSavedAt:''},3,'QA 결선',api.actor);
    for(let i=0;i<judges.length;i++)await api.rpc('submitScores',submission(judges[i],stations[0],'결선',[i?6+i/10:10]));
    // Historical row labels can disagree with the official account assignment.
    api.db.prepare("UPDATE scores SET role='센서리 헤드 심사위원' WHERE competition_code='IKRC' AND judge_name=?").run(judges[5].name);
    api.db.prepare("UPDATE scores SET role='센서리 심사위원' WHERE competition_code='IKRC' AND judge_name=?").run(judges[0].name);
    const original=JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE competition_code='IKRC' ORDER BY id").all());
    const first=(await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking.find(r=>r.unit==='A-1');
    assert.equal(first.headCount,1);assert.equal(first.sensoryCount,5);assert.equal(first.confirmedJudgeCount,5);assert.equal(first.expectedJudgeCount,5);
    assert.equal(first.avgScore,63);assert.equal(first.rankingScore,66);assert.equal(first.panelComplete,true);assert.deepEqual(first.missingSensoryJudgeNames,[]);
    assert.ok(first.sensoryJudgeNames.includes(judges[5].name));assert.ok(!first.sensoryJudgeNames.includes(judges[0].name));
    const detail=await api.rpc('getRankingDetail','IKRC','A-1','결선',api.actor);assert.equal(detail.avgScore,63);assert.equal(detail.totalScore,66);assert.equal(detail.rows.length,6);
    const comparison=await api.rpc('getIkrcOfficialCalibrationResultsByCup','A-1',{scope:'station',stationId:stations[0].id},judges[0]);
    assert.equal(comparison.judgeCount,5);assert.equal(comparison.headCount,1);assert.equal(comparison.finalAverage,63);
    const preview=await api.rpc('getAdminDebriefPreview','IKRC','A-1','결선',api.actor);assert.equal(preview.rankInfo.avgScore,63);assert.equal(preview.rankInfo.rankingScore,66);assert.equal(preview.scores.length,6);
    assert.equal(JSON.stringify(api.db.prepare("SELECT * FROM scores WHERE competition_code='IKRC' ORDER BY id").all()),original);
  }finally{api.close();}
});

test('a genuinely missing fifth sensory submission is identified without substituting the head',async()=>{
  const api=await createRpcFixture();
  try {
    const {judges,stations}=await setup(api,'결선');roster(api,judges);
    for(let i=0;i<5;i++)await api.rpc('submitScores',submission(judges[i],stations[0],'결선',[i?6:10]));
    const item=(await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking.find(r=>r.unit==='A-1');
    assert.equal(item.avgScore,60);assert.equal(item.confirmedJudgeCount,4);assert.equal(item.expectedJudgeCount,5);assert.equal(item.panelComplete,false);
    assert.deepEqual(item.missingSensoryJudgeNames,[judges[5].name]);
    assert.match(html,/센서리 제출 확인 필요:/);assert.match(html,/반영 센서리:/);
    await api.rpc('submitScores',submission(judges[5],stations[0],'결선',[8]));
    const completed=(await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking.find(r=>r.unit==='A-1');
    assert.equal(completed.avgScore,64);assert.equal(completed.confirmedJudgeCount,5);assert.equal(completed.panelComplete,true);assert.deepEqual(completed.missingSensoryJudgeNames,[]);
  }finally{api.close();}
});

test('legacy accounts sharing a phone retain both sensory votes',async()=>{
  const api=await createRpcFixture();
  try {
    const {judges,stations}=await setup(api,'예선');
    for(const [i,value]of [[1,6],[2,8]])await api.rpc('submitScores',submission(judges[i],stations[0],'예선',[value]));
    for(const row of api.db.prepare("SELECT id,payload_json FROM scores WHERE competition_code='IKRC'").all()){
      const payload=JSON.parse(row.payload_json);delete payload.operatorIdentityKey;delete payload.judgeIdentityKey;
      payload.judgePhone=payload.operatorPhone='01088889999';
      api.db.prepare('UPDATE scores SET payload_json=? WHERE id=?').run(JSON.stringify(payload),row.id);
    }
    const first=(await api.rpc('getRanking','IKRC',api.actor,'예선')).ranking.find(r=>r.unit==='A-1');
    assert.equal(first.confirmedJudgeCount,2);assert.equal(first.avgScore,70);
  }finally{api.close();}
});

test('public averages exclude heads in both rounds and label comparison cards clearly',()=>{
  const c=vm.createContext({document:{createElement:()=>({})},fmtScore:n=>String(n),escHtml:String});
  for(const name of ['ikrcRoundAverageRows_','ikrcLocalRoundAverage_','buildIkrcRoundAverageBox_'])vm.runInContext(fn(debrief,name),c);
  const rows=[{역할:'센서리 헤드 심사위원',총점:100},{역할:'센서리 심사위원',총점:60},{역할:'센서리 심사위원',총점:80}];
  for(const round of ['예선','결선']){
    assert.equal(c.ikrcLocalRoundAverage_(rows,round),70);
    const box=c.buildIkrcRoundAverageBox_(round,rows,{seedBonus:3,rankingScore:73});
    assert.match(box.innerHTML,/IKRC 센서리 평균/);assert.match(box.innerHTML,/140 ÷ 2명/);assert.match(box.innerHTML,/헤드 1명 비교용/);assert.match(box.innerHTML,/순위에서 제외/);
  }
  for(const source of [html,debrief])for(const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim()&&!/^\s*[\[{]/.test(match[1]))new vm.Script(match[1]);
});
