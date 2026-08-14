import assert from 'node:assert/strict';
import fs from 'node:fs';

const rpc = fs.readFileSync(new URL('../functions/api/rpc.js', import.meta.url), 'utf8');
const rowItemStart = rpc.indexOf('function rowToReviewItem(');
const rowItemsStart = rpc.indexOf('function rowToReviewItems_(', rowItemStart);
assert.ok(rowItemStart >= 0 && rowItemsStart > rowItemStart, 'row review conversion functions must exist');

const source = rpc.slice(rowItemStart, rowItemsStart);
assert.match(source, /normalizedCode === 'IKRC'/, 'IKRC must have an explicit payload normalization guard');
assert.match(source, /payload\.extraFields = Object\.assign\(\{\}/, 'IKRC payload must rebuild top-level extraFields');
assert.match(source, /targetRow\.extraFields\s*\n?\s*\);/, 'row-level score fields must override stale top-level values');
assert.ok(
  source.indexOf('payload.extraFields = Object.assign') < source.indexOf('item.payload = payload'),
  'payload normalization must happen before the public review/debrief item is returned'
);

process.stdout.write('Stage187 IKRC score payload authority tests passed.\n');
