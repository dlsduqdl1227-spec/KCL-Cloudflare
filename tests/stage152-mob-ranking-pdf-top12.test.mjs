import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assessment = fs.readFileSync(path.join(root, 'public', 'assessment', 'index.html'), 'utf8');

const start = assessment.indexOf('function printRanking()');
const end = assessment.indexOf('function openRankingDetail', start);
const printRanking = assessment.slice(start, end);

assert.match(printRanking, /isMobTop12/);
assert.match(printRanking, /index >= 12/);
assert.match(printRanking, /mob-print-hidden/);
assert.match(printRanking, /MOB TOP 12 순위표/);
assert.match(printRanking, /afterprint/);
assert.match(assessment, /#pRanking\.mob-top12-print \.rank-row\.mob-print-hidden\{display:none!important\}/);
assert.match(assessment, /data-ranking-position/);

process.stdout.write('Stage152 MOB ranking PDF Top-12 tests passed.\n');
