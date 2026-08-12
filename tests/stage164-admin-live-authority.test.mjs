import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");
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

assert.match(rpc, /getRegistryLiveState:\s*\(\)\s*=>\s*getRegistryLiveState/);
assert.match(rpc, /REGISTRY_REVISION_SETTING_KEY\s*=\s*'registry_live_revision'/);
for (const table of ["participants", "operators"]) {
  for (const operation of ["insert", "update", "delete"]) {
    assert.ok(rpc.includes(`trg_${table}_registry_revision_${operation}`), `${table} ${operation} revision trigger missing`);
  }
}

const hydrate = functionSource(rpc, "hydrateActorFromOperators_");
assert.match(hydrate, /teamMap,\s*roleMap,\s*accountTypeMap,/s);
assert.doesNotMatch(hydrate, /\.\.\.\(actor\.teamMap/);
assert.doesNotMatch(hydrate, /\.\.\.\(actor\.roleMap/);
assert.doesNotMatch(hydrate, /\.\.\.\(actor\.accountTypeMap/);
assert.doesNotMatch(hydrate, /primary\.role\s*\|\|\s*actor\.role/);
assert.doesNotMatch(hydrate, /primary\.affiliation\s*\|\|\s*actor\.affiliation/);
assert.doesNotMatch(hydrate, /primary\.team_group\s*\|\|\s*actor\.teamGroup/);

const liveServer = functionSource(rpc, "getRegistryLiveState");
assert.match(liveServer, /getActor\(env, actorArg\)/);
assert.match(liveServer, /getParticipantAssignments\(env, code, actor\)/);
assert.match(liveServer, /participantChanged:true/);

const liveClient = functionSource(assessment, "refreshRegistryLiveState_");
assert.match(liveClient, /getRegistryLiveState\(code/);
assert.match(liveClient, /applyLiveParticipantAssignments_/);
assert.match(liveClient, /routeAfterLiveAuthorityChange_/);
assert.match(functionSource(assessment, "startRegistryLiveSync_"), /8000/);
assert.match(assessment, /window\.addEventListener\('focus',[\s\S]*?refreshRegistryLiveState_\(true\)/);
assert.match(assessment, /visibilitychange[\s\S]*?visibilityState === 'visible'[\s\S]*?refreshRegistryLiveState_\(true\)/);

const participantApply = functionSource(assessment, "applyLiveParticipantAssignments_");
assert.match(participantApply, /Number\(item\.rowIndex\) === Number\(saved\.rowIndex\)/);
assert.match(participantApply, /applyParticipantAssignmentToInputs_/);
assert.match(participantApply, /num\.value = ''/);

const authorityRoute = functionSource(assessment, "routeAfterLiveAuthorityChange_");
assert.match(authorityRoute, /lostActiveAccess/);
assert.match(authorityRoute, /kclSaveActiveEvalDraftNow_/);
assert.match(authorityRoute, /loadAdminPanel\(\)/);
assert.match(authorityRoute, /loadTeamPanel\(\)/);
assert.match(authorityRoute, /loadSelectPanel\(\)/);
assert.doesNotMatch(authorityRoute, /관리자가 변경한 최신 권한을 반영했습니다/);
const authoritySignature = functionSource(assessment, "actorAuthoritySignature_");
assert.match(authoritySignature, /Object\.keys\(map\)\.sort\(\)/);
assert.match(authoritySignature, /\.filter\(Boolean\)\.sort\(\)\.join\(','\)/);

process.stdout.write("Stage164 administrator live-authority tests passed.\n");
