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
assert.ok(assessment.indexOf('id="btn-review"') < assessment.indexOf('id="btn-calibration-team"'), "Review must appear before KCR calibration entry buttons");
assert.match(extractFunction(assessment, "evaluationTeamForSubmit_"), /전체 켈리브레이션팀/);
assert.match(extractFunction(assessment, "goCalibration"), /setEvaluationPurpose_\('calibration', scope\)/);
assert.match(extractFunction(assessment, "updateSelectReviewButton_"), /켈리브레이션\(팀별\)/);
assert.match(extractFunction(assessment, "updateSelectReviewButton_"), /켈리브레이션\(전체\)/);
assert.match(extractFunction(assessment, "updateSelectReviewButton_"), /대회검수/);

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
assert.match(extractFunction(assessment, "renderKcrProcessSelect_"), /프로세스 구분 없음/);
assert.match(extractFunction(assessment, "startCuppingFinalsRange"), /!isActiveCalibrationMode_\(\).*assertKcrProcessOpenForEval_/s);
assert.match(extractFunction(assessment, "cuppingSubmitAll"), /!_cupping\.isCalibrationMode.*assertKcrProcessOpenForEval_/);

const commentModeContext = {};
vm.createContext(commentModeContext);
vm.runInContext(extractFunction(assessment, "kcrOverallCommentEnabled_"), commentModeContext);
assert.equal(commentModeContext.kcrOverallCommentEnabled_({ overallCommentEnabled:true }), true);
assert.equal(commentModeContext.kcrOverallCommentEnabled_({ overallCommentEnabled:false }), false);
assert.equal(commentModeContext.kcrOverallCommentEnabled_({}), true, "Old saved drafts must default to comment enabled");
assert.match(extractFunction(assessment, "renderCuppingAttrCard"), /종합 코멘트 사용 여부/);
assert.match(extractFunction(assessment, "renderCuppingAttrCard"), /사용 안 함/);
assert.match(extractFunction(assessment, "kcrCommentReferenceHtml_"), /점수·강도·스마트태그/);
assert.match(extractFunction(assessment, "kcrCommentReferenceHtml_"), /slice\(0, 2\)/);
assert.match(extractFunction(assessment, "cuppingSubmitAll"), /종합코멘트 사용여부/);
assert.match(rpc, /'종합코멘트 사용여부'/);

assert.doesNotMatch(assessment, /onclick="generateMobComment\(\)"/);
assert.match(assessment, /MOB 전체 종합 코멘트 \(심사위원 직접 작성\)/);
assert.match(extractFunction(assessment, "renderMobCommentReference"), /slice\(0, 2\)/);
assert.match(extractFunction(assessment, "mobSmartTagGroupLabel_"), /주요 표현/);
assert.match(extractFunction(assessment, "mobSmartTagGroupLabel_"), /보완 표현/);
assert.match(assessment, /\.mob-smart-tag-group-label\{color:var\(--text-2\)\}/);
assert.match(extractFunction(assessment, "mobSmartTagSectionLabelHtml_"), /mob-smart-tag-group-label/);
assert.match(extractFunction(assessment, "mobTagButtonsHtml_"), /mobSmartTagSectionLabelHtml_\('주요 표현'\)/);
assert.doesNotMatch(extractFunction(assessment, "mobTagButtonsHtml_"), /smartTagGroupLabelHtml_\('주요 표현'\)/);
assert.doesNotMatch(extractFunction(assessment, "reviewCommentGeneratorCode_"), /KCR\|KBC\|KCAC\|MOB/);

process.stdout.write("Stage122 calibration-purpose and MOB manual-comment tests passed.\n");
