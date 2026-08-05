import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const registry = fs.readFileSync(path.join(root, "public", "registry", "index.html"), "utf8");

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

const authContext = { COMPETITION_CODES:["MOC", "MOB", "IKRC"] };
vm.createContext(authContext);
vm.runInContext([
  functionSource(rpc, "safeStr"),
  functionSource(rpc, "normalizeAccess_"),
  functionSource(rpc, "accessCodes_"),
  functionSource(rpc, "normalizeAccountType_"),
  functionSource(rpc, "hasTeamLead"),
  functionSource(rpc, "actorAccessCodes_"),
  functionSource(rpc, "actorAccountTypeForCode_"),
  functionSource(rpc, "hasAdmin"),
  functionSource(rpc, "hasAccess"),
  functionSource(rpc, "hasManageAccess"),
  functionSource(rpc, "actorManageCodes_"),
].join("\n"), authContext);

const multiRole = {
  type:"TEAMLEAD",
  accountType:"TEAMLEAD",
  role:"대회팀장",
  access:"MOC,MOB",
  accountTypeMap:{ MOC:"TEAMLEAD", MOB:"JUDGE" },
  roleMap:{ MOC:"대회팀장", MOB:"센서리 헤드 심사위원" },
};
assert.equal(authContext.hasManageAccess(multiRole, "MOC"), true);
assert.equal(authContext.hasManageAccess(multiRole, "MOB"), false, "MOC teamlead must not be promoted to MOB teamlead");
assert.deepEqual(Array.from(authContext.actorManageCodes_(multiRole)), ["MOC"]);

const stationContext = {};
vm.createContext(stationContext);
vm.runInContext([
  functionSource(rpc, "safeStr"),
  functionSource(rpc, "ikrcDefaultStationPrefixServer_"),
  functionSource(rpc, "normalizeIkrcStationListServer_"),
].join("\n"), stationContext);
const stationCheck = stationContext.normalizeIkrcStationListServer_([
  { id:"cal", label:"켈리", prefix:"C", start:1, end:3, useForCalibration:true, useForCompetition:false },
  { id:"event", label:"대회", prefix:"E", start:1, end:3, useForCalibration:false, useForCompetition:true },
], true, "IKRC");
assert.equal(stationCheck.ok, true);
assert.equal(stationCheck.list[0].useForCompetition, false);
assert.equal(stationCheck.list[1].useForCalibration, false);
assert.equal(stationContext.normalizeIkrcStationListServer_([
  { id:"closed", prefix:"X", start:1, end:2, useForCalibration:false, useForCompetition:false },
], true, "IKRC").ok, false);

assert.match(functionSource(rpc, "upsertParticipant"), /MOB 선수 등록 시 대회일을 반드시 선택/);
assert.match(functionSource(rpc, "participantPayloadFromRow_"), /competitionDate/);
assert.match(rpc, /bulkApplyOperatorEffectiveDate/);
assert.match(registry, /id="bulkOperatorDate"/);
assert.match(registry, /data-bulk-op/);
assert.match(functionSource(registry, "saveOneParticipant"), /competitionDate:competitionDate/);
assert.match(functionSource(registry, "applyBulkOperatorDate_"), /bulkApplyOperatorEffectiveDate/);

assert.match(assessment, /data-field="useForCalibration"/);
assert.match(assessment, /data-field="useForCompetition"/);
assert.match(functionSource(assessment, "renderIkrcStationChoices_"), /useForCalibration/);
assert.match(functionSource(assessment, "renderIkrcStationChoices_"), /useForCompetition/);
assert.doesNotMatch(assessment, /<div id="pIkrcBlindManager"/);
assert.match(functionSource(assessment, "loadTeamPanel"), /다른 대회의 팀장 권한과 섞이지 않고/);
assert.match(functionSource(assessment, "loadTeamPanel"), /mob-sens-cal/);
assert.match(functionSource(assessment, "loadTeamPanel"), /ikrc-cal-result/);
assert.doesNotMatch(functionSource(assessment, "loadTeamPanel"), /ikrc-official-result/);

process.stdout.write("Stage131 date, multi-role, teamlead-superset, and IKRC station-purpose tests passed.\n");
