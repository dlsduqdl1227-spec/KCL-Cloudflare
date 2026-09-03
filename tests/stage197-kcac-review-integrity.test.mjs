import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');
const rpc = fs.readFileSync(new URL('../functions/api/rpc.js', import.meta.url), 'utf8');

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

const context = {};
vm.createContext(context);
vm.runInContext(functionSource(assessment, 'kcacReviewTabLabel_'), context);
vm.runInContext(functionSource(assessment, 'kcacReviewSortItems_'), context);

const submittedCup1Slow = {
  '우유종류':'멸균우유',
  '우유명':'매일멸균우유',
  '패턴종류':'SLOW Rosetta'
};
const submittedCup2Fast = {
  '우유종류':'대체우유',
  '우유명':'어메이징 오트바리스타',
  '패턴종류':'FAST Rosetta'
};
assert.equal(context.kcacReviewTabLabel_(submittedCup1Slow), 'SLOW Rosetta');
assert.equal(context.kcacReviewTabLabel_(submittedCup2Fast), 'FAST Rosetta');
assert.equal(context.kcacReviewTabLabel_({'잔용도':'예선 패턴평가','우유종류':'멸균우유',payloadRowIndex:0}), '1번 잔');
assert.doesNotMatch(context.kcacReviewTabLabel_({'잔용도':'센서리용아트','우유종류':'대체우유',payloadRowIndex:1}), /우유|오트|멸균/);
assert.deepEqual(
  Array.from(context.kcacReviewSortItems_([submittedCup1Slow, submittedCup2Fast]), x => x['패턴종류']),
  ['FAST Rosetta', 'SLOW Rosetta'],
  'review order must follow the submitted FAST/SLOW pattern, never the physical milk row'
);

const lockHeaderSource = functionSource(assessment, 'reviewIsKcacScoreLockHeader_');
const lockStateSource = functionSource(assessment, 'reviewKcacScoreLocked_');
const lockToggleSource = functionSource(assessment, 'toggleReviewKcacScoreLock_');
assert.match(lockHeaderSource, /점수\\s\*잠금/);
assert.match(lockStateSource, /return !info\.hasStored/, 'legacy review rows must start safely locked');
assert.match(lockToggleSource, /scheduleReviewAutoSave\(true\)/);
assert.match(assessment, /extra\['점수잠금'\]\s*=\s*JSON\.stringify\(j\.scoreLocks\s*\|\|\s*\{\}\)/);
assert.match(assessment, /lockInput\.id\s*=\s*'review-kcac-score-locks-input'/);
assert.match(assessment, /점수 고정 \(슬라이더 잠금\)/);

const switchSource = functionSource(assessment, 'switchReviewGroupItem_');
assert.match(switchSource, /!_reviewDraftDirty[\s\S]*openReviewEdit\(next\)/, 'clean tab switches must not rewrite stored values');

assert.match(assessment, /overallCommentMode:\s*isQualSubmission\s*\?\s*'combined'/);
assert.match(rpc, /data\.push\('점수잠금'\)/, 'new metadata must be appended without shifting historical score columns');
assert.match(rpc, /payload\.overallCommentMode\s*===\s*'combined'/);
assert.match(rpc, /payload\.rows\.forEach\(row\s*=>/);

process.stdout.write('Stage197 KCAC review integrity tests passed.\n');
