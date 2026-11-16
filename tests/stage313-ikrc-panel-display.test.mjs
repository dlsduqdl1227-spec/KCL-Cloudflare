import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createIkrcPanelDisplayFixture} from './helpers/ikrc-panel-display-fixture.mjs';

const source=fs.readFileSync(new URL('../public/debriefing/index.html',import.meta.url),'utf8');
function fn(name) {
  const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);
  const next=source.slice(start+1).search(/\n(?:async )?function\s/);
  return source.slice(start,next<0?source.length:start+1+next);
}
function context() {
  const c=vm.createContext({document:{createElement:()=>({})},fmtScore:n=>String(n),escHtml:String,normalizeKcacRoundForDisplay_:(_code,round)=>round});
  for(const name of ['ikrcAggregateJudgeCount_','ikrcPanelDisplaySummary_','ikrcRoundAverageRows_','ikrcLocalRoundAverage_','buildIkrcRoundAverageBox_','buildReportIntro'])vm.runInContext(fn(name),c);
  return c;
}
const rows=[{심사위원명:'QA 헤드',role:'센서리 헤드 심사위원',총점:100},...Array.from({length:5},(_,i)=>({심사위원명:'QA 센서리 '+i,role:'센서리 심사위원',총점:60+2*i}))];

test('IKRC separately labels five scoring sensory judges and one comparison-only head in both rounds',()=>{
  const c=context(),before=JSON.stringify(rows);
  for(const round of ['예선','결선']) {
    const list=rows.map(row=>({...row,round}));
    const box=c.buildIkrcRoundAverageBox_(round,list,{judgeCount:6,headCount:2,sensoryCount:6,seedBonus:2,rankingScore:66});
    assert.match(box.innerHTML,/점수 반영: 센서리 5명/);
    assert.match(box.innerHTML,/헤드 1명 비교용 \(평균·순위 미반영\)/);
    assert.match(box.innerHTML,/320 ÷ 5명/);
    assert.doesNotMatch(box.innerHTML,/센서리 6명|심사위원 6명 반영/);
    const intro=c.buildReportIntro({competition:'IKRC'},list).innerHTML;
    assert.match(intro,/점수 반영: 센서리 5명/);assert.match(intro,/헤드 1명 비교용/);
    assert.doesNotMatch(intro,/심사위원 평가표 6건/);
    assert.equal(c.ikrcLocalRoundAverage_(list,round),64);
  }
  assert.equal(JSON.stringify(rows),before);
});

test('missing, duplicate, excluded and head-only rows never inflate the scoring count',()=>{
  const c=context();
  assert.equal(c.ikrcPanelDisplaySummary_(rows.slice(0,5)).sensoryCount,4);
  assert.equal(c.ikrcPanelDisplaySummary_([...rows,rows[1]]).sensoryCount,5);
  const list=[...rows,{심사위원명:'QA 실격',role:'센서리 심사위원',총점:100,실격여부:'Y'},{심사위원명:'QA 배정 외',role:'센서리 심사위원',총점:100,ikrcRankingExcluded:true}];
  const summary=c.ikrcPanelDisplaySummary_(list);
  assert.equal(summary.sensoryCount,5);assert.equal(summary.headCount,1);assert.equal(summary.excludedCount,2);
  const headOnly=c.buildIkrcRoundAverageBox_('결선',[rows[0]],{judgeCount:1,sensoryCount:5}).innerHTML;
  assert.match(headOnly,/점수 반영: 센서리 0명/);assert.match(headOnly,/센서리 점수 집계 대기/);
  assert.doesNotMatch(headOnly,/1명 반영|헤드 1명.*÷ 1명/);
});

test('other competition intros keep their own judging and head-inclusion rules',()=>{
  const c=context();
  for(const code of ['KCR','KCAC','KBC','MOB','MOC','KTCC']) {
    const html=c.buildReportIntro({competition:code},rows.map(row=>({...row,round:'예선'}))).innerHTML;
    assert.match(html,/공개 항목 6건/);assert.doesNotMatch(html,/헤드.*미반영|점수 반영: 센서리/);
  }
});

test('live-shaped official records retain every score, comment and Seed to Cup bonus while count text is corrected',async()=>{
  const api=await createIkrcPanelDisplayFixture();
  try {
    const before=api.snapshot(),c=context();
    const preview=await api.rpc('getAdminDebriefPreview','IKRC','A-1','결선',api.actor);
    assert.equal(preview.success,true);assert.equal(preview.scores.length,6);
    assert.equal(preview.rankInfo.judgeCount,6,'existing API total-submission metadata is retained for compatibility');
    assert.equal(preview.rankInfo.sensoryCount,5);assert.equal(preview.rankInfo.headCount,1);
    assert.equal(preview.rankInfo.avgScore,64);assert.equal(preview.rankInfo.seedBonus,2);assert.equal(preview.rankInfo.rankingScore,66);
    const box=c.buildIkrcRoundAverageBox_('결선',preview.scores,preview.rankInfo).innerHTML;
    assert.match(box,/점수 반영: 센서리 5명/);assert.match(box,/헤드 1명 비교용/);assert.match(box,/최종점수 66/);
    const ranking=await api.rpc('getRanking','IKRC',api.actor,'결선');
    const row=ranking.ranking.find(item=>item.unit==='A-1');
    assert.equal(row.confirmedJudgeCount,5);assert.equal(row.headScoreIncluded,false);assert.equal(row.rankingScore,66);
    assert.equal(api.snapshot(),before,'display and ranking reads never rewrite original competition records');
  } finally {api.close();}
});
