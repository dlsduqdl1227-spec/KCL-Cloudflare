import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} function not found`);
  const open = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} function incomplete`);
}

const context = {};
vm.createContext(context);
vm.runInContext([
  functionSource(assessment, "competitionOptionSettings_"),
  functionSource(assessment, "ikrcStationRoundKey_"),
  functionSource(assessment, "ikrcDefaultStationPrefix_"),
  functionSource(assessment, "ikrcStationId_"),
  functionSource(assessment, "ikrcStationPrefix_"),
  functionSource(assessment, "ikrcStationRangeNumber_"),
  functionSource(assessment, "kcrProcessKeyFromValue_"),
  functionSource(assessment, "kcrDefaultStationProcess_"),
  functionSource(assessment, "kcrStationProcess_"),
  functionSource(assessment, "kcrStationSettings_"),
  functionSource(assessment, "kcrStationParticipantNumbers_"),
].join("\n"), context);

const normalized = context.kcrStationSettings_({
  currentRound:"예선",
  optionSettings:{kcrStations:{byRound:{예선:[
    {id:"station3", label:"스테이션 3", prefix:"A", start:101, end:102, process:"Washed"},
    {id:"station4", label:"스테이션 4", prefix:"B", start:103, end:104, process:"Natural"},
  ]}}},
});
assert.deepEqual(Array.from(normalized, item => item.label), ["스테이션 1", "스테이션 2"]);
assert.deepEqual(Array.from(normalized, item => item.id), ["station3", "station4"], "stable ids must preserve historical score linkage");
assert.deepEqual(Array.from(context.kcrStationParticipantNumbers_(normalized[0])), ["101", "102"]);
assert.ok(normalized.every(item => item.numberMode === "participant"));

const rowHtml = functionSource(assessment, "ikrcStationConfigRowHtml_");
assert.match(rowHtml, /code === 'KCR' \? ''/);
assert.match(rowHtml, /참가자 시작번호/);
assert.match(rowHtml, /useForCalibration/);
assert.match(rowHtml, /useForCompetition/);
assert.match(functionSource(assessment, "ikrcRenumberStationConfigRows_"), /'스테이션 ' \+ \(index \+ 1\)/);
assert.match(assessment, /@media\(max-width:620px\)[\s\S]*kcr-station-process-field/);
assert.match(assessment, /kcr-station-manager-panel[^}]*overflow:hidden/);

const rankingActions = assessment.match(/<div class="report-actions" id="ranking-report-actions"[\s\S]*?<\/div>/)?.[0] || "";
assert.match(rankingActions, /순위 PDF 저장/);
assert.match(rankingActions, /최종디브리핑 엑셀/);
assert.doesNotMatch(rankingActions, /점수·검수 백업/);
assert.match(functionSource(assessment, "renderRanking"), /rankingCode === 'KCR'/);
assert.match(functionSource(assessment, "renderRanking"), /slice\(0, 30\)/);
assert.match(functionSource(assessment, "finalReportFileBase_"), /_최종디브리핑_/);

const serverNormalize = functionSource(rpc, "normalizeKcrStationListServer_");
const serverValidate = functionSource(rpc, "validateKcrStationSubmission_");
assert.match(serverNormalize, /useForCalibration/);
assert.match(serverNormalize, /useForCompetition/);
assert.match(serverNormalize, /numberMode:'participant'/);
assert.match(serverValidate, /kcrStationsForPurposeServer_/);
assert.match(serverValidate, /String\(station\.start \+ idx\)/);
assert.doesNotMatch(serverValidate, /`\$\{station\.prefix\}-\$\{station\.start \+ idx\}`/);
assert.match(functionSource(rpc, "submitScores"), /participants WHERE competition_code=\?/);
assert.match(functionSource(rpc, "getReviewList"), /calibrationOnly/);
assert.match(functionSource(rpc, "getReviewList"), /kcrCalibrationReviewComparison_/);

// All shared official output paths must continue to exclude calibration rows.
assert.match(functionSource(rpc, "shouldCountItemInRanking_"), /isCalibrationMode_/);
assert.match(functionSource(rpc, "getReviewList"), /list\.filter\(item => !isCalibrationMode_/);

process.stdout.write("Stage158 KCR participant-station, calibration, mobile, and Top30 tests passed.\n");
