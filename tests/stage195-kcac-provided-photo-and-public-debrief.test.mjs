import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');
const debriefing = fs.readFileSync(new URL('../public/debriefing/index.html', import.meta.url), 'utf8');
const assetsDir = new URL('../public/assets/kcac-prelim/', import.meta.url);

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} function missing`);
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} function incomplete`);
}

// 제공 사진은 예선 참가자를 고르면 자동 연결되며, 사진 저장 여부는 제출을 막지 않습니다.
assert.match(assessment, /KCAC_PRELIM_PHOTO_ASSETS/);
assert.match(assessment, /kcacApplyProvidedPhotosForParticipant_\(\)/);
assert.match(assessment, /사진은 선택 사항입니다\. 저장하지 않아도 점수·스마트태그·코멘트를 제출할 수 있습니다/);
assert.match(assessment, /mediaOptionalStatus/);
assert.doesNotMatch(functionSource(assessment, 'validateKcacBeforeSubmit_'), /snapshots[^\n]*return false/);

const assetFiles = fs.readdirSync(assetsDir).filter(name => /\.(?:png|jpe?g)$/i.test(name));
assert.equal(assetFiles.length, 38, 'provided KCAC preliminary photos must remain complete');
assert.ok(assetFiles.includes('p01-fast.png'));
assert.ok(assetFiles.includes('p22-slow.jpg'));

// 속성별 슬라이더는 개별 잠금이 가능하고, 제출 버튼은 점수 입력 중에도 고정 표시됩니다.
assert.match(assessment, /id="kcac-submit-dock"/);
assert.match(assessment, /전체 제출완료/);
assert.match(functionSource(assessment, 'buildKcacScoreSlider_'), /disabled/);
assert.match(assessment, /점수 고정 \(슬라이더 잠금\)/);
const lockState = { disabled:false };
const lockCtx = {
  _kcac:{ jars:[{ scoreLocks:{} }], currentIdx:0 },
  document:{ querySelector:()=>lockState },
  toast:()=>{}
};
vm.createContext(lockCtx);
vm.runInContext(functionSource(assessment, 'toggleKcacScoreLock_'), lockCtx);
lockCtx.toggleKcacScoreLock_('완성도');
assert.equal(lockCtx._kcac.jars[0].scoreLocks['완성도'], true);
assert.equal(lockState.disabled, true);
lockCtx.toggleKcacScoreLock_('완성도');
assert.equal(lockCtx._kcac.jars[0].scoreLocks['완성도'], false);
assert.equal(lockState.disabled, false);

// 선수 디브리핑은 FAST/SLOW 결과만 보이고 심사 운영용 우유 종류·제품명은 노출하지 않습니다.
const ctx = {};
vm.createContext(ctx);
vm.runInContext(functionSource(debriefing, 'buildKcacCupMetaLine'), ctx);
const fast = ctx.buildKcacCupMetaLine({
  '패턴종류':'FAST Rosetta', '우유종류':'멸균우유', '우유명':'매일멸균우유', '리프수':'14'
});
const slow = ctx.buildKcacCupMetaLine({
  '패턴종류':'SLOW Rosetta', '우유종류':'대체우유', '우유명':'어메이징 오트바리스타', '리프수':'10'
});
assert.equal(fast, 'FAST Rosetta · 리프 14개');
assert.equal(slow, 'SLOW Rosetta · 리프 10개');
assert.doesNotMatch(fast + slow, /멸균|대체|매일|오트/);

process.stdout.write('Stage195 KCAC provided photo and public debrief tests passed.\n');
