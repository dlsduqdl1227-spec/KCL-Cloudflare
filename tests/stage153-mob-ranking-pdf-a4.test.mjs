import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assessment = fs.readFileSync(path.join(root, 'public', 'assessment', 'index.html'), 'utf8');

assert.match(assessment, /#pRanking\.mob-top12-print \.rank-row:not\(\.mob-print-hidden\)/);
assert.match(assessment, /min-height:9mm!important/);
assert.match(assessment, /padding:1\.25mm 2\.4mm!important/);
assert.match(assessment, /#pRanking\.mob-top12-print \.rank-meta\{display:none!important\}/);
assert.match(assessment, /#pRanking\.mob-top12-print \.rank-summary/);
assert.match(assessment, /#pRanking\.mob-top12-print #rank-print-title/);

process.stdout.write('Stage153 MOB ranking PDF single-A4 tests passed.\n');
