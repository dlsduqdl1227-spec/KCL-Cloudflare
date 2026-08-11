import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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

assert.match(assessment, /id="kcr-station-grid"/);
assert.match(assessment, /팀장이 현재 라운드에 오픈한 스테이션/);
assert.match(functionSource(assessment, "renderKcrStationChoices_"), /kcrStationSettings_/);
assert.match(functionSource(assessment, "renderKcrStationChoices_"), /startKcrStation_/);
assert.match(functionSource(assessment, "startKcrStation_"), /initCuppingEval\(cups/);
assert.match(functionSource(assessment, "startKcrStation_"), /station\.process/);
assert.match(functionSource(assessment, "startKcrStation_"), /registeredTargetsForRange_\('KCR'/);
assert.match(functionSource(assessment, "showCuppingSetup"), /renderKcrStationChoices_/);
assert.doesNotMatch(functionSource(assessment, "showCuppingSetup"), /switchCuppingFinalsTab/);

const configHtml = functionSource(assessment, "configSelectableOptionsHtml_");
const configPayload = functionSource(assessment, "configSelectableOptionsPayload_");
assert.match(configHtml, /선수등록의 참가자번호/);
assert.match(configHtml, /kcrStations/);
assert.match(configPayload, /out\.kcrStations/);
assert.match(configPayload, /kcrProcess/);
assert.match(configPayload, /최대 20명의 참가자/);
assert.match(configPayload, /useForCalibration/);
assert.match(configPayload, /useForCompetition/);
assert.match(configPayload, /numberMode:'participant'/);
assert.match(functionSource(assessment, "ikrcRenderStationConfigForRound_"), /code === 'KCR' \? kcrStationSettings_/);

assert.match(assessment, /data-kcr-mode="cal-station"/);
assert.match(assessment, /스테이션 켈리브레이션/);
assert.match(functionSource(assessment, "goCalibration"), /code === 'KCR' && scope === 'station'/);
assert.match(functionSource(assessment, "setEvaluationPurpose_"), /스테이션 켈리브레이션/);
assert.match(functionSource(assessment, "evaluationPurposeExtraFields_"), /'스테이션'/);

const submitClient = functionSource(assessment, "cuppingSubmitAll");
for (const field of ["stationId", "stationLabel", "stationPrefix", "stationProcess", "stationSampleCount"]) {
  assert.match(submitClient, new RegExp(`${field}:`));
}
assert.match(submitClient, /KCR 스테이션 정보가 없습니다/);
assert.match(submitClient, /Number\(res\.inserted \|\| 0\) === _cupping\.cups\.length/);
assert.match(submitClient, /'스테이션':_cupping\.station\.label/);

assert.match(rpc, /function validateKcrStationOptionSettings_/);
assert.match(rpc, /function validateKcrStationSubmission_/);
assert.match(rpc, /function kcrStationSettingsServer_/);
assert.match(functionSource(rpc, "submitScores"), /validateKcrStationSubmission_\(basePayload, cfg\)/);
assert.match(functionSource(rpc, "submitScores"), /missingParticipantNumbers/);
assert.match(functionSource(rpc, "submitScores"), /stationTeam/);
assert.match(functionSource(rpc, "rowToReviewItem"), /normalizedCode === 'IKRC' \|\| normalizedCode === 'KCR'/);
assert.match(functionSource(rpc, "scoreEvaluationCategoryKey_"), /calibration:station/);
assert.match(functionSource(rpc, "updateCompetitionAdminSettings"), /validateKcrStationOptionSettings_/);
assert.match(functionSource(rpc, "updateCompetitionAdminSettings"), /기존 KCR 평가/);

const reviewGrouping = functionSource(assessment, "reviewParticipantGroupKey_");
assert.match(reviewGrouping, /c === 'KCR' \|\| c === 'IKRC'/);
assert.match(functionSource(assessment, "reviewGroupTitle_"), /kcrStationSettings_/);

process.stdout.write("Stage123 KCR station-mode tests passed.\n");
