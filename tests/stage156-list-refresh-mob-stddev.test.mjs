import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assessment = fs.readFileSync(path.join(root, 'public', 'assessment', 'index.html'), 'utf8');

assert.match(assessment, /id="review-list-refresh"[^>]+refreshCurrentReviewList_\(\)/);
assert.match(assessment, /function setReviewRefreshState_\(loading\)/);
assert.match(assessment, /function refreshCurrentReviewList_\(\)[\s\S]*?goReviewByCode\(_reviewState\.code, _reviewState\.name, _reviewState\.backPanel\)/);

for (const code of ['KCAC', 'KBC', 'MOB', 'MOC', 'KTCC']) {
  assert.match(
    assessment,
    new RegExp('class="list-refresh-btn participant-list-refresh" data-code="' + code + '"[^>]+refreshEvaluationList_\\(\'' + code + '\'\\)'),
    code + ' evaluation participant list must have an in-place refresh control'
  );
}
assert.match(assessment, /function setParticipantRefreshState_\(code, loading\)/);
assert.match(assessment, /function refreshEvaluationList_\(code\)/);
for (const code of ['KCR', 'IKRC']) {
  assert.match(
    assessment,
    new RegExp('class="list-refresh-btn station-list-refresh" data-code="' + code + '"[^>]+refreshStationEvaluationList_\\(\'' + code + '\'\\)'),
    code + ' station evaluation list must have an in-place refresh control'
  );
}
assert.match(assessment, /function setStationEvaluationRefreshState_\(code, loading\)/);
assert.match(assessment, /function refreshStationEvaluationList_\(code\)[\s\S]*?\.getConfig\(\)/);

const reviewStart = assessment.indexOf('function goReviewByCode(code, name, backPanel)');
const reviewEnd = assessment.indexOf('function isKcacFinalReviewItem_', reviewStart);
assert.ok(reviewStart > 0 && reviewEnd > reviewStart, 'review loader must be present');
const reviewLoader = assessment.slice(reviewStart, reviewEnd);
assert.match(reviewLoader, /showPanel\('pReview'\);\s*setReviewRefreshState_\(true\)/);
assert.ok((reviewLoader.match(/setReviewRefreshState_\(false\)/g) || []).length >= 4, 'refresh control must recover after success, error, failure, and timeout');

const stddevStart = assessment.indexOf('function canShowStddevButton_(code, item)');
const stddevEnd = assessment.indexOf('function canShowKbcStddevButton_', stddevStart);
assert.ok(stddevStart > 0 && stddevEnd > stddevStart, 'standard deviation permission helper must be present');
const stddevGuard = assessment.slice(stddevStart, stddevEnd);
assert.match(stddevGuard, /c === 'IKRC' && isHeadRoleForCode_\(c\)\) return true/);
assert.match(stddevGuard, /c === 'MOB' && \(isAdminRole\(\) \|\| isTeamLeaderForCode_\(c\)\)\) return false/);

const renderReviewStart = assessment.indexOf('function renderReview(list, code, headers, supersededCount)');
const renderReviewEnd = assessment.indexOf('function isReviewEditableHeader', renderReviewStart);
const renderReview = assessment.slice(renderReviewStart, renderReviewEnd);
assert.doesNotMatch(renderReview, /stddev-btn|>표준편차<|toggleStddevPanel_/);

process.stdout.write('Stage156 list refresh and MOB stddev visibility tests passed.\n');
