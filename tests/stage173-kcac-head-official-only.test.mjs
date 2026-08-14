import assert from 'node:assert/strict';
import fs from 'node:fs';

const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');
const rpc = fs.readFileSync(new URL('../functions/api/rpc.js', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} function missing`);
  let depth = 0;
  let bodyStarted = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') { depth += 1; bodyStarted = true; }
    if (ch === '}' && bodyStarted && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} function incomplete`);
}

const canCalibration = functionSource(assessment, 'canCalibrationCode_');
assert.doesNotMatch(canCalibration, /'KCAC'/, 'KCAC must not be in the calibration-enabled competition list');

const goCalibration = functionSource(assessment, 'goCalibration');
assert.match(goCalibration, /code === 'KCAC'[\s\S]*setEvaluationPurpose_\('competition'\)/);
assert.match(goCalibration, /헤드 심사위원 4명이 공식 대회평가/);

const assertCanEvaluate = functionSource(assessment, 'assertCanEvaluate');
assert.match(assertCanEvaluate, /code === 'KCAC'[\s\S]*isHeadRoleForCode_/);

const startKcac = functionSource(assessment, 'startKcac');
assert.match(startKcac, /setEvaluationPurpose_\('competition'\)/);
assert.match(startKcac, /헤드 심사위원 공식평가 · 공식 점수 반영/);
assert.doesNotMatch(startKcac, /isActiveCalibrationMode_\(|evaluationPurposeDisplayLabel_\(/);

const submitKcac = functionSource(assessment, 'kcacSubmitAll');
assert.match(submitKcac, /extra\['평가구분'\]\s*=\s*'대회평가'/);
assert.match(submitKcac, /extra\['켈리브레이션범위'\]\s*=\s*''/);
assert.match(submitKcac, /mode:\s*'judge'/);
assert.doesNotMatch(submitKcac, /evaluationModeValue_\(|evaluationPurposeExtraFields_\(/);

const submitScores = functionSource(rpc, 'submitScores');
assert.match(submitScores, /initial\.code === 'KCAC'[\s\S]*requestedEvaluationCategory !== 'competition'/);
assert.match(submitScores, /KCAC는 별도 켈리브레이션 없이 헤드 심사위원의 공식 대회평가만 저장합니다/);
assert.match(submitScores, /initial\.code === 'KCAC'[\s\S]*!\/헤드\|head\/i\.test\(actorRole\)/);

const aggregateRanking = functionSource(rpc, 'aggregateRankingGroup_');
assert.match(aggregateRanking, /code === 'KCAC'[\s\S]*avgFinite_\(submissionAggs\.map\(x => x\.total\)\)/, 'KCAC preliminary ranking must average the submitted head evaluations');
assert.match(aggregateRanking, /code === 'KCAC'[\s\S]*avgFinite_\(patternAggs\.map\(x => x\.patternTotal\)\)[\s\S]*avgFinite_\(sensoryAggs\.map\(x => x\.sensoryTotal\)\)/, 'KCAC final ranking must aggregate the head evaluation areas');

assert.match(rpc, /KCAC:\s*\['예선','결선'\]/, 'KCAC must retain both preliminary and final rounds');

process.stdout.write('Stage173 KCAC head-only official evaluation tests passed.\n');
