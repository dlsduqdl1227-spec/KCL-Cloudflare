import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rpc = fs.readFileSync(path.join(root, 'functions', 'api', 'rpc.js'), 'utf8');

assert.match(rpc, /async function loadOfficialRankingOverrideMap_\(env, competitionCode\)/, '공식 순위 확정값을 원본 점수와 분리해 불러와야 합니다.');
assert.match(rpc, /kind='OFFICIAL_RANKING_OVERRIDE'/, '공식 순위 확정값은 별도 세션 종류로 보존해야 합니다.');
assert.match(rpc, /g\.calculatedRankingScore = calculatedRankingScore;/, '심사 원점수로 계산한 점수는 감사용으로 보존해야 합니다.');
assert.match(rpc, /g\.rankingScore = override && override\.officialScore !== null/, '공식 확정점수가 있을 때 순위·보고서 표시점수에 적용해야 합니다.');
assert.match(rpc, /if \(hasOfficialRankA \|\| hasOfficialRankB\)/, '공식 발표 순서는 일반 점수 정렬보다 우선해야 합니다.');
assert.match(rpc, /calculatedScore:g\.calculatedRankingScore/, '순위 응답에 계산점수와 공식점수를 함께 추적할 수 있어야 합니다.');
assert.match(rpc, /'OFFICIAL_RANKING_OVERRIDE'\)\"\)\.all|OFFICIAL_RANKING_OVERRIDE'\)\)\.all|OFFICIAL_RANKING_OVERRIDE'\)\.all|OFFICIAL_RANKING_OVERRIDE'\)\"/, 'IKRC 점수 전체 초기화 시 공식 확정값도 함께 제거할 수 있어야 합니다.');

process.stdout.write('Stage179 IKRC official ranking override tests passed.\n');
