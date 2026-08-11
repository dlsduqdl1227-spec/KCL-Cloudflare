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

const labelsDecl = assessment.match(/var SCORE_GUIDE_LABELS_ = \[[^\n]+\];/);
assert.ok(labelsDecl, "공통 점수 표현 목록이 필요합니다.");

const context = {};
vm.createContext(context);
vm.runInContext([
  labelsDecl[0],
  functionSource("scoreGuideLabel_"),
  functionSource("roundScore02"),
  functionSource("kcacGetDesc"),
  functionSource("kcrGetMeaning"),
  functionSource("kbcGetDesc"),
  functionSource("mobGetDesc"),
  functionSource("ikrcGetMeaning"),
].join("\n"), context);

const canonical = ["매우 미흡", "미흡", "보완 필요", "기준점", "안정적", "양호", "우수", "매우 우수"];
assert.deepEqual(Array.from(context.SCORE_GUIDE_LABELS_), canonical);

for (const [score, label] of [[0, "매우 미흡"], [2, "미흡"], [4, "보완 필요"], [5, "기준점"], [6, "안정적"], [7, "양호"], [8, "우수"], [9, "매우 우수"], [10, "매우 우수"]]) {
  assert.equal(context.ikrcGetMeaning(score), label, `IKRC ${score}점 명칭`);
}

for (const name of ["kcacGetDesc", "kcrGetMeaning", "kbcGetDesc"]) {
  for (const [score, label] of [[0, "매우 미흡"], [1, "미흡"], [2, "보완 필요"], [2.5, "기준점"], [3, "안정적"], [3.5, "양호"], [4, "우수"], [4.5, "매우 우수"], [5, "매우 우수"]]) {
    assert.equal(context[name](score), label, `${name} ${score}점 명칭`);
  }
}

for (const [score, label] of [[1, "매우 미흡"], [1.8, "미흡"], [2.6, "보완 필요"], [3, "기준점"], [3.4, "안정적"], [3.8, "양호"], [4.2, "우수"], [4.6, "매우 우수"], [5, "매우 우수"]]) {
  assert.equal(context.mobGetDesc(score), label, `MOB ${score}점 명칭`);
}

const guideText = "점수 표현: 매우 미흡 → 미흡 → 보완 필요 → 기준점 → 안정적 → 양호 → 우수 → 매우 우수";
assert.ok(assessment.split(guideText).length - 1 >= 5, "점수형 대회 5곳에 공통 표현 안내가 보여야 합니다.");

// 명칭만 통일하며 대회별 수치 범위와 0.2점 의미 단위는 바꾸지 않는다.
assert.match(functionSource("renderCuppingAttrCard"), /min="0" max="5" step="0\.01" data-score-step="0\.2"/);
assert.match(functionSource("buildKcacScoreSlider_"), /min="0" max="5" step="0\.01" data-score-step="0\.2"/);
assert.match(functionSource("kbcRenderScoreRows_"), /makeScoreRow\(a\.id, a\.name, '', 0, 5, 0\.2/);
assert.match(functionSource("startMob"), /makeScoreRow\(a\.id, a\.name, '', 1, 5, 0\.2/);
assert.match(functionSource("renderIkrcAttrCard"), /min="0" max="10" step="0\.01" data-score-step="0\.2"/);

for (const oldLabel of ["수용불가", "아주나쁨", "기준충족", "완벽구현", "매우 부정적", "다소 부족"]) {
  assert.equal(assessment.includes(oldLabel), false, `이전 점수 표현 제거: ${oldLabel}`);
}

process.stdout.write("Stage159 unified score guideline label tests passed.\n");
