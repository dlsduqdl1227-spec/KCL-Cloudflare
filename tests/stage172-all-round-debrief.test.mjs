import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public', 'debriefing', 'index.html'), 'utf8');

function functionSource(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  assert.ok(start >= 0, `${name} 함수를 찾을 수 없습니다.`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = bodyStart; i < html.length; i += 1) {
    const char = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`${name} 함수 끝을 찾을 수 없습니다.`);
}

const context = {};
vm.createContext(context);
[
  'publicRoundName_',
  'publicRoundIsFinal_',
  'kcacPublicHeaderGroup_',
  'kcacPublicPurposeGroup_',
  'kcacPublicHeaderAppliesToPurpose_',
  'publicHeaderAppliesToRound_',
  'mobPublicRoleFlags_',
  'mobPublicHeaderGroup_',
  'mobPublicRoundIsFinal_',
  'mobPublicCreativeApplies_',
  'mobPublicIsDerivedSummaryHeader_',
  'mobPublicHeaderAppliesToRole_',
  'publicHeaderAppliesToEvaluation_',
  'publicIsDerivedSummaryHeader_',
  'publicIsZeroPenalty_'
].forEach((name) => vm.runInContext(functionSource(name), context));

const prelim = { 라운드:'예선' };
const main = { 라운드:'본선' };
const final = { 라운드:'결선' };

// KBC 예선은 에스프레소 중심, 본·결선에서만 Signature 평가를 공개한다.
assert.equal(context.publicHeaderAppliesToRound_('Espresso Flavor(플레이버)', prelim, 'KBC'), true);
for (const header of [
  'Signature Flavor(플레이버)',
  'Signature Flavor 스마트태그',
  'Signature Flavor 코멘트'
]) {
  assert.equal(context.publicHeaderAppliesToRound_(header, prelim, 'KBC'), false, `${header}은 KBC 예선에서 숨겨야 합니다.`);
  assert.equal(context.publicHeaderAppliesToRound_(header, main, 'KBC'), true, `${header}은 KBC 본선에서 보여야 합니다.`);
  assert.equal(context.publicHeaderAppliesToRound_(header, final, 'KBC'), true, `${header}은 KBC 결선에서 보여야 합니다.`);
}

// KCAC는 라운드뿐 아니라 결선 심사영역(창작패턴/센서리용아트)도 독립 표시한다.
const kcacPrelim = { 라운드:'예선', 잔용도:'예선 패턴평가' };
const kcacPattern = { 라운드:'결선', 잔용도:'창작패턴평가' };
const kcacSensory = { 라운드:'결선', 잔용도:'센서리용아트' };
assert.equal(context.publicHeaderAppliesToRound_('예선 Pattern Completion 스마트태그', kcacPrelim, 'KCAC'), true);
assert.equal(context.publicHeaderAppliesToRound_('결선 Theme Expression 스마트태그', kcacPrelim, 'KCAC'), false);
assert.equal(context.publicHeaderAppliesToRound_('예선 Surface Quality 스마트태그', kcacPattern, 'KCAC'), false);
assert.equal(context.publicHeaderAppliesToRound_('결선 Theme Expression 스마트태그', kcacPattern, 'KCAC'), true);
assert.equal(context.publicHeaderAppliesToRound_('결선 Mouthfeel 스마트태그', kcacPattern, 'KCAC'), false);
assert.equal(context.publicHeaderAppliesToRound_('결선 Mouthfeel 스마트태그', kcacSensory, 'KCAC'), true);
assert.equal(context.publicHeaderAppliesToRound_('결선 Design Completion 스마트태그', kcacSensory, 'KCAC'), false);

