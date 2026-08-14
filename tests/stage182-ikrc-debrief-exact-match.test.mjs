import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rpc = fs.readFileSync(path.join(root, 'functions', 'api', 'rpc.js'), 'utf8');
const debriefing = fs.readFileSync(path.join(root, 'public', 'debriefing', 'index.html'), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const actualStart = start >= 0 ? start : asyncStart;
  assert.ok(actualStart >= 0, `${name} function not found`);
  const open = source.indexOf('{', actualStart);
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
    if (ch === '}' && --depth === 0) return source.slice(actualStart, i + 1);
  }
  throw new Error(`${name} function incomplete`);
}

const targetSource = functionSource(rpc, 'ikrcParticipantBlindTargets_');
const targetContext = {
  parseJson: (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } },
  safeStr: value => value == null ? '' : String(value).trim(),
  roundName_: value => String(value || '').trim()
};
vm.createContext(targetContext);
vm.runInContext(targetSource, targetContext);
const targets = targetContext.ikrcParticipantBlindTargets_({
  extra_json: JSON.stringify({ ikrcBlindAssignments: { '예선':' C-3 ', '결선':'F-2' } })
});
assert.deepEqual(JSON.parse(JSON.stringify(targets)), [
  { round:'예선', unit:'C-3', key:'예선::C-3' },
  { round:'결선', unit:'F-2', key:'결선::F-2' }
]);

const verifySource = functionSource(rpc, 'verifyOTP');
assert.match(verifySource, /code === 'IKRC'[\s\S]*buildIkrcPublicDebriefBundle_\(env, ikrcBlindTargets\)/, 'IKRC player verification must use the shared public debrief bundle');
assert.match(verifySource, /if \(code !== 'IKRC' && !scoreRows\.length/, 'broad legacy fallbacks must remain unreachable for IKRC');

const previewOptions = functionSource(rpc, 'getAdminDebriefPreviewOptions');
const preview = functionSource(rpc, 'getAdminDebriefPreview');
assert.match(previewOptions, /code === 'IKRC' \|\| officialReviewCompleted_\(code, item\)/, 'IKRC submitted official scores must remain previewable even without a manual review-status change');
assert.match(preview, /code === 'IKRC'[\s\S]*buildIkrcPublicDebriefBundle_\(env/, 'admin preview must use the same shared bundle as the player route');

const bundleContext = {
  buildRankingData_: async () => { throw new Error('the supplied ranking data must be used'); },
  roundName_: (value, fallback='예선') => String(value || fallback),
  safeStr: value => value == null ? '' : String(value).trim(),
  itemNumber_: item => String(item && (item.unit || item['참가자번호']) || ''),
  officialScoreItemsForOutput_: (_code, items) => items,
  shouldCountItemInRanking_: (_code, item) => !item.calibration,
  toNumber: value => value == null || value === '' || Number.isNaN(Number(value)) ? null : Number(value),
  roundScoreValue_: (value, decimals=3) => Math.round(Number(value) * 10 ** decimals) / 10 ** decimals,
  isHeadRole_: value => /헤드|head/i.test(String(value || ''))
};
vm.createContext(bundleContext);
vm.runInContext(functionSource(rpc, 'ikrcDebriefTargetKey_'), bundleContext);
vm.runInContext('async ' + functionSource(rpc, 'buildIkrcPublicDebriefBundle_'), bundleContext);
const bundle = await bundleContext.buildIkrcPublicDebriefBundle_({}, [{round:'예선', unit:'C-3'}], {
  cfg:{current_round:'예선'},
  headers:['총점'],
  rows:[
    {round:'예선', unit:'C-3', 역할:'헤드심사위원', 총점:73.2},
    {round:'예선', unit:'C-3', 역할:'센서리심사위원', 총점:64.6},
    {round:'예선', unit:'C-3', 역할:'센서리심사위원', 총점:63.8},
    {round:'예선', unit:'C-3', 역할:'센서리심사위원', 총점:66.4},
    {round:'예선', unit:'D-1', 역할:'헤드심사위원', 총점:99},
    {round:'예선', unit:'C-3', calibration:true, 역할:'헤드심사위원', 총점:100}
  ],
  ranking:[
    {round:'예선', unit:'C-3', rank:8, avgScore:68.15},
    {round:'예선', unit:'D-1', rank:1, avgScore:99}
  ]
});
assert.equal(bundle.scores.length, 4, 'only the four official displayed C-3 scorecards may enter the bundle');
assert.equal(bundle.rankInfo.avgScore, 67, 'the public average must be 268 divided by the four displayed scorecards');
assert.equal(bundle.rankInfo.displayedScoreSum, 268);
assert.equal(bundle.rankInfo.displayedScoreCount, 4);
assert.equal(bundle.rankInfo.headCount, 1);
assert.equal(bundle.rankInfo.sensoryCount, 3);

const avgBox = functionSource(debriefing, 'buildIkrcRoundAverageBox_');
assert.match(avgBox, /총점 합계.*÷/, 'the debriefing sheet must show the exact average formula');
assert.match(avgBox, /스테이션 10컵의 평균이 아니라/, 'the sheet must explain that it averages judges for one player');
assert.match(avgBox, /totalSum \/ totals\.length/, 'the visible average must be recalculated from the visible scorecards');
assert.doesNotMatch(avgBox, /rank\.avgScore/, 'a stale ranking average must never override the visible scorecards');
const rankBox = functionSource(debriefing, 'buildRankBox');
assert.match(rankBox, /전체 ' \+ main\.totalInRound \+ '명 기준/, 'IKRC rank denominator must be labelled instead of shown as an unexplained slash');
assert.match(rankBox, /main\.rank \+ '위'/, 'IKRC rank must include the rank unit');
assert.match(functionSource(debriefing, 'buildReportIntro'), /공식 제출 평가 결과/, 'IKRC public cards must be labelled as official submissions, not hidden by a manual review-status label');
assert.match(functionSource(debriefing, 'renderResult'), /라운드별 블라인드코드 배정/, 'an unassigned IKRC player must get an actionable empty-state message');

process.stdout.write('Stage182 IKRC exact debrief matching tests passed.\n');
