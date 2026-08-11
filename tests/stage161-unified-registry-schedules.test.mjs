import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = fs.readFileSync(path.join(root, "public", "registry", "index.html"), "utf8");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} function not found`);
  const open = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} function incomplete`);
}

// 한 페이지에서 선수·심사위원·관리자를 명확히 분리한다.
assert.match(registry, /id="tabbtn-players"[^>]*>선수·일정</);
assert.match(registry, /id="tabbtn-operators"[^>]*>심사위원</);
assert.match(registry, /id="tabbtn-admins"[^>]*>관리자</);
assert.match(registry, /id="tab-admins"/);
assert.match(functionSource(registry, "switchRegistryTab"), /\['players','operators','admins'\]/);

// 엑셀 도구는 기존 기능을 유지하되 기본 화면에서는 작은 접이식 보조 메뉴다.
assert.match(registry, /<details class="card registry-import-panel" id="allUploadCard">/);
assert.match(registry, /엑셀 일괄 등록·백업/);
assert.match(registry, /id="allRegistryFile"/);
assert.match(registry, /registerAllFromExcel\(\)/);
assert.match(registry, /exportCurrentRegistryExcel\(\)/);

// 모든 대회가 허용 라운드별 일정을 만들고 선수·심사위원을 체크 배정할 수 있다.
for (const id of ["scheduleRound", "scheduleDate", "scheduleName", "scheduleStation", "scheduleWaiting", "schedulePrep", "schedulePerformance", "scheduleCleanup", "participantScheduleSelect", "operatorScheduleSelect"]) {
  assert.match(registry, new RegExp(`id=["']${id}["']`));
}
assert.match(functionSource(registry, "syncScheduleRoundOptions_"), /ROUND_OPTIONS\[code\]/);
assert.match(functionSource(registry, "saveRegistrySchedule_"), /saveRegistrySchedule/);
assert.match(functionSource(registry, "deleteRegistrySchedule_"), /deleteRegistrySchedule/);
assert.match(functionSource(registry, "assignSelectedParticipantsToSchedule_"), /targetType:'participants'/);
assert.match(functionSource(registry, "assignSelectedOperatorsToSchedule_"), /targetType:'operators'/);
assert.match(functionSource(registry, "participantSelectCell_"), /data-schedule-part/);
assert.match(functionSource(registry, "renderSelectedOperatorsTable"), /data-bulk-op/);
assert.match(functionSource(registry, "renderSelectedOperatorsTable"), /data-op-identity/);
assert.match(functionSource(registry, "toggleAllVisibleOperators_"), /selected\[key\]/);
assert.match(functionSource(registry, "participantScheduleParts_"), /ex\['일정ID'\]/);
assert.match(functionSource(registry, "participantScheduleParts_"), /ex\['일정구분'\]/);

// 관리자는 심사위원 폼과 분리하고 ALL 권한으로 저장한다.
assert.doesNotMatch(registry, /<option value="ADMIN">관리자<\/option>/);
assert.match(functionSource(registry, "saveOneAdmin"), /accountType:'ADMIN'/);
assert.match(functionSource(registry, "saveOneAdmin"), /access:'ALL'/);
assert.match(functionSource(registry, "operatorVisibleForSelectedComp"), /operatorIsAdminRow\(r\)\)return false/);
assert.match(functionSource(registry, "renderAdminTable"), /operatorIsAdminRow/);

// MOB 참가자 표시일은 통합 관리자 설정에서 숨기고, 요소가 없을 때 기존 저장값을 건드리지 않는다.
const mobHtmlContext = {};
vm.createContext(mobHtmlContext);
vm.runInContext(functionSource(assessment, "configSelectableOptionsHtml_"), mobHtmlContext);
assert.equal(mobHtmlContext.configSelectableOptionsHtml_({code:"MOB"}, "admin-cfg"), "");
const mobPayloadContext = {document:{getElementById:()=>null}};
vm.createContext(mobPayloadContext);
vm.runInContext(functionSource(assessment, "configSelectableOptionsPayload_"), mobPayloadContext);
assert.equal(mobPayloadContext.configSelectableOptionsPayload_("MOB", "admin-cfg", {}), null);

const dispatchSource = functionSource(rpc, "dispatch");
assert.match(dispatchSource, /saveRegistrySchedule/);
assert.match(dispatchSource, /deleteRegistrySchedule/);
assert.match(dispatchSource, /assignRegistrySchedule/);

const saveScheduleSource = functionSource(rpc, "saveRegistrySchedule");
assert.match(saveScheduleSource, /registrySchedules/);
assert.match(saveScheduleSource, /UPDATE competitions SET option_settings=/);
assert.match(saveScheduleSource, /context\.schedules\.length >= 100/);
assert.doesNotMatch(saveScheduleSource, /DELETE FROM (participants|operators|scores)/);

const assignScheduleSource = functionSource(rpc, "assignRegistrySchedule");
assert.match(assignScheduleSource, /bulkApplyOperatorEffectiveDate/);
assert.match(assignScheduleSource, /teamGroupOverride:context\.code === 'IKRC' \? ''/);
assert.match(assignScheduleSource, /extra\['일정ID'\]/);
assert.match(assignScheduleSource, /extra\['일정명'\]/);
assert.match(assignScheduleSource, /extra\['일정구분'\]/);
assert.match(assignScheduleSource, /UPDATE participants SET extra_json=/);
assert.doesNotMatch(assignScheduleSource, /DELETE FROM (participants|operators|scores)/);

// MOB도 선수 기본정보를 먼저 등록하고 나중에 일정에 배정할 수 있어야 한다.
const upsertParticipantSource = functionSource(rpc, "upsertParticipant");
assert.doesNotMatch(upsertParticipantSource, /MOB 선수 등록 시 대회일을 반드시/);
assert.doesNotMatch(functionSource(registry, "saveOneParticipant"), /MOB 선수 등록 시 대회일을 반드시/);
assert.match(assignScheduleSource, /extra\['대회일'\] = schedule\.date/);

const deleteScheduleSource = functionSource(rpc, "deleteRegistrySchedule");
assert.match(deleteScheduleSource, /선수 정보·심사 권한·점수는 유지/);
assert.doesNotMatch(deleteScheduleSource, /DELETE FROM (participants|operators|scores)/);

process.stdout.write("Stage161 unified registry tabs and schedule assignment tests passed.\n");
