import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");

function extractFunction(source, name) {
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

assert.match(assessment, /id="btn-eval"[^>]*>대회평가 시작/);
assert.match(assessment, /id="btn-calibration-all"[^>]*>전체 켈리브레이션 시작/);
assert.match(assessment, /id="btn-calibration-team"[^>]*>팀별 켈리브레이션 시작/);
assert.match(extractFunction(assessment, "evaluationTeamForSubmit_"), /전체 켈리브레이션팀/);
assert.match(extractFunction(assessment, "goCalibration"), /setEvaluationPurpose_\('calibration', scope\)/);

const purposeContext = { _selComp:{code:"IKRC"}, judgeTeamForSubmit:()=>"2팀" };
vm.createContext(purposeContext);
vm.runInContext([
  "var _evaluationPurpose={type:'competition',scope:'',label:'대회평가'};",
  extractFunction(assessment, "setEvaluationPurpose_"),
  extractFunction(assessment, "isActiveCalibrationMode_"),
  extractFunction(assessment, "evaluationTeamForSubmit_"),
].join("\n"), purposeContext);
purposeContext.setEvaluationPurpose_("calibration", "all");
assert.equal(purposeContext.evaluationTeamForSubmit_(), "전체 켈리브레이션팀");
purposeContext.setEvaluationPurpose_("calibration", "team");
assert.equal(purposeContext.evaluationTeamForSubmit_(), "2팀");
purposeContext.setEvaluationPurpose_("competition");
assert.equal(purposeContext.evaluationTeamForSubmit_(), "2팀");

const securedTeamSource = extractFunction(rpc, "submitScores");
assert.match(securedTeamSource, /calibration:all[^\n]*전체 켈리브레이션팀/);
assert.match(extractFunction(rpc, "ikrcCalibrationRows_"), /!isCalibrationMode_\(mode\)/);
assert.match(extractFunction(rpc, "ikrcCalibrationRows_"), /팀별/);
assert.doesNotMatch(extractFunction(rpc, "shouldCountItemInRanking_"), /MOB[^\n]*isHeadRole_/);

assert.doesNotMatch(assessment, /onclick="generateMobComment\(\)"/);
assert.match(assessment, /MOB 전체 종합 코멘트 \(심사위원 직접 작성\)/);
assert.match(extractFunction(assessment, "renderMobCommentReference"), /slice\(0, 2\)/);
assert.match(extractFunction(assessment, "mobSmartTagGroupLabel_"), /주요 표현/);
assert.match(extractFunction(assessment, "mobSmartTagGroupLabel_"), /보완 표현/);
assert.doesNotMatch(extractFunction(assessment, "reviewCommentGeneratorCode_"), /KCR\|KBC\|KCAC\|MOB/);

process.stdout.write("Stage122 calibration-purpose and MOB manual-comment tests passed.\n");
