import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

const elements = {
  picker: { value:"0" },
  number: { value:"", readOnly:true },
  name: { value:"", readOnly:false, placeholder:"" },
  "mob-participant-help": { textContent:"", style:{} },
};
const context = {
  document: { getElementById: (id) => elements[id] || null },
  participantListForCode_: () => [{ number:"1", roundCupNo:"1", name:"이세명", competitionDate:"2026-08-06", identityHidden:false }],
  participantAssignmentIdentityHidden_: (row) => !!row?.identityHidden,
};
vm.createContext(context);
vm.runInContext([
  functionSource(assessment, "participantNameForAssignment_"),
  functionSource(assessment, "applyParticipantAssignmentToInputs_"),
  functionSource(assessment, "applyParticipantSelect_"),
].join("\n"), context);

context.applyParticipantSelect_("MOB", "picker", "number", "name");
assert.equal(elements.number.value, "1", "MOB participant number must be filled automatically from the selected timetable participant");
assert.equal(elements.name.value, "이세명");
assert.match(elements["mob-participant-help"].textContent, /대회일 2026-08-06/);
elements.picker.value = "";
context.applyParticipantSelect_("MOB", "picker", "number", "name");
assert.equal(elements.number.value, "", "clearing the MOB participant selection must clear the auto-filled number");
assert.equal(elements.name.value, "");

const participantTable = functionSource(registry, "participantListHtml_");
const operatorTable = functionSource(registry, "renderSelectedOperatorsTable");
const adminTable = functionSource(registry, "renderAdminTable");
assert.doesNotMatch(participantTable, /<th>ID<\/th>/);
assert.doesNotMatch(operatorTable, /<th>ID<\/th>/);
assert.doesNotMatch(adminTable, /<th>ID<\/th>/);
assert.match(participantTable, /참가자번호/);
assert.match(participantTable, /r\.prelimCupNo\|\|i\+1/);
assert.match(operatorTable, /\(i\+1\)/);
assert.match(functionSource(assessment, "renderParticipantControl_"), /numInput\.readOnly = true/);
assert.match(functionSource(assessment, "renderParticipantControl_"), /타임테이블 순서에 따른 참가자번호가 자동 입력/);
assert.match(functionSource(assessment, "renderParticipantControl_"), /대회 날짜/);
assert.doesNotMatch(functionSource(registry, "editOperator"), /ID/);
assert.doesNotMatch(functionSource(registry, "editAdmin"), /ID/);
assert.doesNotMatch(functionSource(registry, "editParticipant"), /ID/);

process.stdout.write("Stage130 MOB automatic participant-number and hidden internal-ID tests passed.\n");
