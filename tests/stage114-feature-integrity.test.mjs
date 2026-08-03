import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const registry = fs.readFileSync(path.join(root, "public", "registry", "index.html"), "utf8");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");
const publicHtml = fs
  .readdirSync(path.join(root, "public"), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
  .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8"))
  .join("\n");

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} function not found`);
  const open = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
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
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} function is incomplete`);
}

const markupOnly = assessment.replace(/<script\b[\s\S]*?<\/script>/gi, "");
const staticIds = Array.from(markupOnly.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
const duplicateStaticIds = staticIds.filter((id, index) => staticIds.indexOf(id) !== index);
assert.deepEqual(duplicateStaticIds, [], "Static HTML IDs must be unique");

const functionNames = Array.from(
  assessment.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm),
  (match) => match[1],
);
const duplicateFunctions = functionNames.filter((name, index) => functionNames.indexOf(name) !== index);
assert.deepEqual(duplicateFunctions, [], "Function declarations must be unique");

const declaredFunctions = new Set(functionNames);
const inlineHandlers = Array.from(
  assessment.matchAll(
    /on(?:click|change|input|keydown|focus|blur|keyup)="(?:return\s+)?([A-Za-z_$][\w$]*)\s*\(/g,
  ),
  (match) => match[1],
).filter((name) => name !== "if");
const missingInlineHandlers = Array.from(new Set(inlineHandlers)).filter(
  (name) => !declaredFunctions.has(name),
);
assert.deepEqual(missingInlineHandlers, [], "Every inline assessment handler must exist");

assert.match(
  assessment,
  /onclick="window\.location\.href='\/registry\/'">등록·권한 관리<\/button>/,
  "The operations console must link directly to the single registry manager",
);
assert.match(registry, /KCL 등록·권한 관리/);

for (const retiredMarker of [
  "admin-account-list",
  "admin-account-access-picks",
  "admin-pick-btn",
  "admin-filter-btn",
  "admin-select-help",
  "_adminAccessSelection",
  "_adminAccountFilter",
  "_ikrcCups",
  "startIkrcRange",
  "startIkrcSingle",
  "switchIkrcTab",
  "ikrcCupInput",
  "ikrcStartCup",
  "ikrcEndCup",
]) {
  assert.doesNotMatch(
    assessment,
    new RegExp(retiredMarker),
    `Retired duplicate feature remains in assessment: ${retiredMarker}`,
  );
}

const adminConsoleSource = extractFunction(rpc, "getAdminConsoleData");
assert.doesNotMatch(adminConsoleSource, /FROM operators/i);
assert.doesNotMatch(adminConsoleSource, /\baccounts\s*:/);
assert.match(adminConsoleSource, /configs:\s*visibleConfigs/);

const serverHandlers = new Set(
  Array.from(
    rpc.matchAll(/^\s{4}([A-Za-z_$][\w$]*):\s*\(\)\s*=>/gm),
    (match) => match[1],
  ),
);
const browserNativeCalls = new Set([
  "clearRect",
  "getAttribute",
  "getBoundingClientRect",
  "getContext",
  "getDate",
  "getElementById",
  "getFullYear",
  "getHours",
  "getItem",
  "getMinutes",
  "getMonth",
  "getSeconds",
  "getTime",
  "getTracks",
  "getUserMedia",
]);
const publicRpcCalls = Array.from(
  publicHtml.matchAll(
    /\.((?:get|update|submit|send|verify|refresh|generate|mark|save|delete|clear|import|list|cleanup)[A-Z][A-Za-z0-9_$]*)\s*\(/g,
  ),
  (match) => match[1],
).filter((name) => !browserNativeCalls.has(name));
const missingServerHandlers = Array.from(new Set(publicRpcCalls)).filter(
  (name) => !serverHandlers.has(name),
);
assert.deepEqual(missingServerHandlers, [], "Every public RPC call must have a server handler");

for (const requiredSubmitFunction of [
  "cuppingSubmitAll",
  "kcacSubmitAll",
  "kbcSubmit",
  "mobSubmit",
  "ikrcSubmitAll",
  "mocRequestSign",
  "ktccRequestSign",
]) {
  assert.ok(
    declaredFunctions.has(requiredSubmitFunction),
    `Missing evaluation submission flow: ${requiredSubmitFunction}`,
  );
}
for (const requiredAction of [
  "getReviewList",
  "updateReviewRow",
  "updateReviewStatusBatch",
  "getRanking",
  "getFinalReport",
  "getScoreBackupReport",
]) {
  assert.ok(serverHandlers.has(requiredAction), `Missing evaluation-to-review action: ${requiredAction}`);
}

assert.match(extractFunction(assessment, "initIkrcSamples"), /스테이션을 먼저 선택해주세요/);
assert.match(extractFunction(assessment, "renderReviewTopActionsV4_"), /textContent/);
assert.doesNotMatch(extractFunction(assessment, "renderReviewTopActionsV4_"), /innerHTML/);
assert.match(extractFunction(assessment, "canShowStddevButton_"), /IKRC.*isHeadRoleForCode_/s);
assert.match(extractFunction(assessment, "openReviewEdit"), /IKRC.*item\._stddev/s);
assert.match(extractFunction(assessment, "buildStddevHtml_"), /내 점수/);
assert.match(extractFunction(rpc, "getReviewList"), /ikrcOfficialReviewComparison_/);

process.stdout.write("Stage114 feature integrity tests passed.\n");
