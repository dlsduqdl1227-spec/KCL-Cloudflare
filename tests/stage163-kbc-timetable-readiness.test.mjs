import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
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

// 운영 DB처럼 내부 ID가 경연순서와 반대로 등록되어도 KBC 확정 순서로 보여야 합니다.
const reverseRegisteredRows = Array.from({ length: 28 }, (_, index) => {
  const performanceOrder = 28 - index;
  return {
    id: 86 + index,
    competition_code: "KBC",
    name: `KBC 선수 ${performanceOrder}`,
    unique_no: String(performanceOrder),
    prelim_cup_no: String(performanceOrder),
    extra_json: JSON.stringify({
      대회일: "2026-08-19",
      경연순서: String(performanceOrder),
      준비시간: `${String(8 + Math.floor(index / 3)).padStart(2, "0")}:00~08:07`,
      시연시간: "08:08~08:15",
    }),
  };
});
const sorted = context.sortParticipantRowsForCompetition_(reverseRegisteredRows, "KBC");
assert.deepEqual(Array.from(sorted, row => Number(JSON.parse(row.extra_json).경연순서)), Array.from({ length: 28 }, (_, index) => index + 1));
assert.equal(sorted[0].unique_no, "1");
assert.equal(sorted[27].unique_no, "28");

// 일정이 없는 임시 선수는 확정 일정 선수 뒤에 두고, 다른 대회 정렬에는 영향을 주지 않습니다.
const withDraft = context.sortParticipantRowsForCompetition_([
  { id: 1, competition_code:"KBC", unique_no:"임시", extra_json:"{}" },
  ...reverseRegisteredRows,
], "KBC");
assert.equal(withDraft.at(-1).unique_no, "임시");
assert.match(functionSource(rpc, "listParticipants"), /sortParticipantRowsForCompetition_/);
assert.match(functionSource(rpc, "getParticipantAssignments"), /sortParticipantRowsForCompetition_/);

// KBC 운영 핵심 흐름: 참가자 선택, 시간 검증·감점/실격, 중복 제출 방지, 검수와 공식 순위 집계.
for (const marker of [
  'id="kbc-participant-select"',
  "function kbcParseTimeMsStrict_",
  "function kbcAutoTimePenaltyFromMs_",
  "function kbcSubmit()",
  "function kbcOfficialScoreFromRows_",
]) assert.ok(assessment.includes(marker) || rpc.includes(marker), `KBC readiness marker missing: ${marker}`);

const submitScores = functionSource(rpc, "submitScores");
assert.match(submitScores, /x\.code === 'KBC'/);
assert.match(submitScores, /이미 제출된 KBC 평가입니다/);
assert.match(functionSource(rpc, "getReviewList"), /\['KCR','KCAC','KBC','MOB','IKRC'\]/);
assert.match(functionSource(rpc, "aggregateRankingGroup_"), /code === 'KBC'/);

process.stdout.write("Stage163 KBC timetable and event-readiness tests passed.\n");
