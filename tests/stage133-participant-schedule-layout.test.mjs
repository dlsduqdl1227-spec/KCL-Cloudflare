import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = fs.readFileSync(path.join(root, "public", "registry", "index.html"), "utf8");
const rpcSource = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");

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

for (const id of ["mDate", "mDay", "mOrder", "mStation", "mWaiting", "mPrep", "mPerformance", "mCleanup"]) {
  assert.match(registry, new RegExp(`id=["']${id}["']`), `${id} schedule field must exist`);
}
assert.match(registry, /var PARTICIPANT_SCHEDULE_CODES=\['KBC','KTCC','MOC','MOB','KCR','IKRC','KCAC'\]/);
assert.doesNotMatch(registry, /id="scheduleBuilder"|공통 일정 만들기/);
assert.match(registry, /id="bulkParticipantDate"/);
assert.match(registry, /선택 선수 일정 일괄 변경/);
assert.match(registry, /class="participant-table-wrap"/);
assert.match(registry, /class="table participant-table"/);
assert.match(registry, /\.participant-table \.cell-name,.participant-table \.cell-phone\{white-space:nowrap\}/);
assert.match(registry, /@media\(max-width:700px\)/);
assert.match(registry, /data-label=/);
assert.match(registry, /id="participantSortMode"[\s\S]*참가번호 낮은 순[\s\S]*순서 정렬/);
assert.match(registry, /participantSortMode='number-asc'/);

const sortContext = {};
vm.createContext(sortContext);
vm.runInContext([
  functionSource(registry, "participantPrimaryNumber_"),
  functionSource(registry, "participantPrelimDate_"),
  functionSource(registry, "participantNaturalCompare_"),
  functionSource(registry, "sortParticipantRowsForRegistry_"),
].join("\n"), sortContext);
const unsortedParticipants = [
  { rowIndex:1, competitionCode:"KCAC", prelimCupNo:"1", name:"가" },
  { rowIndex:2, competitionCode:"KCAC", prelimCupNo:"10", name:"다" },
  { rowIndex:3, competitionCode:"KCAC", prelimCupNo:"8", name:"나" },
  { rowIndex:4, competitionCode:"KCAC", prelimCupNo:"2", name:"라" },
];
assert.deepEqual(
  Array.from(sortContext.sortParticipantRowsForRegistry_("KCAC", unsortedParticipants, "number-asc"), row => row.prelimCupNo),
  ["1", "2", "8", "10"],
  "participant numbers must be sorted numerically rather than by database registration order",
);
assert.deepEqual(
  Array.from(sortContext.sortParticipantRowsForRegistry_("KCAC", unsortedParticipants, "number-desc"), row => row.prelimCupNo),
  ["10", "8", "2", "1"],
);
assert.deepEqual(unsortedParticipants.map(row => row.prelimCupNo), ["1", "10", "8", "2"], "sorting must not mutate stored participant rows");

const elements = {};
for (const id of ["comp", "mNo", "mName", "mPhone", "mAff", "mCup", "mSample", "mDate", "mDay", "mOrder", "mStation", "mWaiting", "mPrep", "mPerformance", "mCleanup", "participantEditState", "participantCancelBtn", "participantSaveBtn", "participantFormLabel"]) {
  elements[id] = { value: "", textContent: "", focus() {}, classList: { toggle() {}, add() {}, remove() {} } };
}
Object.assign(elements.comp, { value: "KBC" });
Object.assign(elements.mNo, { value: "28" });
Object.assign(elements.mName, { value: "테스트 선수" });
Object.assign(elements.mPhone, { value: "01012345678" });
Object.assign(elements.mAff, { value: "테스트 소속" });
Object.assign(elements.mCup, { value: "28" });
Object.assign(elements.mDate, { value: "2026-08-19" });
Object.assign(elements.mDay, { value: "1일차" });
Object.assign(elements.mOrder, { value: "28" });
Object.assign(elements.mStation, { value: "A" });
Object.assign(elements.mWaiting, { value: "19:00~19:10" });
Object.assign(elements.mPrep, { value: "19:14~19:21" });
Object.assign(elements.mPerformance, { value: "19:22~19:29" });
Object.assign(elements.mCleanup, { value: "19:29~19:35" });

let savedPayload = null;
const context = {
  document: { getElementById: id => elements[id] || null },
  editingParticipantId: null,
  editingParticipantOriginal: null,
  actor: { accountType: "ADMIN" },
  rpc: (_action, args) => { savedPayload = args[0]; },
  msg() {},
  cancelParticipantEdit() {},
  loadParticipants() {},
  setHidden_() {},
  participantRows: [],
};
vm.createContext(context);
vm.runInContext([
  "var PARTICIPANT_SCHEDULE_CODES=['KBC','KTCC','MOC','MOB','KCR','IKRC','KCAC'];",
  functionSource(registry, "participantUsesSchedule_"),
  functionSource(registry, "participantPrimaryNumber_"),
  functionSource(registry, "participantPrelimDate_"),
  functionSource(registry, "saveOneParticipant"),
  functionSource(registry, "editParticipant"),
].join("\n"), context);

context.saveOneParticipant();
assert.equal(savedPayload.competitionCode, "KBC");
assert.equal(savedPayload.competitionDate, "2026-08-19");
assert.deepEqual(JSON.parse(JSON.stringify(savedPayload.extra)), {
  "대회일": "2026-08-19",
  "예선일": "2026-08-19",
  "competitionDate": "2026-08-19",
});

context.participantRows = [{
  rowIndex: 7,
  competitionCode: "KBC",
  uniqueNo: "28",
  prelimCupNo: "28",
  name: "임찬호",
  affiliation: "프리퍼커피",
  phone: "01083819548",
  extra: {
    "대회일": "2026-08-19",
    "운영일차": "1일차",
    "경연순서": "28",
    "스테이션번호": "A",
    "대기시간": "19:00~19:10",
    "준비시간": "19:14~19:21",
    "시연시간": "19:22~19:29",
    "정리시간": "19:29~19:35",
  },
}];
context.editParticipant(7);
assert.equal(elements.mDate.value, "2026-08-19");
assert.equal(elements.mPrep.value, "19:14~19:21");
assert.equal(elements.mPerformance.value, "19:22~19:29");
assert.equal(elements.mCleanup.value, "19:29~19:35");
assert.match(elements.participantEditState.textContent, /기존 정보는 유지됩니다/);

assert.match(functionSource(rpcSource, "participantPayloadFromRow_"), /'로스팅시간'/);
assert.match(functionSource(rpcSource, "participantPayloadFromRow_"), /'정리시간'/);
assert.match(functionSource(rpcSource, "participantRowOut_"), /cleanupTime/);
assert.match(functionSource(rpcSource, "participantRowOut_"), /operatingDay/);

process.stdout.write("Stage133 direct participant schedule and responsive registry layout tests passed.\n");
