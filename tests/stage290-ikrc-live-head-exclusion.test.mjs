import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRpcFixture} from './helpers/rpc-fixture.mjs';
import {seedIkrcFinal,ikrcFinalSubmission} from './helpers/ikrc-final-fixture.mjs';

const setting='ikrc_final_judge_roster';
function setRoster(api,judges,swapped=false){
  const ids=judges.map(j=>j.operatorRows.find(r=>r.access==='IKRC').rowIndex);
  const head=swapped?ids[1]:ids[0],sensory=swapped?[ids[0],...ids.slice(2)]:ids.slice(1);
  api.db.prepare('INSERT OR REPLACE INTO system_settings(setting_key,setting_value,updated_at) VALUES(?,?,?)')
    .run(setting,JSON.stringify({headOperatorId:head,sensoryOperatorIds:sensory}),new Date().toISOString());
}
function originalScores(api){return api.db.prepare("SELECT * FROM scores WHERE competition_code='IKRC' ORDER BY id").all();}
async function submitPanel(api,judges,station){
  for(let i=0;i<judges.length;i++)await api.rpc('submitScores',ikrcFinalSubmission(judges[i],station,i?6+i/10:10));
}
async function ranking(api){return (await api.rpc('getRanking','IKRC',api.actor,'결선')).ranking;}

test('a stale roster slot cannot promote the actual head or exclude a sensory judge',async()=>{
  const api=await createRpcFixture();
  try{
    const {judges,stations}=await seedIkrcFinal(api);await submitPanel(api,judges,stations[0]);setRoster(api,judges,true);
    const original=JSON.stringify(originalScores(api)),savedRoster=api.db.prepare('SELECT setting_value FROM system_settings WHERE setting_key=?').get(setting).setting_value;
    const first=(await ranking(api)).find(r=>r.unit==='A-1');
    assert.equal(first.avgScore,63);assert.equal(first.confirmedJudgeCount,5);assert.equal(first.headCount,1);assert.equal(first.panelComplete,true);
    assert.ok(!first.sensoryJudgeNames.includes(judges[0].name));assert.ok(first.sensoryJudgeNames.includes(judges[1].name));
    for(const judge of judges)assert.equal((await api.rpc('checkIkrcFinalJudgeAccess',{judgeToken:judge.judgeToken})).success,true,'all six existing accounts retain their current-role submission access');
    const detail=await api.rpc('getRankingDetail','IKRC','A-1','결선',api.actor);
    assert.equal(detail.rows.length,5);assert.equal(detail.comparisonRows.length,1);assert.ok(detail.rows.every(r=>!/헤드|head/i.test(r.role)));
    assert.equal(detail.comparisonRows[0].judgeName,judges[0].name);
    api.db.prepare('UPDATE operators SET role=? WHERE id=?').run('테크니컬 헤드 심사위원',judges[0].operatorRows.find(r=>r.access==='IKRC').rowIndex);
    const headVariant=(await ranking(api)).find(r=>r.unit==='A-1');assert.equal(headVariant.avgScore,63);assert.equal(headVariant.confirmedJudgeCount,5);assert.ok(!headVariant.sensoryJudgeNames.includes(judges[0].name));
    assert.equal(JSON.stringify(originalScores(api)),original);assert.equal(api.db.prepare('SELECT setting_value FROM system_settings WHERE setting_key=?').get(setting).setting_value,savedRoster);
  }finally{api.close();}
});

test('a historical unassigned head with a generic saved role cannot enter the sensory average',async()=>{
  const api=await createRpcFixture();
  try{
    const {judges,stations}=await seedIkrcFinal(api);await submitPanel(api,judges,stations[0]);
    await api.rpc('upsertOperatorAccount',{accountType:'JUDGE',access:'IKRC',role:'센서리 헤드 심사위원',name:'이전 헤드 QA',phone:'01088882901'},api.actor);
    const oldHead=await api.rpc('judgeLogin','이전 헤드 QA','01088882901');
    await api.rpc('submitScores',ikrcFinalSubmission(oldHead,stations[0],10));
    api.db.prepare("UPDATE scores SET role='심사위원' WHERE competition_code='IKRC' AND judge_name=?").run(oldHead.name);
    setRoster(api,judges);const original=JSON.stringify(originalScores(api));
    const first=(await ranking(api)).find(r=>r.unit==='A-1');
    assert.equal(first.avgScore,63);assert.equal(first.confirmedJudgeCount,5);assert.ok(!first.sensoryJudgeNames.includes(oldHead.name));
    const detail=await api.rpc('getRankingDetail','IKRC','A-1','결선',api.actor);
    assert.equal(detail.rows.length,5);assert.equal(detail.comparisonRows.length,2);
    const preview=await api.rpc('getAdminDebriefPreview','IKRC','A-1','결선',api.actor);
    assert.equal(preview.rankInfo.avgScore,63);assert.equal(preview.rankInfo.displayedScoreCount,5);assert.equal(preview.scores.length,7,'comparison originals remain available');
    assert.equal(JSON.stringify(originalScores(api)),original);
  }finally{api.close();}
});

