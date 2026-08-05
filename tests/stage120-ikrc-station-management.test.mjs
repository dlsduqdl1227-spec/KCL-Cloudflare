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
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} 함수 끝을 찾을 수 없습니다.`);
}

const blindPanel = assessment.slice(
  assessment.indexOf('<div id="pIkrcBlindManager"'),
  assessment.indexOf('<!-- 10-0-2: IKRC 결선 Seed to Cup 결과 -->'),
);
assert.match(blindPanel, /id="ikrc-blind-map"/);
assert.match(blindPanel, /id="ikrc-blind-save"/);
assert.match(blindPanel, /블라인드코드 · 선수 연결/);
assert.match(assessment, /function ikrcStationConfigRowHtml_\(/);
assert.match(assessment, /saveIkrcStationSettings\(/);
assert.match(assessment, /ikrc-station-purpose/);
assert.match(assessment, /useForCalibration/);
assert.match(assessment, /useForCompetition/);

assert.match(assessment, /\.ikrc-station-config-row input\{height:52px/);
assert.match(assessment, /\.ikrc-station-remove\{[^}]*height:52px/);
assert.match(assessment, /\.ikrc-station-actions button\{[^}]*min-height:52px/);
assert.match(assessment, /\.ikrc-station-actions \.ikrc-station-save\{background:#fff!important;color:#000!important/);
assert.match(assessment, /@media\(max-width:460px\)\{\.ikrc-station-actions\{grid-template-columns:1fr\}\}/);

const rowSource = functionSource(assessment, "ikrcStationConfigRowHtml_");
assert.match(rowSource, />삭제<\/button>/);
assert.doesNotMatch(rowSource, />×<\/button>/);

const addSource = functionSource(assessment, "ikrcAddStationConfigRow_");
assert.match(addSource, /usedPrefixes/);
assert.match(addSource, /while \(usedPrefixes\[ikrcDefaultStationPrefix_\(prefixIndex\)\]/);

const saveClientSource = functionSource(assessment, "saveIkrcBlindStationSettings_");
assert.match(saveClientSource, /기존 평가점수와 백업 데이터는 삭제되지 않습니다/);
assert.match(saveClientSource, /saveIkrcStationSettings\(/);
assert.match(saveClientSource, /범위에서 벗어나는 선수 배정/);

assert.match(rpc, /saveIkrcStationSettings:\s*\(\)\s*=>\s*saveIkrcStationSettings/);
const saveServerSource = functionSource(rpc, "saveIkrcStationSettings");
assert.match(saveServerSource, /requireManageActorForCode_/);
assert.match(saveServerSource, /normalizeIkrcStationListServer_\(payload && payload\.stations,\s*true\)/);
assert.match(saveServerSource, /preservedScoreCount/);
assert.match(saveServerSource, /invalidAssignmentCount/);
assert.doesNotMatch(saveServerSource, /DELETE\s+FROM\s+scores/i);
assert.doesNotMatch(saveServerSource, /UPDATE\s+scores/i);

process.stdout.write("Stage120 IKRC station add/delete management tests passed.\n");
