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
assert.match(verifySource, /code === 'IKRC' && ikrcBlindUnits\.length/, 'IKRC debriefing must query exact blind units');
assert.match(verifySource, /unit IN \(\$\{placeholders\}\)/, 'IKRC debriefing must use an exact SQL unit match');
assert.match(verifySource, /ikrcBlindPairSet\.has\(key\)/, 'IKRC results must be restricted to the assigned round and blind unit');
assert.doesNotMatch(verifySource, /code === 'IKRC'[\s\S]{0,180}payload_json LIKE/, 'IKRC must never fall back to broad payload substring matching');

const previewOptions = functionSource(rpc, 'getAdminDebriefPreviewOptions');
const preview = functionSource(rpc, 'getAdminDebriefPreview');
assert.match(previewOptions, /officialReviewCompleted_\(code, item\)/, 'IKRC submitted official scores must remain previewable even without a manual review-status change');
assert.match(preview, /officialReviewCompleted_\(code, item\)/, 'admin preview and player debriefing must share the official-score rule');

const avgBox = functionSource(debriefing, 'buildIkrcRoundAverageBox_');
assert.match(avgBox, /총점 합계.*÷/, 'the debriefing sheet must show the exact average formula');
assert.match(avgBox, /스테이션 10컵의 평균이 아니라/, 'the sheet must explain that it averages judges for one player');
const rankBox = functionSource(debriefing, 'buildRankBox');
assert.match(rankBox, /전체 ' \+ main\.totalInRound \+ '명 기준/, 'IKRC rank denominator must be labelled instead of shown as an unexplained slash');
assert.match(rankBox, /main\.rank \+ '위'/, 'IKRC rank must include the rank unit');
assert.match(functionSource(debriefing, 'buildReportIntro'), /공식 제출 평가 결과/, 'IKRC public cards must be labelled as official submissions, not hidden by a manual review-status label');
assert.match(functionSource(debriefing, 'renderResult'), /라운드별 블라인드코드 배정/, 'an unassigned IKRC player must get an actionable empty-state message');

process.stdout.write('Stage182 IKRC exact debrief matching tests passed.\n');