test('legacy official totals and ranks cannot override the live final sensory score plus seed bonus',async()=>{
  const api=await createRpcFixture();
  try{
    const {judges,stations,participants}=await seedIkrcFinal(api);setRoster(api,judges);
    for(let i=0;i<judges.length;i++){
      const p=ikrcFinalSubmission(judges[i],stations[0],i?6:10);
      for(const index of [1,3,5,7,9])p.rows[1].data[index]=8;p.rows[1].data[12]=80;
      await api.rpc('submitScores',p);
    }
    await api.rpc('updateIkrcSeedToCupResult',{targetType:'participantId',targetValue:String(participants[0].id),expectedSavedAt:''},3,'QA 결선',api.actor);
    const payload={competitionCode:'IKRC',round:'결선',entries:[{unit:'A-1',officialScore:999,officialRank:1,reason:'이전 집계'}]};
    api.db.prepare('INSERT INTO sessions(token,kind,payload_json,expires_at,created_at) VALUES(?,?,?,?,?)')
      .run('legacy-ikrc-qa','OFFICIAL_RANKING_OVERRIDE',JSON.stringify(payload),'2035-12-31T23:59:59.000Z',new Date().toISOString());
    const original=JSON.stringify(originalScores(api)),results=await ranking(api),first=results.find(r=>r.unit==='A-1'),second=results.find(r=>r.unit==='A-2');
    assert.equal(first.avgScore,60);assert.equal(first.rankingScore,63);assert.equal(first.calculatedScore,63);assert.equal(first.officialResultOverride,false);assert.equal(first.ignoredOfficialResultOverride,true);
    assert.ok(second.rank<first.rank);assert.equal(second.rankingScore,80);
    const report=await api.rpc('getFinalReport','IKRC',api.actor,'결선');assert.equal(report.ranking.find(r=>r.unit==='A-1').rankingScore,63);
    assert.equal(api.db.prepare('SELECT payload_json FROM sessions WHERE token=?').get('legacy-ikrc-qa').payload_json,JSON.stringify(payload));assert.equal(JSON.stringify(originalScores(api)),original);
  }finally{api.close();}
});

test('an in-flight evaluation from an already-open form survives concurrent ranking reads',{timeout:10000},async()=>{
  let hold=false,release,ready;
  const blocked=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{ready=resolve;});
  const api=await createRpcFixture({beforeBatch:async()=>{if(hold){hold=false;ready();await blocked;}}});
  try{
    const {judges,stations}=await seedIkrcFinal(api);setRoster(api,judges);
    await submitPanel(api,judges.slice(0,5),stations[0]);
    const original=originalScores(api),p=ikrcFinalSubmission(judges[5],stations[0],6.5);
    p.judgeRole='센서리 헤드 심사위원';p.clientSubmissionId='open-form-before-deploy';
    hold=true;const submitting=api.rpc('submitScores',p);await entered;
    assert.equal((await ranking(api)).find(r=>r.unit==='A-1').confirmedJudgeCount,4);
    release();await submitting;
    const after=originalScores(api);assert.deepEqual(after.slice(0,original.length),original);assert.equal(after.length,original.length+6);
    const first=(await ranking(api)).find(r=>r.unit==='A-1');assert.equal(first.confirmedJudgeCount,5);assert.equal(first.avgScore,63);assert.deepEqual(first.missingSensoryJudgeNames,[]);
  }finally{release();api.close();}
});

test('ranking detail hides head cards even when an older response still contains them',()=>{
  const html=fs.readFileSync(new URL('../public/assessment/index.html',import.meta.url),'utf8');
  const start=html.indexOf('function renderRankingDetail('),next=html.slice(start+1).search(/\nfunction\s/),source=html.slice(start,start+1+next);
  const elements={},rendered=[];
  const c=vm.createContext({document:{getElementById:id=>elements[id]||(elements[id]={})},escHtml:String,usesAverageScoreDisplay_:()=>true,fmtAverageScore_:String,fmtScore:String,renderDetailCard:r=>{rendered.push(r.judgeName);return '<div>센서리</div>';}});
  vm.runInContext(source,c);
  c.renderRankingDetail({compCode:'IKRC',round:'결선',unit:'A-1',rows:[{role:'센서리 헤드 심사위원',judgeName:'헤드',총점:100},{role:'센서리 심사위원',judgeName:'센서리',총점:60}],rankInfo:{avgScore:60,roastingScore:60,rankingScore:63,seedBonus:3}});
  assert.deepEqual(rendered,['센서리']);assert.match(elements['ranking-detail-body'].innerHTML,/헤드 평가는 대회평가 비교 화면/);
});
