import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assessment = fs.readFileSync(path.join(root, 'public', 'assessment', 'index.html'), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} function not found`);
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

const inputMarkup = assessment.match(/<input type="number" id="kcac-leaf-count"[^>]+>/)?.[0] || '';
assert.match(inputMarkup, /data-jar-index=/);
assert.match(inputMarkup, /oninput="onKcacLeafCountInput\(this\.value,this\.getAttribute\(\\'data-jar-index\\'\)\)"/);
assert.match(inputMarkup, /onchange="onKcacLeafCountInput\(this\.value,this\.getAttribute\(\\'data-jar-index\\'\)\)"/);
assert.match(inputMarkup, /onblur="onKcacLeafCountInput\(this\.value,this\.getAttribute\(\\'data-jar-index\\'\)\)"/);

const elements = {
  'kcac-leaf-count': { value:'14', getAttribute:name => name === 'data-jar-index' ? '0' : '' },
  'kcac-comment': { value:'현장 평가 코멘트' }
};
const context = {
  _kcac:{ currentIdx:0, jars:[{ type:'qual', patternType:'dynamic', leafCount:'', leafPenalty:0, generatedComment:'', commentEdited:true }] },
  document:{ getElementById:id => elements[id] || null },
  calcKcacLeafPenalty:j => {
    j.leafPenalty = j.patternType === 'dynamic' && Number(j.leafCount) < 14 ? 5 : 0;
    return j.leafPenalty;
  }
};
vm.createContext(context);
vm.runInContext(functionSource(assessment, 'syncKcacLeafCountFromDOM_'), context);
vm.runInContext(functionSource(assessment, 'saveKcacJarFromDOM'), context);

context.saveKcacJarFromDOM();
assert.equal(context._kcac.jars[0].leafCount, '14', 'the visible mobile input must be persisted even if its input event was delayed');
assert.equal(context._kcac.jars[0].leafPenalty, 0);
assert.equal(context._kcac.jars[0].comment, '현장 평가 코멘트');

elements['kcac-leaf-count'].value = '0';
context.saveKcacJarFromDOM();
assert.equal(context._kcac.jars[0].leafCount, '0', 'zero must remain a valid explicitly entered leaf count');

context._kcac.jars.push({ type:'qual', patternType:'controlled', leafCount:'', leafPenalty:0, generatedComment:'', commentEdited:true });
context._kcac.currentIdx = 1;
elements['kcac-leaf-count'].value = '15';
vm.runInContext('syncKcacLeafCountFromDOM_()', context);
assert.equal(context._kcac.jars[0].leafCount, '15', 'a delayed mobile event must remain bound to the cup that rendered the input');
assert.equal(context._kcac.jars[1].leafCount, '', 'a delayed event from the previous cup must not overwrite the current cup');

const validation = functionSource(assessment, 'validateKcacBeforeSubmit_');
assert.match(validation, /syncKcacLeafCountFromDOM_\(\)/, 'submission validation must synchronize the visible field first');
assert.match(validation, /missingLeafLabels\.push\(kcacCupFullLabel\(j\)\)/, 'a missing mobile event must be recorded for review');
assert.doesNotMatch(validation, /리프 수를 입력해주세요[\s\S]*?return false/, 'missing leaf count must never block the full submission');
assert.match(validation, /제출은 계속 진행합니다/, 'the operator must be told that submission continues');
assert.match(assessment, /'리프수입력상태':[\s\S]*?'확인필요'[\s\S]*?'입력완료'/, 'submitted rows must expose leaf-count verification state');
assert.match(functionSource(assessment, 'setKcacQualMilkPattern_'), /syncKcacLeafCountFromDOM_\(\)/, 'changing FAST/SLOW assignment must preserve the visible leaf count first');

process.stdout.write('Stage183 KCAC leaf-count persistence tests passed.\n');
