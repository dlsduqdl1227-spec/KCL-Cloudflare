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

const buttonIds = ["btn-review", "btn-calibration", "btn-calibration-station", "btn-calibration-all", "btn-calibration-team", "btn-eval", "btn-ikrc-seed-vote"];
const buttons = Object.fromEntries(buttonIds.map((id) => [id, { style: {}, textContent: "", disabled: false }]));
let headRole = true;
const menuContext = {
  _selComp: { code: "IKRC", currentRound: "예선" },
  document: {
    getElementById: (id) => buttons[id] || null,
    querySelectorAll: () => [],
  },
  canCalibrationCode_: () => true,
  judgeTeamText: () => "스테이션 1",
  canReviewCode_: () => true,
  isHeadRoleForCode_: () => headRole,
  isTeamLeaderForCode_: () => false,
  isAdminRole: () => false,
  isIkrcFinalConfig_: () => false,
  isStaffRoleForCode_: () => false,
};
vm.createContext(menuContext);
vm.runInContext(functionSource(assessment, "updateSelectReviewButton_"), menuContext);

menuContext.updateSelectReviewButton_();
assert.equal(buttons["btn-eval"].textContent, "대회평가시작");
assert.equal(buttons["btn-review"].textContent, "내평가검수");
assert.equal(buttons["btn-calibration"].textContent, "심사 켈리브레이션");
assert.equal(buttons["btn-calibration"].style.display, "block");
assert.equal(buttons["btn-calibration-station"].style.display, "block");
assert.equal(buttons["btn-calibration-station"].textContent, "전체 켈리브레이션");
assert.equal(buttons["btn-calibration-all"].style.display, "none");
assert.equal(buttons["btn-calibration-team"].style.display, "none");

headRole = false;
menuContext.updateSelectReviewButton_();
assert.equal(buttons["btn-eval"].style.display, "block");
assert.equal(buttons["btn-review"].textContent, "내평가검수");
assert.equal(buttons["btn-review"].style.display, "block");
assert.equal(buttons["btn-calibration"].style.display, "none");
assert.equal(buttons["btn-calibration-station"].style.display, "block");
assert.equal(buttons["btn-calibration-all"].style.display, "none");
assert.equal(buttons["btn-calibration-team"].style.display, "none");

assert.match(assessment, /id="ikrc-result-mode-official"[^>]*>대회평가</);
assert.match(assessment, /id="ikrc-result-mode-station"[^>]*>전체 켈리브레이션</);
assert.doesNotMatch(assessment, /id="ikrc-cal-scope-all"/);
assert.match(functionSource(assessment, "goCalibration"), /IKRC 전체 켈리브레이션은 사용하지 않습니다/);
assert.match(functionSource(assessment, "setIkrcResultViewMode_"), /_ikrcCalibrationScope = 'station'/);
assert.match(functionSource(assessment, "ikrcCalibrationRequest_"), /scope:'station'/);

const reviewSource = functionSource(rpc, "getReviewList");
assert.match(reviewSource, /ownOnly: !manager/);
assert.match(reviewSource, /readOnlyHeadMonitor:calibrationOnly/);
assert.doesNotMatch(reviewSource, /headMonitor/);
assert.match(functionSource(rpc, "submitScores"), /IKRC 전체 켈리브레이션은 운영하지 않습니다/);
assert.match(functionSource(rpc, "getIkrcCalibrationScopeOptions"), /canViewOverall:false/);
assert.match(functionSource(rpc, "getIkrcOfficialCalibrationScopeOptions"), /canViewOverall:false/);
assert.match(functionSource(rpc, "getIkrcOfficialCalibrationResultsByCup"), /rows:submittedRows\.map\(ikrcScoreObjectFromItem_\)/);
assert.match(functionSource(rpc, "getIkrcOfficialCalibrationResultsByCup"), /headScoreHidden:false/);
assert.match(functionSource(rpc, "ikrcScoreObjectFromItem_"), /comment: extraComment/);
assert.doesNotMatch(functionSource(rpc, "finalizeIkrcStationEvaluation"), /reviewed !== 3|sensoryCount\}\/3|headCount\}\/1/);

process.stdout.write("Stage134 IKRC role UI and station-only calibration tests passed.\n");
