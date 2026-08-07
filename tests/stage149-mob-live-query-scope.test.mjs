import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rpc = fs.readFileSync(path.join(root, 'functions', 'api', 'rpc.js'), 'utf8');

assert.match(rpc, /function mobActiveParticipantUnitsFromRows_/);
assert.match(rpc, /participantScheduleSortMeta_\(row\)\.date !== activeDate/);
assert.match(rpc, /participantRoundNumber_\(row, 'MOB', round\)/);
assert.match(rpc, /function scopeMobScoreRowsToActiveDate_/);
assert.match(rpc, /filter\(row => !isCalibrationMode_\(row && row\.mode\)\)/);
assert.match(rpc, /officialRows\.filter\(row => activeUnits\.has\(safeStr\(row && row\.unit\)\)\)/);

const reviewStart = rpc.indexOf('async function getReviewList');
const reviewEnd = rpc.indexOf('async function updateReviewRow', reviewStart);
const review = rpc.slice(reviewStart, reviewEnd);
assert.match(review, /scopeMobScoreRowsToActiveDate_\(code, cfg, scopedParticipantRows, rowsRaw\.results \|\| \[\]\)/);

const rankingStart = rpc.indexOf('async function buildRankingData_');
const rankingEnd = rpc.indexOf('async function getRanking\(', rankingStart);
const ranking = rpc.slice(rankingStart, rankingEnd);
assert.match(ranking, /scopeMobScoreRowsToActiveDate_\(code, cfg, participantRows, rowsRaw\.results \|\| \[\]\)/);

process.stdout.write('Stage149 MOB live query-scope tests passed.\n');
