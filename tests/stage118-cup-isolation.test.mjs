import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");

function functionSource(name) {
  const marker = `function ${name}(`;
  const start = assessment.indexOf(marker);
  assert.ok(start >= 0, `${name} 함수를 찾을 수 없습니다.`);
  const bodyStart = assessment.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = bodyStart; i < assessment.length; i += 1) {
    const char = assessment[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return assessment.slice(start, i + 1);
    }
  }
  throw new Error(`${name} 함수 끝을 찾을 수 없습니다.`);
}

const bodyStart = assessment.indexOf("<body>");
const firstScriptAfterBody = assessment.indexOf("<script", bodyStart);
const pageMarkup = assessment.slice(bodyStart, firstScriptAfterBody);
assert.equal(
  (pageMarkup.match(/onclick="return goBackContext_\(\)"/g) || []).length,
  1,
  "공통 뒤로가기 버튼은 한 개만 있어야 합니다.",
);
assert.doesNotMatch(assessment, /mobile-context-back/);
assert.match(pageMarkup, />← 뒤로가기<\/button>/);
assert.match(pageMarkup, /goRootHome_\(\)/, "홈 버튼은 뒤로가기와 별도 목적이므로 유지해야 합니다.");
assert.match(pageMarkup, /id="review-back-btn" hidden aria-hidden="true"/);
assert.match(pageMarkup, /id="ranking-back-btn" hidden aria-hidden="true"/);
const reviewEditMarkup = pageMarkup.slice(
  pageMarkup.indexOf('<div id="pReviewEdit"'),
  pageMarkup.indexOf("<!-- 4-2: 순위 -->"),
);
assert.doesNotMatch(
  reviewEditMarkup,
  /onclick="backToReviewList\(\)"/,
  "검수 상세에는 공통 뒤로가기와 같은 목록 이동 버튼을 중복 표시하면 안 됩니다.",
);

const stateContext = {
  KcrSensoryComments: { createState: () => ({ autoComment: "", customComment: "", commentTouched: false }) },
  KcrSensoryTags: { families: () => ["nutty", "fruity"] },
};
vm.createContext(stateContext);
vm.runInContext("var _cupping = { cups:[], openTagFamilies:{flavor:'nutty'} };", stateContext);
["makeCupData", "kcrOverallCommentEnabled_", "normalizeKcrOverallCommentState_", "normalizeCuppingCupUiState_", "kcrOpenFamilyFor_"].forEach((name) => {
  vm.runInContext(functionSource(name), stateContext);
});

const cup1 = stateContext.makeCupData("1");
const cup2 = stateContext.makeCupData("2");
stateContext._cupping.cups = [cup1, cup2];
stateContext.normalizeCuppingCupUiState_();
assert.notEqual(cup1.openTagFamilies, cup2.openTagFamilies, "컵별 펼침 상태 객체를 공유하면 안 됩니다.");
assert.equal(stateContext.kcrOpenFamilyFor_(cup2, "flavor"), "", "새 컵은 어떤 태그 계열도 자동으로 열면 안 됩니다.");
cup1.openTagFamilies.flavor = "nutty";
assert.equal(stateContext.kcrOpenFamilyFor_(cup1, "flavor"), "nutty");
assert.equal(stateContext.kcrOpenFamilyFor_(cup2, "flavor"), "", "1번 컵의 펼침 상태가 2번 컵으로 넘어가면 안 됩니다.");
assert.equal(
  Object.prototype.hasOwnProperty.call(stateContext._cupping, "openTagFamilies"),
  false,
  "이전 버전의 화면 공용 펼침 상태는 복원 시 제거해야 합니다.",
);

assert.match(functionSource("renderKcrSensoryTagsHtml_"), /kcrOpenFamilyFor_\(c,\s*attr\)/);
for (const name of ["openKcrTagFamily", "toggleKcrTagFamily"]) {
  const source = functionSource(name);
  assert.match(source, /_cupping\.cups\[_cupping\.currentIdx\]/);
  assert.doesNotMatch(source, /_cupping\.openTagFamilies/);
}
const restoreSource = functionSource("kclRestoreDraftForCode_");
assert.match(restoreSource, /normalizeCuppingCupUiState_\(\)/);
assert.doesNotMatch(
  restoreSource,
  /code === 'KCR'[\s\S]*?switchCuppingCup\(/,
  "임시저장 복원 중 이전 DOM 값을 저장해 복원 데이터를 덮어쓰면 안 됩니다.",
);

const ikrcRenderer = functionSource("renderIkrcSmartTags_");
assert.match(ikrcRenderer, /sample\[tagKey\]\s*\|\|\s*\[\]/);
assert.match(functionSource("saveIkrc"), /_ikrcSamples\[_ikrcIdx\]/);
assert.match(functionSource("toggleIkrcBranchValue_"), /_ikrcSamples\[_ikrcIdx\]/);
assert.match(functionSource("loadIkrcSample"), /_ikrcIdx\s*=\s*idx/);

assert.match(functionSource("makeKcacJar"), /scores:\s*\{\}/);
assert.match(functionSource("makeKcacJar"), /smartTags:\s*\{\}/);
assert.match(functionSource("kcacOpenSmartTagKey_"), /_kcac\.currentIdx/);
assert.match(functionSource("switchKcacJar"), /saveKcacJarFromDOM\(\)/);

assert.match(functionSource("saveCurrentMocDraft_"), /t\.snapshot\s*=\s*captureMocState_\(\)/);
assert.match(functionSource("switchMocTarget_"), /saveCurrentMocDraft_\(\)/);
assert.match(functionSource("saveCurrentKtccDraft_"), /t\.snapshot\s*=\s*captureKtccState_\(\)/);
assert.match(functionSource("switchKtccTarget_"), /saveCurrentKtccDraft_\(\)/);

assert.match(functionSource("cuppingSubmitAll"), /_cupping\.cups\.map\(function\(c\)/);
assert.match(functionSource("ikrcSubmitAll"), /_ikrcSamples\.map\(function\(s\)/);

const rpcSource = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");
assert.match(rpcSource, /\['KCR','IKRC'\]\.includes\(initial\.code\)\s*&&\s*rows\.length\s*>\s*1/);
assert.match(rpcSource, /scoreOwnedByActor_\(existing,\s*auth\.actor\)/);

process.stdout.write("Stage118 cup-isolation and common-back tests passed.\n");
