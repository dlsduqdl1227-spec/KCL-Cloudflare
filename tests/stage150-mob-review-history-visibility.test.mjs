import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rpc = fs.readFileSync(path.join(root, 'functions', 'api', 'rpc.js'), 'utf8');
const assessment = fs.readFileSync(path.join(root, 'public', 'assessment', 'index.html'), 'utf8');

assert.match(rpc, /function mobParticipantDatesFromRows_/);
assert.match(rpc, /normalizeEffectiveDate_\(actorArg && actorArg\.mobReviewDate\)/);
assert.match(rpc, /mobReviewDates:code === 'MOB' \? mobParticipantDatesFromRows_/);
assert.match(assessment, /function mergeMobReviewResponses_/);
assert.match(assessment, /datedActor\.mobReviewDate = reviewDate/);
assert.match(assessment, /이전 날짜 기록 불러오는 중/);
assert.match(assessment, /조회일/);
const rankingStart = rpc.indexOf('async function buildRankingData_');
const rankingEnd = rpc.indexOf('async function getRanking\(', rankingStart);
const ranking = rpc.slice(rankingStart, rankingEnd);
assert.match(ranking, /MOB 순위는 양일 기록을 모두 유지합니다/);

process.stdout.write('Stage150 MOB review-history visibility tests passed.\n');
