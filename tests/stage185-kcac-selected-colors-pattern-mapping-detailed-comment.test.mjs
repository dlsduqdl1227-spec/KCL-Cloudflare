import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { onRequestPost } from '../functions/api/rpc.js';

const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} function missing`);
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} function incomplete`);
}

// 선택된 태그도 긍정(빨강)·보완(파랑)이 유지되어야 한다.
assert.match(assessment, /\.kcac-smart-group-positive \.cat-btn-s\.selected\{background:#7f1d1d;color:#fff/);
assert.match(assessment, /\.kcac-smart-group-refinement \.cat-btn-s\.selected\{background:#174ea6;color:#fff/);
assert.match(assessment, /\.selected-tag\.kcac-selected-tag-positive\{background:#7f1d1d/);
assert.match(assessment, /\.selected-tag\.kcac-selected-tag-refinement\{background:#174ea6/);

const tagContext = {
  _kcac:{ currentIdx:0, jars:[{ smartTags:{ 균형:['좌우 대칭 유지','중심축 이탈'] } }] },
  kcacSmartTagOptions_:()=>({ 긍정:['좌우 대칭 유지'], 보완:['중심축 이탈'] }),
  kcacSelectedSmartTags_:()=>['좌우 대칭 유지','중심축 이탈'],
  escapeJsString_:value=>String(value),
  escHtml:value=>String(value),
  smartTagLeaf_:value=>String(value)
};
vm.createContext(tagContext);
vm.runInContext(functionSource(assessment, 'kcacSmartTagToneClass_'), tagContext);
vm.runInContext(functionSource(assessment, 'kcacSelectedSmartTagsHtml_'), tagContext);
const selectedHtml = tagContext.kcacSelectedSmartTagsHtml_('균형');
assert.match(selectedHtml, /kcac-selected-tag-positive[^>]*>좌우 대칭 유지/);
assert.match(selectedHtml, /kcac-selected-tag-refinement[^>]*>중심축 이탈/);

// 1번·2번 잔은 우유명 없이 FAST/SLOW만 표시하고 현재 잔을 강조한다.
const elements = {
  'kcac-milk-button-grid':{ innerHTML:'' },
  'kcac-milk-pattern-status':{ innerHTML:'', textContent:'' },
  'kcac-current-pattern-title':{ textContent:'' },
  'kcac-current-cup-label':{ textContent:'' },
  'kcac-selected-pattern-label':{ textContent:'' }
};
const mappingContext = {
  _kcac:{ currentIdx:1, qualFirstPattern:'controlled', jars:[
    { type:'qual', patternType:'dynamic', milkProduct:'매일멸균우유' },
    { type:'qual', patternType:'controlled', milkProduct:'어메이징 오트바리스타' }
  ] },
  document:{ getElementById:id=>elements[id] || null },
  escHtml:value=>String(value),
  kcacPatternTypeTitle_:type=>type === 'dynamic' ? 'FAST Rosetta' : type === 'controlled' ? 'SLOW Rosetta' : '',
  kcacPatternTypeGuide_:type=>type === 'dynamic' ? '리프 14개 이상' : '리프 10개 이하'
};
vm.createContext(mappingContext);
vm.runInContext(functionSource(assessment, 'kcacValidQualPattern_'), mappingContext);
vm.runInContext(functionSource(assessment, 'kcacOppositePatternType_'), mappingContext);
vm.runInContext(functionSource(assessment, 'kcacQualMilkEntries_'), mappingContext);
vm.runInContext(functionSource(assessment, 'kcacQualCupNumber_'), mappingContext);
vm.runInContext(functionSource(assessment, 'kcacQualCupNumberLabel_'), mappingContext);
vm.runInContext(functionSource(assessment, 'refreshKcacCurrentCupAssignment_'), mappingContext);
vm.runInContext(functionSource(assessment, 'syncKcacMilkPatternSelectors_'), mappingContext);
mappingContext.syncKcacMilkPatternSelectors_();
assert.match(elements['kcac-milk-button-grid'].innerHTML, /1번 컵[\s\S]*FAST Rosetta[\s\S]*SLOW Rosetta/);
assert.doesNotMatch(elements['kcac-milk-button-grid'].innerHTML, /2번 컵[\s\S]*선택/);
assert.doesNotMatch(elements['kcac-milk-button-grid'].innerHTML + elements['kcac-milk-pattern-status'].innerHTML, /매일|멸균|어메이징|오트|대체우유/);
assert.match(elements['kcac-milk-pattern-status'].innerHTML, /1번 컵 · SLOW Rosetta[\s\S]*2번 컵 · FAST Rosetta/);
assert.equal(elements['kcac-current-pattern-title'].textContent, '현재: SLOW Rosetta');
assert.equal(elements['kcac-current-cup-label'].textContent, '1번 컵');
assert.equal(elements['kcac-selected-pattern-label'].textContent, '리프 10개 이하');

assert.match(assessment, /\.kcac-qual-nav\{display:grid!important;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(functionSource(assessment, 'renderKcacCupNav'), /FAST|kcacOrderedQualEntries_|종합코멘트/);
assert.match(functionSource(assessment, 'setKcacQualFirstPattern_'), /loadKcacJar\(targetIndex\)/, '1번 컵 로제타 선택 후 해당 전용 탭을 열어야 합니다');
assert.match(functionSource(assessment, 'renderKcacLeafRuleBox'), /kcac-leaf-entry-title[\s\S]*리프 수/);
assert.match(assessment, /id="kcac-header-cup-scores"[\s\S]*>합산</);
assert.match(functionSource(assessment, 'renderKcacHeaderScores_'), /kcac-header-metric[\s\S]*calcKcacJarFinal\(j, false\)/);
assert.match(functionSource(assessment, 'updateKcacFinal'), /renderKcacHeaderScores_\(\)[\s\S]*kcac-final-display/);

async function rpc(action, payload) {
  const statement = { bind(){ return this; }, async run(){ return { success:true }; }, async first(){ return { n:1 }; }, async all(){ return { results:[] }; } };
  const request = new Request('https://qa.kcl.local/api/rpc', {
    method:'POST', headers:{ 'Content-Type':'application/json', Origin:'https://qa.kcl.local' },
    body:JSON.stringify({ action, args:[payload] })
  });
  const response = await onRequestPost({ request, env:{ DB:{ prepare(){ return statement; } } } });
  assert.equal(response.status, 200);
  return response.json();
}

const generated = await rpc('generateKcacComment', {
  label:'예선 테스트 잔', type:'qual', patternType:'FAST Rosetta', milkProduct:'매일멸균우유', leafCount:'15', leafPenalty:0,
  variationSeed:'stage185',
  scores:{ 완성도:4.0, 균형:3.6, 표면:3.2, 위치:2.8, 선명도:2.4 },
  smartTags:{
    'Pattern Completion(패턴 완성도)':['리프 형태 식별 가능'],
    'Pattern Symmetry & Balance(대칭과 균형)':['중심축 이탈'],
    'Surface Quality(표면 품질)':['광택 유지'],
    'Position & Proportion(위치와 비율)':['컵 중심 이탈'],
    'Pattern Definition(패턴 선명도)':['라인 분리 부족']
  },
  smartTagPolarity:{
    positive:['완성도: 리프 형태 식별 가능','표면: 광택 유지'],
    refinement:['균형: 중심축 이탈','위치: 컵 중심 이탈','선명도: 라인 분리 부족'], custom:[]
  }
});
assert.equal(generated.success, true);
assert.equal(generated.comments.length, 2);
generated.comments.forEach(comment => {
  assert.match(comment, /리프 형태 식별 가능/);
  assert.match(comment, /중심축 이탈/);
  assert.match(comment, /리프 15개/);
  assert.match(comment, /강점|보완/);
  assert.match(comment, /형태와 대칭, 표면 상태가 위치와 선명도로 이어지는 흐름/);
  assert.ok(comment.length >= 170, `KCAC 종합코멘트가 충분히 상세하지 않습니다: ${comment.length}자`);
  assert.ok(comment.length <= 420, `KCAC 종합코멘트가 너무 깁니다: ${comment.length}자`);
  assert.doesNotMatch(comment, /항목별로 정리하면 다음과 같습니다|점수와 선택된 관찰 기록을 함께 반영/);
});

const combined = await rpc('generateKcacComment', {
  type:'qual-combined', variationSeed:'stage185-combined',
  cups:[
    {
      type:'qual', patternType:'FAST Rosetta', milkProduct:'매일멸균우유', leafCount:'15', scores:{ 완성도:4.0, 균형:3.6, 표면:3.2, 위치:2.8, 선명도:2.4 },
      smartTags:{ 'Pattern Completion(패턴 완성도)':['리프 형태 식별 가능'], 'Pattern Definition(패턴 선명도)':['라인 분리 부족'] },
      smartTagPolarity:{ positive:['완성도: 리프 형태 식별 가능'], refinement:['선명도: 라인 분리 부족'] }
    },
    {
      type:'qual', patternType:'SLOW Rosetta', milkProduct:'어메이징 오트바리스타', leafCount:'9', scores:{ 완성도:3.6, 균형:3.4, 표면:3.8, 위치:3.0, 선명도:3.2 },
      smartTags:{ 'Surface Quality(표면 품질)':['광택 유지'], 'Position & Proportion(위치와 비율)':['컵 중심 이탈'] },
      smartTagPolarity:{ positive:['표면: 광택 유지'], refinement:['위치: 컵 중심 이탈'] }
    }
  ]
});
assert.equal(combined.success, true);
assert.equal(combined.comments.length, 2);
combined.comments.forEach(comment => {
  assert.match(comment, /FAST Rosetta/);
  assert.match(comment, /SLOW Rosetta/);
  assert.doesNotMatch(comment, /멸균우유|매일멸균|대체우유|어메이징|오트바리스타|오트밀/);
  assert.match(comment, /리프 15개/);
  assert.match(comment, /리프 9개/);
  assert.match(comment, /전체 항목 흐름에서는/);
  assert.ok(comment.length >= 230, `KCAC 통합 코멘트가 충분히 상세하지 않습니다: ${comment.length}자`);
  assert.ok(comment.length <= 480, `KCAC 통합 코멘트가 너무 깁니다: ${comment.length}자`);
});

assert.match(functionSource(assessment, 'kcacCommentPayloadForJar_'), /leafCount:\s*j\.leafCount[\s\S]*leafPenalty:\s*j\.leafPenalty/);

process.stdout.write('Stage185 KCAC selected colors, exact pattern mapping, and detailed comment tests passed.\n');
