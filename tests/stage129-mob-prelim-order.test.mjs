import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

const context = {
  safeStr: (value) => value == null ? "" : String(value).trim(),
  parseJson: (value, fallback) => {
    try { return JSON.parse(value); }
    catch { return fallback; }
  },
  normalizeEffectiveDate_: (value) => String(value || "").trim(),
};
vm.createContext(context);
vm.runInContext([
  functionSource(rpc, "participantScheduleSortMeta_"),
  functionSource(rpc, "sortParticipantRowsForCompetition_"),
].join("\n"), context);

const rows = [
  { id: 1, competition_code:"MOB", name:"등록순 첫 선수", extra_json:JSON.stringify({ 대회일:"2026-08-07", 경연순서:"2", 대기시간:"10:20~10:25" }) },
  { id: 2, competition_code:"MOB", name:"이세명", extra_json:JSON.stringify({ 대회일:"2026-08-06", 경연순서:"1", 대기시간:"09:45~09:50" }) },
  { id: 3, competition_code:"MOB", name:"8월 6일 두 번째", extra_json:JSON.stringify({ 대회일:"2026-08-06", 경연순서:"2", 대기시간:"10:20~10:25" }) },
  { id: 4, competition_code:"MOB", name:"일정 미지정", extra_json:"{}" },
  { id: 5, competition_code:"MOB", name:"8월 7일 첫 번째", extra_json:JSON.stringify({ 대회일:"2026-08-07", 경연순서:"1", 대기시간:"09:45~09:50" }) },
];

const sorted = context.sortParticipantRowsForCompetition_(rows, "MOB");
assert.deepEqual(Array.from(sorted, (row) => row.name), ["이세명", "8월 6일 두 번째", "8월 7일 첫 번째", "등록순 첫 선수", "일정 미지정"]);
assert.match(functionSource(rpc, "listParticipants"), /sortParticipantRowsForCompetition_/);
assert.match(functionSource(rpc, "getParticipantAssignments"), /sortParticipantRowsForCompetition_/);

process.stdout.write("Stage129 MOB preliminary schedule-order tests passed.\n");
