import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");

function functionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} 함수를 찾을 수 없습니다.`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
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
    if (char === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} 함수 끝을 찾을 수 없습니다.`);
}

const panel = functionSource(rpc, "ikrcOfficialPanelRows_");
assert.match(panel, /reviewedSensory/);
assert.match(panel, /liveRows/);
assert.match(panel, /confirmedJudgeCount/);

const aggregate = functionSource(rpc, "aggregateRankingGroup_");
assert.match(aggregate, /const officialRows = panel\.liveRows/);
assert.match(aggregate, /현재 제출 평균/);

const ranking = functionSource(rpc, "buildRankingData_");
assert.match(ranking, /confirmedJudgeCount \|\| 0\) < 1/);
assert.doesNotMatch(ranking, /!ikrcFinalizedUnits\.has[\s\S]*return/);
assert.match(ranking, /ikrcFinalized/);

const countable = functionSource(rpc, "shouldCountItemInRanking_");
assert.match(countable, /isCalibrationMode_/);
assert.match(countable, /ikrcOfficialHeadItem_/);

const render = functionSource(assessment, "renderRanking");
assert.match(render, /반영 심사/);
assert.match(render, /item\.finalized \? '최종확정' : '진행중'/);

process.stdout.write("Stage141 IKRC live incremental ranking tests passed.\n");
