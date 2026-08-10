import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rpc = fs.readFileSync(path.join(root, 'functions', 'api', 'rpc.js'), 'utf8');
const assessment = fs.readFileSync(path.join(root, 'public', 'assessment', 'index.html'), 'utf8');

assert.match(rpc, /async function runtimeSchemaReady_\(db\)/, '운영 요청은 완성된 D1 스키마를 먼저 읽기 확인해야 합니다.');
assert.match(rpc, /if \(!await runtimeSchemaReady_\(env\.DB\)\) await ensureSchema\(env\.DB\)/, '스키마가 실제로 누락된 경우에만 DDL을 실행해야 합니다.');
assert.doesNotMatch(rpc, /memoOnce_\('schema', \(\) => ensureSchema\(env\.DB\)\)/, '새 Worker마다 DDL 전체를 반복하면 안 됩니다.');
assert.match(rpc, /WHERE competition_code=\? AND round=\? AND unit=\? ORDER BY id DESC/, 'IKRC 중복 제출은 역할명이 바뀌어도 동일 계정·샘플 기준으로 차단해야 합니다.');
assert.match(rpc, /if \(competitionCode === 'IKRC' && judge\) return judge;/, 'IKRC 평균은 역할 변경과 관계없이 한 계정당 한 표만 사용해야 합니다.');

assert.match(assessment, /var cachedReview = normalizedCode === String\(_reviewState\.code \|\| ''\)\.toUpperCase\(\)/, 'IKRC 검수 새로고침 중 기존 목록을 유지해야 합니다.');
assert.match(assessment, /var cachedMobReview = normalizedCode === 'MOB' \? cachedReview : null;/, '기존 MOB 날짜 병합과 새 공통 목록 보존이 함께 동작해야 합니다.');
assert.match(assessment, /var _ikrcCalibrationRequestSeq = 0;/, 'IKRC 결과 조회는 응답 순서를 식별해야 합니다.');
assert.match(assessment, /requestSeq !== _ikrcCalibrationRequestSeq/, '이전 스테이션의 늦은 응답이 현재 화면을 덮어쓰면 안 됩니다.');
assert.match(assessment, /preserveLoadedList/, 'IKRC 결과 재조회 실패 시 직전 정상 목록을 유지해야 합니다.');
assert.match(assessment, /if \(_ikrcSubmitting\)/, 'IKRC 전체 제출은 연속 클릭을 차단해야 합니다.');
assert.match(assessment, /var autoStatus = reviewIsCalibration_\(item, _reviewState\.code\)[\s\S]*?'수정완료'/, '심사위원 검수 수정은 별도 완료 버튼 없이 수정완료로 저장되어야 합니다.');
assert.match(assessment, /if \(!reviewManageScopeForCode_\(c\)\) return false;/, '검수 상태 전환은 팀장·관리자 운영 화면에만 남겨야 합니다.');
assert.match(rpc, /submittedStationId[\s\S]*?IKRC_STATION_FINALIZATION/, '최종확정 후 새 제출이 들어오면 기존 스테이션 확정을 자동 해제해야 합니다.');
assert.match(rpc, /if \(safeStr\(code\)\.toUpperCase\(\) === 'IKRC'\) return true;/, 'IKRC 공식 제출은 별도 검수완료 버튼 없이 실시간 순위에 반영되어야 합니다.');

process.stdout.write('Stage157 IKRC live readiness tests passed.\n');
