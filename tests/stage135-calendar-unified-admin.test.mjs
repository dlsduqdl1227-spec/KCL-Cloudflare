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

assert.match(registry, /id="mDate"[^>]*type="date"[^>]*openDatePicker_/);
assert.match(registry, /id="opDate"[^>]*type="date"[^>]*openDatePicker_/);
assert.match(registry, /id="bulkOperatorDate"[^>]*type="date"[^>]*openDatePicker_/);
assert.match(registry, /input\[type="date"\].*calendar-picker-indicator/s);

const pickerContext = {};
vm.createContext(pickerContext);
vm.runInContext(functionSource(registry, "openDatePicker_"), pickerContext);
let pickerOpenCount = 0;
pickerContext.openDatePicker_({ disabled:false, showPicker(){ pickerOpenCount += 1; } });
assert.equal(pickerOpenCount, 1);

assert.match(registry, /id="tabbtn-players"[^>]*>선수·일정</);
assert.match(registry, /id="tabbtn-operators"[^>]*>심사위원</);
assert.match(registry, /id="tabbtn-admins"[^>]*>관리자</);
assert.match(registry, /id="tab-admins"/);
assert.doesNotMatch(registry, /<option value="ADMIN">관리자<\/option>/);
assert.match(functionSource(registry, "saveOneAdmin"), /accountType:'ADMIN'/);
assert.match(functionSource(registry, "saveOneAdmin"), /access:'ALL'/);
assert.match(functionSource(registry, "operatorVisibleForSelectedComp"), /operatorIsAdminRow\(r\)\)return false/);
assert.match(functionSource(registry, "renderAdminTable"), /전체 관리자/);

assert.match(functionSource(assessment, "isTeamLeaderForCode_"), /if \(isAdminRole\(\)\) return true/);
assert.match(functionSource(assessment, "adminRenderRunCards_"), /station-settings/);
assert.match(functionSource(assessment, "adminRenderRunCards_"), /ikrc-head-input/);
assert.match(functionSource(assessment, "adminRenderRunCards_"), /ikrc-cal-input/);
assert.match(functionSource(assessment, "adminRenderRunCards_"), /mob-sens-head/);
assert.match(functionSource(assessment, "managementOpenKcrCalibration_"), /scope === 'station' \? 'station'/);
assert.match(functionSource(assessment, "adminOpenCompetitionSettings_"), /adminSwitchSection\('config'\)/);

const forbiddenNotice = /헤드는 직접 팀별 켈리브레이션을 평가한 스테이션만|대회팀장·관리자는 모든 스테이션|헤드는 배정되었거나 공식 대회평가를 제출한 스테이션/;
assert.doesNotMatch(assessment, forbiddenNotice);
assert.doesNotMatch(rpc, forbiddenNotice);

assert.match(registry, /id="selectiveParticipant"/);
assert.match(registry, /id="selectiveScore"/);
assert.match(functionSource(registry, "loadSelectiveResetOptions"), /getSelectiveResetOptions/);
assert.match(functionSource(registry, "deleteSelectedParticipantReset"), /deleteSelectedParticipantData/);
assert.match(functionSource(registry, "deleteSelectedScoreReset"), /deleteSelectedScoreData/);
assert.match(functionSource(rpc, "getSelectiveResetOptions"), /hasAdmin\(actor\)/);
assert.match(functionSource(rpc, "deleteSelectedParticipantData"), /competition_code=\?/);
assert.match(functionSource(rpc, "deleteSelectedScoreData"), /competition_code=\?/);

process.stdout.write("Stage135 calendar, unified account registration, and admin-superset tests passed.\n");
