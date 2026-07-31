import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const rpcSource = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");

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

const derivedContext = {};
vm.createContext(derivedContext);
vm.runInContext(functionSource("isMobDerivedDisplayHeader_"), derivedContext);
for (const header of [
  "총점",
  "테크니컬 총점",
  "센서리 총점",
  "창작메뉴 총점",
  "감점 전 합산",
  "감점 적용 후 점수",
  "순위 반영점수",
  "총평가 반영점수",
]) {
  assert.equal(derivedContext.isMobDerivedDisplayHeader_(header), true, `${header}는 화면에서 숨겨야 합니다.`);
}
assert.equal(derivedContext.isMobDerivedDisplayHeader_("Flavor(플레이버)"), false);
assert.equal(derivedContext.isMobDerivedDisplayHeader_("시간감점"), false);

const listSummarySource = functionSource("mobReviewListSummary_");
assert.match(listSummarySource, /평가속성/);
assert.doesNotMatch(listSummarySource, /총점|감점 전 합산|감점 적용 후 점수|순위 반영점수|총평가 반영점수|센서리 반영점수/);

const metricSource = functionSource("setReviewEditMetric_");
assert.match(metricSource, /metricWrap\.style\.display\s*=\s*isMob\s*\?\s*'none'/);

const reviewRoleSource = functionSource("reviewMobHeaderAppliesToRole_");
assert.match(reviewRoleSource, /\/\^derived\/\.test\(group\)/);
const detailRoleSource = functionSource("detailMobHeaderApplies_");
assert.match(detailRoleSource, /isMobDerivedDisplayHeader_\(h\)/);
assert.match(detailRoleSource, /\/\^derived\/\.test\(group\)/);

const detailCardSource = functionSource("renderDetailCard");
assert.match(detailCardSource, /var total = isMobDetail \? ''/);
assert.doesNotMatch(detailCardSource, /\['총평가 반영점수'\]|\['감점 적용 후 점수'\]/);

assert.doesNotMatch(assessment, /function buildMobRankingBreakdownHtml_\(/);

const rankingDetailSource = functionSource("renderRankingDetail");
assert.match(rankingDetailSource, /var detailTotalLine = isMobRankingDetail \? ''/);
assert.doesNotMatch(rankingDetailSource, /buildMobRankingBreakdownHtml_\(rankInfo\)/);

// 화면에서 숨겨도 저장·순위 계산과 백업 원본에는 파생값을 계속 유지해야 한다.
for (const header of [
  "테크니컬 총점",
  "센서리 총점",
  "창작메뉴 총점",
  "감점 전 합산",
  "감점 적용 후 점수",
  "순위 반영점수",
  "총평가 반영점수",
]) {
  assert.match(rpcSource, new RegExp(`target\\['${header}'\\]`));
}
assert.match(rpcSource, /if \(code === 'MOB'\)[\s\S]*?writeMobDerivedFields_\(row0\.extraFields,\s*mobComp\)/);

process.stdout.write("Stage119 MOB attribute-only review/debrief display tests passed.\n");
