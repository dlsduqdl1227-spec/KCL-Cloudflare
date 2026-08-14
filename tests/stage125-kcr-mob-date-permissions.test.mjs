import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const registry = fs.readFileSync(path.join(root, "public", "registry", "index.html"), "utf8");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");

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

assert.match(assessment, /data-kcr-station-manager/);
assert.match(assessment, /KCR 스테이션 만들기 \/ 관리/);
assert.match(assessment, /data-act="kcr-stations"/);
assert.match(functionSource(assessment, "loadTeamPanel"), /focusKcrStationManager_/);
assert.match(functionSource(assessment, "focusKcrStationManager_"), /scrollIntoView/);

const commentContext = {};
vm.createContext(commentContext);
vm.runInContext([
  functionSource(assessment, "kcrOverallCommentEnabled_"),
  functionSource(assessment, "normalizeKcrOverallCommentState_"),
  functionSource(assessment, "saveKcrOverallCommentBuffer_"),
  functionSource(assessment, "loadKcrOverallCommentBuffer_"),
].join("\n"), commentContext);

const cup1 = { overallCommentEnabled:true, noteOverall:"자동 생성 초안", generatedComment:"자동 생성 초안", commentEdited:false };
commentContext.normalizeKcrOverallCommentState_(cup1);
commentContext.saveKcrOverallCommentBuffer_(cup1);
cup1.overallCommentEnabled = false;
commentContext.loadKcrOverallCommentBuffer_(cup1);
assert.equal(cup1.noteOverall, "", "manual mode must start with its own empty buffer");
cup1.noteOverall = "심사위원 직접 입력";
commentContext.saveKcrOverallCommentBuffer_(cup1);
cup1.overallCommentEnabled = true;
commentContext.loadKcrOverallCommentBuffer_(cup1);
assert.equal(cup1.noteOverall, "자동 생성 초안", "auto draft must be restored independently");
cup1.overallCommentEnabled = false;
commentContext.loadKcrOverallCommentBuffer_(cup1);
assert.equal(cup1.noteOverall, "심사위원 직접 입력", "manual draft must be restored independently");

const cup2 = { overallCommentEnabled:false, noteOverall:"두 번째 컵 직접 입력" };
commentContext.normalizeKcrOverallCommentState_(cup2);
assert.equal(cup2.manualOverallComment, "두 번째 컵 직접 입력");
assert.notEqual(cup2.manualOverallComment, cup1.manualOverallComment, "each cup must keep its own comment buffer");

assert.match(registry, /id="opDate" type="date"/);
assert.match(registry, /id="mDate"[^>]*type="date"/);
assert.match(registry, /id="mPrep"/);
assert.match(registry, /id="mPerformance"/);
assert.match(registry, /'대회일','경연순서','스테이션번호','대기시간','준비시간','시연시간'/);
assert.match(functionSource(registry, "saveOneParticipant"), /'대회일'/);
assert.match(functionSource(registry, "saveOneParticipant"), /'예선일'/);
assert.match(functionSource(registry, "saveOneParticipant"), /Object\.assign\(\{\},original\.extra/);
assert.match(registry, /data-copy-date-op/);
assert.match(registry, /MOB_2026_PRELIM_PERMISSION_PRESET/);
assert.match(functionSource(registry, "applyMobSchedulePreset"), /applyOperatorDateSchedule/);
assert.match(functionSource(registry, "applyMobSchedulePreset"), /요약표에는 정성윤, 상세 배정표에는 김성찬/);
assert.match(registry, /2026-08-06/);
assert.match(registry, /2026-08-07/);

assert.match(rpc, /effective_date TEXT DEFAULT ''/);
assert.match(rpc, /idx_operators_effective_date/);
assert.match(rpc, /applyOperatorDateSchedule/);
assert.match(functionSource(rpc, "upsertOperatorAccount"), /effectiveDate/);
assert.match(functionSource(rpc, "operatorRowOut_"), /effectiveDate/);
assert.match(functionSource(rpc, "participantRowOut_"), /competitionDate/);
assert.match(functionSource(rpc, "participantRowOut_"), /preparationTime/);
assert.match(functionSource(rpc, "participantRowOut_"), /performanceTime/);
assert.match(functionSource(rpc, "hydrateActorFromOperators_"), /if \(!list\.length\) return null/);

const dateContext = { COMPETITION_CODES:["KCR", "MOB"] };
vm.createContext(dateContext);
vm.runInContext([
  functionSource(rpc, "safeStr"),
  functionSource(rpc, "accessCodes_"),
  functionSource(rpc, "normalizeAccess_"),
  functionSource(rpc, "normalizeAccountType_"),
  functionSource(rpc, "normalizeEffectiveDate_"),
  functionSource(rpc, "operatorIsAdminRow_"),
  functionSource(rpc, "operatorRowsForEffectiveDate_"),
].join("\n"), dateContext);

const permissionRows = [
  { id:1, account_type:"JUDGE", name:"심사원", access:"MOB", team_group:"상시팀", role:"센서리 심사위원", effective_date:"" },
  { id:2, account_type:"JUDGE", name:"심사원", access:"MOB", team_group:"A조", role:"센서리 심사위원", effective_date:"2026-08-06" },
  { id:3, account_type:"JUDGE", name:"심사원", access:"MOB", team_group:"B조", role:"센서리 헤드 심사위원", effective_date:"2026-08-07" },
  { id:4, account_type:"JUDGE", name:"심사원", access:"KCR", team_group:"KCR팀", role:"센서리 심사위원", effective_date:"" },
];
const day6 = dateContext.operatorRowsForEffectiveDate_(permissionRows, "2026-08-06");
assert.deepEqual(Array.from(day6.filter(row => row.access === "MOB"), row => row.id), [2]);
assert.deepEqual(Array.from(day6.filter(row => row.access === "KCR"), row => row.id), [4]);
const day7 = dateContext.operatorRowsForEffectiveDate_(permissionRows, "2026-08-07");
assert.deepEqual(Array.from(day7.filter(row => row.access === "MOB"), row => row.id), [3]);
const otherDay = dateContext.operatorRowsForEffectiveDate_(permissionRows, "2026-08-08");
assert.deepEqual(Array.from(otherDay.filter(row => row.access === "MOB"), row => row.id), [1]);

const teamContext = {};
vm.createContext(teamContext);
vm.runInContext(functionSource(assessment, "normalizeTeamLabel_"), teamContext);
assert.equal(teamContext.normalizeTeamLabel_("A조"), "A조");
assert.equal(teamContext.normalizeTeamLabel_("b"), "B조");
assert.equal(teamContext.normalizeTeamLabel_("2팀"), "2팀");

process.stdout.write("Stage125 KCR station/comment and MOB dated-permission tests passed.\n");
