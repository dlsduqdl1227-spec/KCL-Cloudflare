import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assessment = fs.readFileSync(path.join(root, 'public', 'assessment', 'index.html'), 'utf8');

assert.match(assessment, /reviewCode === 'MOB'/);
assert.match(assessment, /'참가자 ' \+ unit \+ '번'/);
assert.match(assessment, /mobParticipantName \? ' · ' \+ mobParticipantName : ' · 선수명 미입력'/);
assert.match(assessment, /'심사: ' \+ checkedBy/);
assert.match(assessment, /reviewGroupTitle_\(item, 'MOB'\) \+ ' · 심사: ' \+ mobReviewJudge/);

process.stdout.write('Stage147 MOB review participant-identity tests passed.\n');
