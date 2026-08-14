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

// FAST 사용우유를 상단에서 한 번만 선택하고 SLOW는 자동 배정한다.
assert.equal((assessment.match(/id="kcac-fast-milk"/g) || []).length, 1);
assert.doesNotMatch(assessment, /id="kcac-slow-milk"/);
assert.match(assessment, /FAST Rosetta 사용우유 선택[\s\S]*SLOW는 자동 배정/);
const cupAssignment = functionSource(assessment, 'renderKcacQualPatternSelector_');
assert.match(cupAssignment, /현재 잔 배정/);
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
assert.match(guide, /점수·스마트태그·패턴 기록은 그대로 유지/);
assert.match(guide, /kcacSelectedSmartTags_/);
assert.match(guide, /leafCount/);
assert.match(functionSource(assessment, 'onKcacScore'), /refreshKcacCommentReference_\(\)/);
assert.match(functionSource(assessment, 'toggleKcacSmartTag'), /refreshKcacCommentReference_\(\)/);
assert.match(functionSource(assessment, 'onKcacLeafCountInput'), /refreshKcacCommentReference_\(\)/);

process.stdout.write('Stage184 KCAC compact pattern, always-visible smart tags, and comment guide tests passed.\n');
