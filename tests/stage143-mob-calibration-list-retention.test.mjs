import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rpc = fs.readFileSync(path.join(root, 'functions', 'api', 'rpc.js'), 'utf8');
const assessment = fs.readFileSync(path.join(root, 'public', 'assessment', 'index.html'), 'utf8');

const start = rpc.indexOf('async function getMobCalibrationParticipantNumbers');
const end = rpc.indexOf('async function getMobCalibrationResultsByParticipant', start);
assert.ok(start >= 0 && end > start, 'MOB 켈리브레이션 목록 API를 찾을 수 있어야 합니다.');
const source = rpc.slice(start, end);

assert.match(source, /Array\.from\(by\.values\(\)\)\.sort\(/, '참가자 목록은 확인 상태와 관계없이 반환해야 합니다.');
assert.doesNotMatch(source, /filter\s*\(\s*x\s*=>\s*!x\.checked\s*\)/, '검수완료 항목을 목록에서 제거하면 안 됩니다.');
assert.match(assessment, /전체 제출 항목/, '화면에서 전체 제출 항목을 표시한다고 안내해야 합니다.');
assert.doesNotMatch(assessment, /확인완료 항목 숨김|검수완료된 항목은 목록에서 숨겨집니다/, '완료 항목 숨김 안내가 남아 있으면 안 됩니다.');
assert.match(assessment, /item\.checked \? '검수완료' : '검수확인'/, '완료 여부는 목록 배지로 구분되어야 합니다.');
assert.match(assessment, /if \(code === 'MOB'\) return false;/, 'MOB 검수완료 제출은 진행 중 목록에서 숨기면 안 됩니다.');
assert.match(assessment, /var _rankingCacheByCode = \{\};/, '대회별 마지막 정상 순위를 화면에 보존해야 합니다.');
assert.match(assessment, /_rankingCacheByCode\[rankingCode\] = res;/, '정상 순위 응답을 대회별로 저장해야 합니다.');
assert.match(assessment, /기존 순위 표시 중 · 최신 정보/, '순위 재조회 중 기존 표를 유지해야 합니다.');
assert.match(assessment, /cachedMobReview/, 'MOB 검수 재조회 중 기존 목록을 유지해야 합니다.');

process.stdout.write('Stage143 MOB calibration list retention tests passed.\n');
