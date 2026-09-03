import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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

// 1번·2번 잔에서 FAST/SLOW만 선택하고 우유 정보는 표시하지 않는다.
assert.equal((assessment.match(/id="kcac-milk-button-grid"/g) || []).length, 1);
assert.doesNotMatch(assessment, /<select[^>]+id="kcac-fast-milk"/);
assert.doesNotMatch(assessment, /id="kcac-slow-milk"/);
const patternSelector = functionSource(assessment, 'syncKcacMilkPatternSelectors_');
assert.match(patternSelector, /FAST Rosetta[\s\S]*SLOW Rosetta/);
assert.match(patternSelector, /kcacQualCupNumberLabel_/);
assert.doesNotMatch(patternSelector, /milkProduct|milkType|멸균|오트|대체우유|사용할 우유/);
const cupAssignment = functionSource(assessment, 'renderKcacQualPatternSelector_');
assert.match(cupAssignment, /현재 잔/);
assert.doesNotMatch(cupAssignment, /milkProduct|milkType|사용 우유|멸균|오트/);
assert.doesNotMatch(cupAssignment, /kcac-pattern-choice|setKcacQualPatternType_/);

// 긍정·보완 하위 스마트태그는 부모 탭 클릭 없이 동시에 보인다.
const context = {
  _kcac:{ currentIdx:0, jars:[{ type:'qual', smartTags:{ 완성도:[] } }] },
  kcacSelectedSmartTags_:()=>[],
  kcacSmartTagOptions_:()=>({ 긍정:['형태 선명'], 보완:['중심 이탈'] }),
  escapeJsString_:value=>String(value),
  escHtml:value=>String(value),
  kcacSmartTagIdKey_:value=>String(value)
};
vm.createContext(context);
vm.runInContext(functionSource(assessment, 'kcacSmartTagButtonsHtml_'), context);
const tagHtml = context.kcacSmartTagButtonsHtml_(context._kcac.jars[0], '완성도');
assert.match(tagHtml, /kcac-smart-group-positive[\s\S]*긍정[\s\S]*형태 선명/);
assert.match(tagHtml, /kcac-smart-group-refinement[\s\S]*보완[\s\S]*중심 이탈/);
assert.doesNotMatch(tagHtml, /category-primary|toggleKcacSmartTagGroup_/);
assert.match(assessment, /\.kcac-smart-group-positive \.kcac-smart-group-label\{color:#ff6b6b\}/);
assert.match(assessment, /\.kcac-smart-group-refinement \.kcac-smart-group-label\{color:#69a7ff\}/);

// AI를 쓰지 않아도 점수·스마트태그·패턴 기록 가이드가 유지된다.
assert.match(assessment, /id="kcac-comment-reference"/);
assert.match(assessment, /onclick="clearKcacGeneratedComment\(\)"/);
const guide = functionSource(assessment, 'buildKcacCommentReferenceHtml_');
const guideCards = functionSource(assessment, 'buildKcacReferenceCardsForJar_');
assert.doesNotMatch(assessment, /AI 코멘트를 사용하지 않아도 현재 잔의 점수·스마트태그·패턴 기록은 그대로 유지/);
assert.match(guide, /kcac-overall-guide-grid/);
assert.match(guide, /FAST|pattern/);
assert.match(guideCards, /kcacSelectedSmartTags_/);
assert.match(guide, /leafCount/);
assert.match(functionSource(assessment, 'onKcacScore'), /refreshKcacCommentReference_\(\)/);
assert.match(functionSource(assessment, 'toggleKcacSmartTag'), /refreshKcacCommentReference_\(\)/);
assert.match(functionSource(assessment, 'onKcacLeafCountInput'), /refreshKcacCommentReference_\(\)/);

process.stdout.write('Stage184 KCAC compact pattern, always-visible smart tags, and comment guide tests passed.\n');
