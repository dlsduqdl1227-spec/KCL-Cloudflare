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

const selectIkrcTag = functionSource(assessment, "selectIkrcTag");
assert.doesNotMatch(selectIkrcTag, /BODY_CONFLICTS/, "IKRC 마우스필 긍정·보완 태그는 서로 선택 해제하면 안 됩니다.");

const reviewConflicts = functionSource(assessment, "reviewApplySmartTagConflicts_");
assert.match(reviewConflicts, /!reviewIsIkrc_\(\)/, "IKRC 검수에서도 마우스필 긍정·보완 태그를 함께 유지해야 합니다.");

assert.match(assessment, /<div id="pIkrcBlindManager"/);
assert.match(assessment, /data-act="ikrc-blind">블라인드코드 · 선수 연결/);
assert.match(assessment, /블라인드코드 ' \+ String\(displayUnit\)/);
assert.match(assessment, /선수 연결 미지정/);

const saveBlindAssignments = functionSource(rpc, "saveIkrcBlindAssignments");
assert.match(saveBlindAssignments, /extra\.ikrcBlindAssignments = map/);
assert.match(saveBlindAssignments, /UPDATE participants SET extra_json=/);
assert.doesNotMatch(saveBlindAssignments, /UPDATE participants SET \$\{field\}=/, "블라인드코드 연결이 참가자번호 필드를 덮어쓰면 안 됩니다.");
assert.match(saveBlindAssignments, /처음 연결되지 않은 코드만 추가로 연결/);

const participantIndex = functionSource(rpc, "indexParticipantIdentities_");
assert.match(participantIndex, /extra\.ikrcBlindAssignments/);

process.stdout.write("Stage140 IKRC mouthfeel multi-tag and ranking identity tests passed.\n");
