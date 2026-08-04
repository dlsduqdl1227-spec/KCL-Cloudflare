import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

assert.doesNotMatch(assessment, /_evaluationPurposeScope/);
const wrap = { innerHTML: "" };
const help = { textContent: "" };
const station = { id: "station1", label: "스테이션 1", prefix: "T", start: 1, end: 3 };
let started = null;
const context = {
  _selComp: { code: "IKRC", currentRound: "예선" },
  _evaluationPurpose: { type: "calibration", scope: "station", label: "스테이션 켈리브레이션" },
  document: { getElementById: (id) => id === "ikrc-station-grid" ? wrap : (id === "ikrc-station-help" ? help : null) },
  ikrcStationSettings_: () => [station],
  isIkrcCalibrationMode_: () => true,
  ikrcAssignedStation_: () => null,
  ikrcStationCups_: () => ["T-1", "T-2", "T-3"],
  escapeJsString_: (value) => value,
  escHtml: (value) => String(value),
  initIkrcSamples: (cups, selected) => { started = { cups, selected }; },
  toast: () => {},
};
vm.createContext(context);
vm.runInContext([
  functionSource(assessment, "renderIkrcStationChoices_"),
  functionSource(assessment, "startIkrcStation_"),
].join("\n"), context);

context.renderIkrcStationChoices_();
assert.match(wrap.innerHTML, /startIkrcStation_\('station1'\)/);
assert.match(help.textContent, /현장에서 안내받은 스테이션/);
assert.doesNotMatch(help.textContent, /스테이션 켈리브레이션/);
context.startIkrcStation_("station1");
assert.deepEqual(started.cups, ["T-1", "T-2", "T-3"]);
assert.equal(started.selected.id, "station1");

context._evaluationPurpose.scope = "all";
context.renderIkrcStationChoices_();
assert.match(help.textContent, /동일 샘플 범위/);
assert.doesNotMatch(help.textContent, /전체 켈리브레이션입니다/);

const selectButtonSource = functionSource(assessment, "updateSelectReviewButton_");
assert.match(selectButtonSource, /스테이션별 켈리브레이션/);
assert.doesNotMatch(selectButtonSource, /스테이션 켈리브레이션 시작/);
assert.doesNotMatch(selectButtonSource, /스테이션 선택'\)\)/);
const setupSource = functionSource(assessment, "showIkrcSetup");
assert.match(setupSource, /IKRC 켈리브레이션/);
assert.doesNotMatch(setupSource, /evaluationPurposeLabel_\(\)/);

process.stdout.write("Stage127 IKRC station-click tests passed.\n");
