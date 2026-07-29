import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessmentPath = path.join(root, "public", "assessment", "index.html");
const rpcPath = path.join(root, "functions", "api", "rpc.js");
const seedPath = path.join(root, "migrations", "0002_seed.sql");
const assessment = fs.readFileSync(assessmentPath, "utf8");
const rpc = fs.readFileSync(rpcPath, "utf8");
const seed = fs.readFileSync(seedPath, "utf8");

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
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} function is incomplete`);
}

function compileInlineScripts(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  const scripts = [...html.matchAll(pattern)].map((match) => match[1]);
  new vm.Script(scripts.join("\n"), { filename: htmlPath });
}

const rpcCheck = spawnSync(process.execPath, ["--check", rpcPath], { encoding: "utf8" });
assert.equal(rpcCheck.status, 0, rpcCheck.stderr || "rpc.js syntax failed");

for (const relative of [
  ["public", "index.html"],
  ["public", "assessment", "index.html"],
  ["public", "registry", "index.html"],
  ["public", "debriefing", "index.html"],
  ["public", "admin", "index.html"],
]) {
  compileInlineScripts(path.join(root, ...relative));
}

const cupContext = {};
vm.createContext(cupContext);
vm.runInContext(
  [
    "var navigator={language:'ko'};",
    extractFunction(assessment, "normalizeCupId_"),
    extractFunction(assessment, "cupIdParts_"),
    extractFunction(assessment, "compareCupIds_"),
    extractFunction(assessment, "buildCupRange_"),
  ].join("\n"),
  cupContext,
);
assert.equal(cupContext.normalizeCupId_("A1"), "A-1");
assert.equal(cupContext.normalizeCupId_("AA-01"), "AA-01");
assert.equal(cupContext.normalizeCupId_("001"), "001");
assert.deepEqual(
  Array.from(cupContext.buildCupRange_("AA-01", "AA-03").cups),
  ["AA-01", "AA-02", "AA-03"],
);
assert.deepEqual(
  Array.from(cupContext.buildCupRange_("001", "003").cups),
  ["001", "002", "003"],
);
assert.deepEqual(
  Array.from(cupContext.buildCupRange_("1", "5").cups),
  ["1", "2", "3", "4", "5"],
);
assert.deepEqual(
  Array.from(cupContext.buildCupRange_("A-1", "A-5").cups),
  ["A-1", "A-2", "A-3", "A-4", "A-5"],
);
assert.equal(cupContext.buildCupRange_("A-1", "B-1").success, false);
assert.equal(cupContext.buildCupRange_("1", "21").success, false);

const kcrRangeStartSource = extractFunction(assessment, "startCuppingFinalsRange");
assert.doesNotMatch(
  kcrRangeStartSource,
  /registeredTargetsForRange_/,
  "KCR cup ranges must not be truncated by participant registration data",
);

const kcrRangeInputs = {
  cuppingFinalsProcess: { value: "Washed" },
  cuppingFinalsStart: { value: "1" },
  cuppingFinalsEnd: { value: "5" },
  cuppingCalibrationMode: { checked: false },
};
const kcrRangeContext = {
  document: { getElementById: (id) => kcrRangeInputs[id] || null },
  assertKcrProcessOpenForEval_: () => true,
  buildCupRange_: cupContext.buildCupRange_,
  toast: (message) => { throw new Error(message); },
  getRoundEvalLabel: () => "예선전평가",
  _selComp: { currentRound: "예선" },
  initCuppingEval: (cups) => { kcrRangeContext.captured = Array.from(cups); },
  captured: [],
};
vm.createContext(kcrRangeContext);
vm.runInContext(kcrRangeStartSource, kcrRangeContext);
kcrRangeContext.startCuppingFinalsRange();
assert.deepEqual(kcrRangeContext.captured, ["1", "2", "3", "4", "5"]);
kcrRangeInputs.cuppingFinalsStart.value = "A-1";
kcrRangeInputs.cuppingFinalsEnd.value = "A-5";
kcrRangeContext.startCuppingFinalsRange();
assert.deepEqual(kcrRangeContext.captured, ["A-1", "A-2", "A-3", "A-4", "A-5"]);

const rangeContext = {
  participantStateForCode_: () => ({
    loaded: true,
    loading: false,
    list: Array.from({ length: 180 }, (_, index) => index + 1)
      .filter((number) => ![177, 178, 179].includes(number))
      .map((number) => ({ number })),
  }),
  participantAssignmentByNumber_: (_code, number) =>
    [177, 178, 179].includes(Number(number)) ? null : { number },
};
vm.createContext(rangeContext);
vm.runInContext(extractFunction(assessment, "registeredTargetsForRange_"), rangeContext);
const filtered = rangeContext.registeredTargetsForRange_(
  "MOC",
  Array.from({ length: 180 }, (_, index) => index + 1),
);
assert.equal(filtered.values.length, 177);
assert.deepEqual(Array.from(filtered.missing), [177, 178, 179]);

const base64Length = (bytes) => Math.ceil(bytes / 3) * 4;
const simulatedKcacPayload = {
  competitionCode: "KCAC",
  rows: Array.from({ length: 3 }, (_, index) => ({
    data: [index + 1, "test"],
    media: {
      snapshots: [{
        full: `data:image/jpeg;base64,${"A".repeat(base64Length(120 * 1024))}`,
        thumb: `data:image/jpeg;base64,${"A".repeat(base64Length(18 * 1024))}`,
      }],
    },
  })),
};
assert.ok(Buffer.byteLength(JSON.stringify(simulatedKcacPayload), "utf8") < 1_750_000);

assert.match(assessment, /KCAC_PERSISTED_SNAPSHOT_LIMIT\s*=\s*1/);
assert.match(assessment, /KCAC_FULL_IMAGE_MAX_BYTES\s*=\s*120\s*\*\s*1024/);
assert.match(rpc, /payloadBytes\s*>\s*1750000/);
assert.match(rpc, /x\.code === 'IKRC' \|\| x\.code === 'KCR'\) atomicInsertStatements\.push/);
assert.match(rpc, /operatorIdentityKey_/);
assert.match(
  rpc,
  /if \(actorName && names\.length\) return names\.some\([\s\S]*?if \(actorPhone && phones\.some/,
  "Legacy score ownership must compare an explicit judge name before a shared phone number",
);
assert.match(rpc, /DELETE FROM sessions WHERE expires_at <= \?/);
assert.match(rpc, /DELETE FROM scores WHERE competition_code=\?/);
assert.doesNotMatch(
  rpc,
  /DELETE FROM scores(?! WHERE (?:id=\? AND )?competition_code=\?)/,
  "Score deletion must always be scoped to one competition",
);
assert.match(rpc, /getScoreBackupReport: \(\) => getScoreBackupReport/);
assert.match(rpc, /requireManageActorForCode_\(env, actorArg, code/);
assert.match(rpc, /row\['백업구분'\] === '켈리브레이션'/);
assert.match(assessment, /round \+ '_켈리브레이션'/);
assert.match(assessment, /function generateMobComment\(\)/);
assert.match(assessment, /\.generateMobComment\(\{/);
assert.match(assessment, /\.getScoreBackupReport\(code, adminActorPayload_\(\)\)/);
assert.match(assessment, /dismissMobileKeyboardBeforeAction_/);

for (const code of ["KBC", "KTCC", "MOB", "MOC", "KCR", "KCAC", "IKRC"]) {
  assert.match(seed, new RegExp(`'${code}'`), `${code} competition seed missing`);
}

process.stdout.write("Stage107 safety tests passed.\n");