// IKRC 결선 가산점, KTCC 내부 검수 필드는 공개 범위를 분리한다.
assert.equal(context.publicHeaderAppliesToRound_('Seed to Cup 가산점', prelim, 'IKRC'), false);
assert.equal(context.publicHeaderAppliesToRound_('Seed to Cup 가산점', final, 'IKRC'), true);
assert.equal(context.publicHeaderAppliesToRound_('Section1 원기록 정답수', prelim, 'KTCC'), false);
assert.equal(context.publicHeaderAppliesToRound_('Section1 전체오답(Y/N)', final, 'KTCC'), false);
assert.equal(context.publicHeaderAppliesToRound_('Section1 정답수', prelim, 'KTCC'), true);

// KCR·MOC는 라운드마다 동일한 공식 평가항목을 쓰므로 정상 유지한다.
assert.equal(context.publicHeaderAppliesToRound_('Flavor(플레이버)', prelim, 'KCR'), true);
assert.equal(context.publicHeaderAppliesToRound_('Flavor(플레이버)', final, 'KCR'), true);
assert.equal(context.publicHeaderAppliesToRound_('정답수', prelim, 'MOC'), true);
assert.equal(context.publicHeaderAppliesToRound_('정답수', final, 'MOC'), true);

// 화면용 파생 점수는 대표 총점과 중복되므로 상세 항목에서 제거한다.
for (const header of ['총점', '최종점수']) {
  assert.equal(context.publicIsDerivedSummaryHeader_(header, 'MOC'), true);
}
for (const header of ['Espresso Total', 'Signature Total']) {
  assert.equal(context.publicIsDerivedSummaryHeader_(header, 'KBC'), true);
}
for (const header of ['정규화점수', '공식점수', '순위반영점수']) {
  assert.equal(context.publicIsDerivedSummaryHeader_(header, 'KCR'), true);
}
assert.equal(context.publicIsZeroPenalty_('시간감점', 0), true);
assert.equal(context.publicIsZeroPenalty_('시간감점', 3), false);

const genericGrid = functionSource('buildGenericScoreGrid');
assert.match(genericGrid, /publicHeaderAppliesToEvaluation_\(k, s, comp\)/);
assert.match(genericGrid, /publicIsDerivedSummaryHeader_\(k, comp\)/);
assert.match(genericGrid, /publicIsZeroPenalty_\(k, v\)/);

const scoreCard = functionSource('buildScoreCard');
assert.match(scoreCard, /개별 평가 점수/, 'IKRC 개별 카드에는 반복 평균이 아닌 개별 점수를 표시해야 합니다.');
assert.doesNotMatch(scoreCard, /__ikrcRoundAvgScore[^\n]*\?/, 'IKRC 라운드 평균을 모든 카드 총점으로 반복하면 안 됩니다.');

const rankBox = functionSource('buildRankBox');
assert.doesNotMatch(rankBox, /가산점 반영 최종 점수/, 'IKRC 선수 디브리핑에는 내부 공식점수 명칭을 노출하지 않아야 합니다.');
assert.match(rankBox, /var scoreCells = isIkrc\s*\? ''/, 'IKRC 선수 디브리핑 순위 카드에는 평균점수와 중복되는 공식점수 셀을 숨겨야 합니다.');
assert.match(rankBox, /box\.classList\.add\('rank-only'\)/, 'IKRC 순위 카드는 점수 셀을 숨긴 레이아웃을 사용해야 합니다.');

const ikrcGrid = functionSource('buildCuppingScoreGrid');
assert.match(ikrcGrid, /publicRoundIsFinal_\(s\)/);
assert.match(ikrcGrid, /Seed to Cup 가산점/);

const kcacGrid = functionSource('buildKcacScoreGrid');
assert.match(kcacGrid, /kcacPublicHeaderAppliesToPurpose_\(item\.label, s\)/);
assert.doesNotMatch(kcacGrid, /→ 최종/, 'KCAC 카드 상단 총점과 감점 안내에서 최종점수를 반복하면 안 됩니다.');

process.stdout.write('Stage172 all-competition round-aware debrief tests passed.\n');
