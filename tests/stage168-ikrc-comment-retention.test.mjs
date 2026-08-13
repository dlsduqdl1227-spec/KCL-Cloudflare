import assert from 'node:assert/strict';
import fs from 'node:fs';

const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body is incomplete`);
}

const ikrcInput = functionSource(assessment, 'onIkrcCommentInput');
assert.match(ikrcInput, /s\.comment\s*=\s*document\.getElementById\('ikrc-comment'\)\.value/, 'IKRC comment text must enter the active cup state immediately');
assert.match(ikrcInput, /kclScheduleEvalDraftSave_\(\)/, 'IKRC comment typing must schedule a local draft save');
assert.doesNotMatch(ikrcInput, /renderIkrcAttrTabs\(\)|renderIkrcNav\(\)/, 'mobile composition input must not rebuild navigation on every keystroke');
assert.match(assessment, /id="ikrc-comment"[\s\S]*?onblur="saveIkrc\(\); kclSaveActiveEvalDraftNow_\(true\)"/, 'leaving the IKRC comment field must persist the local draft immediately');

const reviewSchedule = functionSource(assessment, 'scheduleReviewAutoSave');
assert.match(reviewSchedule, /captureReviewDraftValues_\(\)/, 'review comments must be copied into the in-memory cup state before debounce');
assert.match(reviewSchedule, /_reviewDraftVersion\s*\+=\s*1/, 'review edits must be versioned so an older response cannot mark a newer comment as saved');

const reviewBack = functionSource(assessment, 'backToReviewList');
assert.match(reviewBack, /flushReviewAutoSaveThen_/, 'leaving review must wait for the pending comment save');
assert.match(reviewBack, /화면 이동을 중단/, 'failed comment saves must keep the judge on the edit screen');

for (const name of ['toggleIkrcBranchValue_', 'selectIkrcTag', 'removeIkrcTag']) {
  assert.match(functionSource(assessment, name), /kclScheduleEvalDraftSave_\(\)/, `${name} must persist IKRC smart-tag changes to the local draft`);
}
assert.match(assessment, /extra\[header\]\s*=\s*\(s\[ikrcTagKey_\(a\.key\)\]\s*\|\|\s*\[\]\)\.join\(', '\)/, 'every IKRC attribute smart-tag value must be included in submission');
assert.match(assessment, /data:\s*\[s\.no\][\s\S]*?s\.comment\s*\|\|\s*''/, 'every IKRC cup comment must be included in submission');

console.log('stage168 IKRC evaluation and review comment-retention tests passed');
