import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");

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

const startMobSource = functionSource(assessment, "startMob");
assert.match(startMobSource, /MOB_TECH/);
assert.match(startMobSource, /MOB_SENS/);
assert.match(startMobSource, /MOB_SIG/);
assert.doesNotMatch(startMobSource, /IKRC_ATTRS|startIkrc/);
assert.match(functionSource(assessment, "mobSubmit"), /competitionCode:\s*'MOB'/);

let headRole = false;
const buttonIds = ["btn-review", "btn-calibration", "btn-calibration-all", "btn-calibration-team", "btn-eval", "btn-ikrc-seed-vote"];
const buttons = Object.fromEntries(buttonIds.map((id) => [id, { style: {}, textContent: "", disabled: false }]));
const menuContext = {
  _selComp: { code: "MOB", currentRound: "예선" },
  document: {
    getElementById: (id) => buttons[id] || null,
    querySelectorAll: () => [],
  },
  canCalibrationCode_: () => headRole,
  judgeTeamText: () => "1팀",
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
assert.equal(buttons["btn-eval"].textContent, "대회평가 시작");
assert.equal(buttons["btn-review"].style.display, "block");
assert.equal(buttons["btn-review"].textContent, "내 제출 검수");
assert.equal(buttons["btn-calibration"].style.display, "none");
assert.equal(buttons["btn-calibration-all"].style.display, "none");
assert.equal(buttons["btn-calibration-team"].style.display, "none");

headRole = true;
menuContext.updateSelectReviewButton_();
assert.equal(buttons["btn-eval"].textContent, "MOB 헤드 켈리브레이션 입력");
assert.equal(buttons["btn-review"].style.display, "none");
assert.equal(buttons["btn-calibration"].style.display, "block");
assert.equal(buttons["btn-calibration"].textContent, "MOB 켈리브레이션 확인");
assert.equal(buttons["btn-calibration-all"].style.display, "none");
assert.equal(buttons["btn-calibration-team"].style.display, "none");

const purposeCalls = [];
let started = "";
const evalContext = {
  _selComp: { code: "MOB" },
  assertCanEvaluate: () => true,
  isHeadRoleForCode_: () => headRole,
  isTeamLeaderForCode_: () => false,
  isAdminRole: () => false,
  judgeTeamText: () => "1팀",
  setEvaluationPurpose_: (type, scope) => purposeCalls.push([type, scope]),
  startMob: () => { started = "MOB"; },
  showCuppingSetup: () => {}, showMocSetup: () => {}, startKcac: () => {}, startKbc: () => {},
  startIkrc: () => {}, showKtccSetup: () => {}, toast: () => {},
};
vm.createContext(evalContext);
vm.runInContext(functionSource(assessment, "goEval"), evalContext);
headRole = true;
evalContext.goEval();
assert.deepEqual(purposeCalls.at(-1), ["calibration", "team"]);
assert.equal(started, "MOB");

headRole = false;
evalContext.goEval();
assert.deepEqual(purposeCalls.at(-1), ["competition", undefined]);

const calibrationContext = {
  _selComp: { code: "MOB" },
  isHeadRoleForCode_: () => false,
  isTeamLeaderForCode_: () => false,
  isAdminRole: () => false,
};
vm.createContext(calibrationContext);
vm.runInContext(functionSource(assessment, "canCalibrationCode_"), calibrationContext);
assert.equal(calibrationContext.canCalibrationCode_("MOB"), false);
calibrationContext.isHeadRoleForCode_ = () => true;
assert.equal(calibrationContext.canCalibrationCode_("MOB"), true);

const teamPanelSource = functionSource(assessment, "loadTeamPanel");
assert.match(teamPanelSource, /mobHeadCard/);
assert.match(teamPanelSource, /MOB 헤드 켈리브레이션 입력/);
assert.match(teamPanelSource, /mobHeadCard \? '' : '<button data-act="judge-review">내 제출 검수<\/button>'/);
assert.match(teamPanelSource, /if \(judgeReview\) judgeReview\.onclick/);
assert.match(functionSource(assessment, "adminRenderRunCards_"), /센서리 헤드 켈리브레이션 입력/);
assert.match(functionSource(assessment, "adminRenderRunCards_"), /테크니컬 헤드 켈리브레이션 입력/);
assert.doesNotMatch(assessment, /id="mob-cal-scope-(?:team|all)"/);

const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");
const mobRowsSource = functionSource(rpc, "mobCalibrationRows_");
const mobTargetsSource = functionSource(rpc, "getMobCalibrationParticipantNumbers");
const mobResultsSource = functionSource(rpc, "getMobCalibrationResultsByParticipant");
assert.doesNotMatch(mobRowsSource, /\/팀별\/|mobTeamMatchesServer_/);
assert.match(mobTargetsSource, /!isCalibrationMode_\(item\['모드'\] \|\| item\.mode\)/);
assert.match(mobTargetsSource, /!isHeadRole_\(item\['역할'\] \|\| item\.role\)/);
assert.match(mobResultsSource, /isCalibrationMode_\(item\['모드'\] \|\| item\.mode\) && isHeadRole_/);

process.stdout.write("Stage137 MOB original workflow separation tests passed.\n");
