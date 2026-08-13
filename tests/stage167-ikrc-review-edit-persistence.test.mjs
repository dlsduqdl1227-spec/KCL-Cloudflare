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

const syncSource = functionSource(assessment, 'applyReviewSavedState_');
assert.match(syncSource, /reviewGroupItems_\(item\)/, 'saved IKRC cup values must update the grouped review items');
assert.match(syncSource, /_reviewState[\s\S]*?\.list/, 'saved values must also update the cached review list');
assert.match(syncSource, /target\.values\[idx\]\s*=\s*updates\[k\]/, 'the header-indexed values cache must be updated');

const autoSaveSource = functionSource(assessment, 'autoSaveReviewEdit');
const manualSaveSource = functionSource(assessment, 'saveReviewEdit');
assert.match(autoSaveSource, /applyReviewSavedState_\(item, saveHeaders, saveUpdates, autoStatus\)/, 'automatic review saves must synchronize all IKRC cup state');
assert.match(manualSaveSource, /applyReviewSavedState_\(item, saveHeaders, saveUpdates, status\)/, 'manual review saves must synchronize all IKRC cup state');

console.log('stage167 IKRC review edit persistence regression tests passed');
