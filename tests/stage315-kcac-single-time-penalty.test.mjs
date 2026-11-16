import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createKcacFinalPenaltyFixture} from './helpers/kcac-final-penalty-fixture.mjs';

const source=fs.readFileSync('public/debriefing/index.html','utf8');
function fn(name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);const next=source.slice(start+1).search(/\n(?:async )?function\s/);return source.slice(start,next<0?source.length:start+1+next);}

for(const penalties of [[2,2,2,2],[1,3,2,0]])test('KCAC '+penalties.join('/')+' subtracts the maximum time penalty exactly once without changing existing submissions',async()=>{
  const api=await createKcacFinalPenaltyFixture(penalties);
  try{
    const before=api.snapshot(),preview=await api.rpc('getAdminDebriefPreview','KCAC','1','결선',api.actor);
    assert.equal(preview.success,true);assert.equal(preview.scores.length,4);
    const penalty=Math.max(...penalties),gross=preview.scores.reduce((sum,row)=>sum+Number(row.kcacGrossScore),0);
    assert.equal(gross,128);assert.equal(preview.rankInfo.totalScore,gross-penalty);assert.equal(preview.rankInfo.tie.timePenalty,penalty);
    assert.deepEqual(preview.scores.map(row=>row.kcacGrossScore),[48,48,16,16]);
    assert.deepEqual(preview.scores.map(row=>row.총점),[48-penalties[0],48-penalties[1],16-penalties[2],16-penalties[3]],'submitted totals remain authoritative stored records, not rewritten for display');
    const c=vm.createContext({document:{createElement:()=>({setAttribute(){}})},fmtScore:String,escHtml:String});
    vm.runInContext(fn('buildKcacFinalPenaltyBox_'),c);
    const box=c.buildKcacFinalPenaltyBox_(preview.scores,preview.rankInfo);
    assert.match(box.innerHTML,/최종 합산에서 1회 반영/);assert.ok(box.innerHTML.includes('−'+penalty+'점'));
    assert.match(box.innerHTML,/심사위원별로 반복 차감하지 않습니다/);
    assert.equal(api.snapshot(),before);
  }finally{api.close();}
});

test('KCAC penalty annotation respects an explicit zero, uses max for legacy data, and cannot leak into other rounds',()=>{
  const c=vm.createContext({document:{createElement:()=>({setAttribute(){}})},fmtScore:String,escHtml:String});vm.runInContext(fn('buildKcacFinalPenaltyBox_'),c);
  const rows=[{시간감점:2},{'Time Penalty':3},{감점:1}];
  assert.match(c.buildKcacFinalPenaltyBox_(rows,{tie:{timePenalty:0}}).innerHTML,/시간 감점 없음/);
  assert.match(c.buildKcacFinalPenaltyBox_(rows,{}).innerHTML,/−3점/);
  assert.match(fn('buildKcacScoreGrid'),/penalty > 0 && !isFinale/,'preliminary leaf penalties remain independent');
  assert.match(fn('renderResult'),/isKcacDebrief && round === '결선'/);
});
