import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../public/debriefing/index.html',import.meta.url),'utf8');
const context=vm.createContext({});
for(const name of ['kcacFinalEvaluationScope_','kcacFinalEvaluationLabel_','kcacFinalEvaluationOrder_']){
  const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start);vm.runInContext(html.slice(start,end),context);
}

test('KCAC final labels use submitted cup types with registered-role fallbacks and never guess identities or change data',()=>{
  const cases=[
    [{패턴종류:'final-pattern',역할:'오트 센서리 헤드 심사위원'},'pattern','패턴디자인 평가'],
    [{패턴종류:'sensory-regular',역할:'패턴디자인 헤드 심사위원'},'sensory-regular','일반우유 센서리 평가'],
    [{패턴종류:'sensory-oat',역할:'일반우유 센서리 헤드 심사위원'},'sensory-oat','식물성우유 센서리 평가'],
    [{잔용도:'창작패턴평가'},'pattern','패턴디자인 평가'],
    [{잔용도:'센서리용아트',역할:'패턴디자인 헤드 심사위원'},'sensory','센서리 평가'],
    [{잔용도:'센서리용아트',역할:'일반우유 센서리 헤드 심사위원'},'sensory-regular','일반우유 센서리 평가'],
    [{잔용도:'센서리용아트',역할:'오트 센서리 헤드 심사위원'},'sensory-oat','식물성우유 센서리 평가'],
    [{'Pattern Type':'sensory oat'},'sensory-oat','식물성우유 센서리 평가'],
    [{patternType:'대체우유 센서리'},'sensory-oat','식물성우유 센서리 평가'],
    [{JudgeRole:'식물성우유 센서리 헤드'},'sensory-oat','식물성우유 센서리 평가'],
    [{role:'Pattern Design Head'},'pattern','패턴디자인 평가'],
    [{잔용도:'센서리용아트'},'sensory','센서리 평가'],
    [{심사위원명:'일반우유 패턴디자인 오트',종합코멘트:'일반우유가 아닌 식물성우유',총점:20},'','라떼아트 평가']
  ];
  for(const [row,scope,label]of cases){
    const before=JSON.stringify(row);Object.freeze(row);
    assert.equal(context.kcacFinalEvaluationScope_(row),scope);
    assert.equal(context.kcacFinalEvaluationLabel_(row),label);
    assert.equal(JSON.stringify(row),before);
  }
  const types=['sensory-oat','sensory-regular','final-pattern','final-pattern'];
  const rows=types.map((type,index)=>Object.freeze({패턴종류:type,index})),before=JSON.stringify(rows);
  assert.deepEqual(rows.slice().sort((a,b)=>context.kcacFinalEvaluationOrder_(a)-context.kcacFinalEvaluationOrder_(b)).map(row=>row.index),[2,3,1,0]);
  assert.equal(JSON.stringify(rows),before,'sorting is a display-only copy, never a saved record edit');
  assert.match(html,/if \(isKcacDebrief && round === '결선'\) list = list\.slice\(\)\.sort/);
  assert.match(html,/publicRoundIsFinal_\(s\) \? kcacFinalEvaluationLabel_\(s\) : '라떼아트 평가'/,'preliminary FAST/SLOW titles are unchanged');
});
