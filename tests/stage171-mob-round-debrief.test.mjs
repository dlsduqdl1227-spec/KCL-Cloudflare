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

const context = {
  fmtScore(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : String(value ?? '');
  }
};
vm.createContext(context);
for (const name of [
  'mobPublicRoleFlags_',
  'mobPublicHeaderGroup_',
  'mobPublicRoundIsFinal_',
  'mobPublicCreativeApplies_',
  'mobPublicIsDerivedSummaryHeader_',
  'mobPublicHeaderAppliesToRole_',
  'mobPublicBreakdownItems_'
]) {
  vm.runInContext(functionSource(name), context);
}

const prelimSensory = { 라운드:'예선', 메뉴:'창작', 역할:'센서리 심사위원' };
assert.equal(context.mobPublicCreativeApplies_(prelimSensory), false, '예선에서는 메뉴 저장값과 무관하게 창작메뉴를 공개하지 않아야 합니다.');
assert.equal(context.mobPublicHeaderAppliesToRole_('Creative Flavor(창작 향미)', prelimSensory), false);
assert.equal(context.mobPublicHeaderAppliesToRole_('Creative Flavor 스마트태그', prelimSensory), false);
assert.equal(context.mobPublicHeaderAppliesToRole_('Creative Flavor 코멘트', prelimSensory), false);

const finalSensory = { 라운드:'결선', 메뉴:'창작', 역할:'센서리 심사위원' };
assert.equal(context.mobPublicCreativeApplies_(finalSensory), true, '결선 창작메뉴 평가는 공개되어야 합니다.');
assert.equal(context.mobPublicHeaderAppliesToRole_('Creative Flavor(창작 향미)', finalSensory), true);

for (const header of [
  '총점',
  '테크니컬 총점',
  '센서리 총점',
  '창작메뉴 총점',
  '감점 전 합산',
  '감점 적용 후 점수',
  '순위 반영점수',
  '총평가 반영점수',
  'Official Total',
  'Final Reflected Score'
]) {
  assert.equal(context.mobPublicIsDerivedSummaryHeader_(header), true, `${header}은 중복 계산 점수로 분류되어야 합니다.`);
}

assert.deepEqual(
  JSON.parse(JSON.stringify(context.mobPublicBreakdownItems_({ 경기시간:'09분 37초', 시간감점:0 }))),
  [{ label:'경기시간', value:'09분 37초', numeric:false }],
  '감점이 0이면 경기시간만 보여야 합니다.'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.mobPublicBreakdownItems_({ 경기시간:'10분 05초', 시간감점:1 }))),
  [
    { label:'경기시간', value:'10분 05초', numeric:false },
    { label:'시간 감점', value:'-1', numeric:false }
  ],
  '실제 감점이 있을 때만 감점 정보를 보여야 합니다.'
);

const genericSource = functionSource('buildGenericScoreGrid');
assert.match(genericSource, /mobPublicIsDerivedSummaryHeader_\(k\)/);
assert.match(genericSource, /경기시간\|시연시간\|Elapsed/);

const breakdownSource = functionSource('buildMobBreakdownGrid_');
assert.doesNotMatch(breakdownSource, /테크니컬 평가항목 점수|센서리 평가항목 점수|창작메뉴 평가항목 점수|총평가 반영점수|순위 반영점수/);

const scoreCardSource = functionSource('buildScoreCard');
assert.match(scoreCardSource, /평가 반영 점수/);

const smartTagSource = functionSource('buildSmartTagBox');
const commentSource = functionSource('buildCommentBox');
assert.match(smartTagSource, /compCode[\s\S]*MOB[\s\S]*mobPublicHeaderAppliesToRole_/);
assert.match(commentSource, /comp === 'MOB'[\s\S]*mobPublicHeaderAppliesToRole_/);

process.stdout.write('Stage171 MOB round-aware debrief display tests passed.\n');
