import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({});
vm.runInContext(fs.readFileSync('public/assets/debrief-summary.js','utf8'),context);
const tools={allows:()=>true,derived:h=>/^(총점|최종점수|감점|시간감점|소계)$/.test(h),label:String,max:()=>5,
  tags:raw=>String(raw).split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean),comment:(_header,raw)=>String(raw)};
const build=(code,rows,round='결선',hooks=tools)=>context.KclDebriefSummary.build(code,round,rows,hooks);
const flatten=report=>report?report.intro+' '+report.sections.map(item=>item.scope+' '+item.text).join(' '):'';

for(const code of ['KCR','MOC','MOB','KBC','KCAC'])test(code+' summarizes multiple official observations without changing any row or inventing descriptors',()=>{
  const rows=[{round:'결선',Flavor:4,Acidity:2,'Flavor 스마트태그':'오렌지, 당밀','Acidity 스마트태그':'밝은','종합코멘트':'원문 의견을 보존합니다.'},{round:'결선',Flavor:3,Acidity:2,'Flavor 스마트태그':'오렌지, 곡물','종합코멘트':'여운이 길었습니다.'}];
  const before=JSON.stringify(rows),result=flatten(build(code,rows));
  assert.match(result,/공식 제출된 심사 의견(?:과 경기 기록)?을 종합/);assert.match(result,/오렌지, 당밀, 곡물/);
  assert.match(result,/원문 의견을 보존합니다/);assert.match(result,/여운이 길었습니다/);
  assert.doesNotMatch(result,/베리|실키|긍정적인/);assert.equal(JSON.stringify(rows),before);
});

test('report scope excludes other competitions, rounds and calibration and never leaks input metadata',()=>{
  const rows=[{round:'결선',Flavor:3,'Flavor 스마트태그':'오렌지','Flavor Comment State':'SECRET_STATE','proxyComment':'SECRET_ACTOR','입력자 메모':'SECRET_INPUT','종합코멘트':'AI 자동 생성 사용'},
    {round:'예선','Flavor 스마트태그':'OTHER_ROUND'},{round:'결선',competitionCode:'KCR','Flavor 스마트태그':'OTHER_COMP'},
    {round:'결선',mode:'켈리브레이션','Flavor 스마트태그':'CALIBRATION_ONLY'}];
  const report=flatten(build('MOC',rows));assert.match(report,/오렌지/);
  assert.doesNotMatch(report,/SECRET|OTHER_|CALIBRATION|AI|자동 생성 사용/);
  assert.equal(build('MOC',rows,'본선'),null);assert.equal(build('IKRC',rows),null,'IKRC keeps its existing dedicated summary');
});

test('aliases do not become extra scoring votes; intensity, totals, penalties and invalid values cannot create a high-low claim',()=>{
  const rows=[{round:'결선',Flavor:3,'Flavor ×3':5,Acidity:3,'Flavor Intensity':5,총점:100,시간감점:999}];
  const result=flatten(build('KCR',rows));assert.match(result,/비슷한 점수대/);
  assert.doesNotMatch(result,/상대적으로 높|비교적 낮|100|999/);
  assert.equal(build('KCR',[{Flavor:99,Acidity:'not a score'}]),null);
  const tied=flatten(build('KCR',[{Flavor:2,Acidity:2}]));assert.doesNotMatch(tied,/상대적으로 높|비교적 낮/);
});

test('KCAC FAST and SLOW, pattern and sensory descriptions remain in distinct sections without milk metadata',()=>{
  const rows=[{패턴종류:'fast',우유종류:'PRIVATE_MILK','예선 Pattern Definition 스마트태그':'FAST_ONLY'},
    {패턴종류:'slow',우유명:'PRIVATE_OAT','예선 Pattern Definition 스마트태그':'SLOW_ONLY'},
    {패턴종류:'final-pattern','결선 Theme Expression 스마트태그':'PATTERN_ONLY'},
    {패턴종류:'sensory-oat','결선 Taste Balance 스마트태그':'SENSORY_ONLY'}];
  const sections=build('KCAC',rows).sections;
  for(const [scope,marker]of [['FAST Rosetta','FAST_ONLY'],['SLOW Rosetta','SLOW_ONLY'],['패턴디자인·테크니컬','PATTERN_ONLY'],['센서리','SENSORY_ONLY']]){
    const section=sections.find(item=>item.scope===scope);assert.ok(section);assert.ok(section.text.includes(marker));
    for(const other of ['FAST_ONLY','SLOW_ONLY','PATTERN_ONLY','SENSORY_ONLY'].filter(x=>x!==marker))assert.ok(!section.text.includes(other));
  }
  assert.doesNotMatch(flatten(build('KCAC',rows)),/PRIVATE_MILK|PRIVATE_OAT/);
});

test('KBC espresso and signature, and MOB technical and creative feedback stay attributed to their own criteria',()=>{
  const kbc=build('KBC',[{'Espresso Flavor 스마트태그':'ESPRESSO_ONLY','Signature Flavor 스마트태그':'SIGNATURE_ONLY','Machine & Equipment 코멘트':'MACHINE_ONLY'}]);
  assert.match(kbc.sections.find(s=>s.scope==='에스프레소').text,/ESPRESSO_ONLY/);
  assert.match(kbc.sections.find(s=>s.scope==='시그니처').text,/SIGNATURE_ONLY/,'Signature criteria are not digital-signature metadata');
  assert.doesNotMatch(kbc.sections.find(s=>s.scope==='에스프레소').text,/SIGNATURE_ONLY|MACHINE_ONLY/);
  const mob=build('MOB',[{메뉴:'창작','Creative Flavor 스마트태그':'CREATIVE_ONLY','Pre-Service Station 코멘트':'TECHNICAL_ONLY'}]);
  assert.match(mob.sections.find(s=>s.scope==='창작음료 센서리').text,/CREATIVE_ONLY/);
  assert.doesNotMatch(mob.sections.find(s=>s.scope==='창작음료 센서리').text,/TECHNICAL_ONLY/);
});

test('KTCC summarizes only recorded match facts and comments, never imaginary sensory quality',()=>{
  const rows=[{정답수:4,총점:6,종료시간:'05분 35.22초',ktccHiddenMission:{recorded:true,result:'incorrect'},종합코멘트:'마지막 세트를 정확히 구분했습니다.'}];
  const text=flatten(build('KTCC',rows));assert.match(text,/정답 4개.*총점 6점.*05분 35.22초.*히든미션 오답 \(0점\)/);
  assert.match(text,/마지막 세트를 정확히 구분/);assert.doesNotMatch(text,/향미|플레이버|상대적으로 높/);
  assert.equal(build('KTCC',[{심사위원명:'QA 심사'}]),null);
});
