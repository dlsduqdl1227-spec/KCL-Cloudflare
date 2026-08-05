import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");
const codes = ["KCR", "KCAC", "KBC", "MOB", "IKRC", "MOC", "KTCC"];

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

const submitFunctions = {
  KCR: "cuppingSubmitAll",
  KCAC: "kcacSubmitAll",
  KBC: "kbcSubmit",
  MOB: "mobSubmit",
  IKRC: "ikrcSubmitAll",
  MOC: "submitMocFinal",
  KTCC: "submitKtccFinal",
};
for (const [code, name] of Object.entries(submitFunctions)) {
  const src = functionSource(assessment, name);
  assert.match(src, new RegExp(`competitionCode:\\s*['\"]${code}['\"]`), `${name} must pin ${code}`);
  assert.doesNotMatch(src, /competitionCode:\s*(?:_selComp\.code|_cupping\.compCode)/, `${name} must not submit through shared selected state`);
}
assert.match(functionSource(assessment, "initCuppingEval"), /_cupping\.compCode = 'KCR'/);

const activeCodeSource = functionSource(assessment, "kclActiveEvalCode_");
for (const code of codes) assert.match(activeCodeSource, new RegExp(`return ['\"]${code}['\"]|compCode \\|\\| ['\"]${code}['\"]`));
const draftKeySource = functionSource(assessment, "kclDraftKey_");
assert.match(draftKeySource, /'KCL_EVAL_DRAFT::' \+ version \+ '::' \+ code/);
const draftContext = {
  KCL_DRAFT_VERSION: "test",
  KCL_IKRC_DRAFT_VERSION: "ikrc-test",
  kclActiveEvalCode_: () => "",
  kclDraftRound_: () => "예선",
  kclDraftContextKey_: () => "competition",
  kclDraftActor_: () => "동일심사위원",
};
vm.createContext(draftContext);
vm.runInContext(draftKeySource, draftContext);
const draftKeys = codes.map((code) => draftContext.kclDraftKey_(code));
assert.equal(new Set(draftKeys).size, codes.length, "Every competition must have a different draft key");

assert.match(functionSource(assessment, "participantStateForCode_"), /_participantAssignments\[code\]/);
assert.match(functionSource(assessment, "roleTextForCode_"), /roleMap\[c\]/);
assert.match(functionSource(assessment, "judgeTeamText"), /teamMap\[c\]/);
assert.match(functionSource(assessment, "goReviewByCode"), /_reviewState\.code = code/);

const roleContext = {
  _judge: {
    type: "TEAMLEAD",
    accountType: "TEAMLEAD",
    role: "대회팀장",
    access: "MOC,MOB",
    roleMap: { MOC: "대회팀장", MOB: "센서리 헤드 심사위원" },
    accountTypeMap: { MOC: "TEAMLEAD", MOB: "JUDGE" },
  },
  _adminRoleOverride: {},
  _selComp: { code: "MOB" },
  _reviewState: { code: "" },
};
vm.createContext(roleContext);
vm.runInContext([
  functionSource(assessment, "normalizeRoleLabel_"),
  functionSource(assessment, "roleText"),
  functionSource(assessment, "roleTextForCode_"),
  functionSource(assessment, "hasRoleWordForCode_"),
  functionSource(assessment, "isHeadRoleForCode_"),
].join("\n"), roleContext);
assert.equal(roleContext.roleTextForCode_("MOC"), "팀장");
assert.equal(roleContext.roleTextForCode_("MOB"), "센서리 헤드 심사위원");
assert.equal(roleContext.isHeadRoleForCode_("MOB"), true);
assert.equal(roleContext.isHeadRoleForCode_("MOC"), false);
roleContext._judge.type = "ADMIN";
roleContext._judge.accountType = "ADMIN";
roleContext._adminRoleOverride.MOB = "테크니컬 헤드 심사위원";
assert.equal(roleContext.roleTextForCode_("MOB"), "테크니컬 헤드 심사위원", "Admin role override must not collapse back to ADMIN");

assert.match(functionSource(assessment, "initCuppingEval"), /_cupping\.cups = cupNumbers\.map/);
assert.match(functionSource(assessment, "startKcac"), /_kcac\.jars = \[\]/);
assert.match(functionSource(assessment, "startKbc"), /_kbcTags = kbcCreateTagState_\(\)/);
assert.match(functionSource(assessment, "startMob"), /_mobTags = mobCreateTagState_\(\)/);
assert.match(functionSource(assessment, "initIkrcSamples"), /_ikrcSamples = \[\]/);
assert.match(functionSource(assessment, "initIkrcSamples"), /cupNumbers\.forEach\(function\(cupNo\) \{ _ikrcSamples\.push\(makeIkrcSampleData\(cupNo\)\); \}\)/);
assert.match(functionSource(assessment, "showMocSetup"), /_moc\.setupSingles = \[\]/);
assert.match(functionSource(assessment, "showKtccSetup"), /_ktcc\.setupSingles = \[\]/);

const staticIds = [...assessment.matchAll(/\bid="([^"<>' +]+)"/g)].map((match) => match[1]);
const duplicateIds = [...new Set(staticIds.filter((id, index) => staticIds.indexOf(id) !== index))];
assert.deepEqual(duplicateIds, [], `Static HTML ids must be unique: ${duplicateIds.join(", ")}`);

const serverChecks = {
  getParticipantAssignments: /participants WHERE competition_code=\?/,
  getReviewList: /scores WHERE competition_code=\?/,
  buildRankingData_: /scores WHERE competition_code=\?/,
  updateReviewRow: /WHERE id=\? AND competition_code=\?/,
  deleteReviewRow: /WHERE id=\? AND competition_code=\?/,
  clearScores: /DELETE FROM scores WHERE competition_code=\?/,
  clearParticipants: /DELETE FROM participants WHERE competition_code=\?/,
};
for (const [name, pattern] of Object.entries(serverChecks)) assert.match(functionSource(rpc, name), pattern, `${name} must scope by competition`);

const submitServer = functionSource(rpc, "submitScores");
assert.match(submitServer, /requireActorForCode_\(env,[\s\S]*initial\.code/);
assert.match(submitServer, /actorRoleMap\[initial\.code\]/);
assert.match(submitServer, /actorTeamMap\[initial\.code\]/);
assert.match(submitServer, /competitionCode:initial\.code/);

process.stdout.write("Stage138 all-competition isolation tests passed.\n");
