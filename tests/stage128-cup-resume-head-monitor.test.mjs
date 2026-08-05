import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

const domStub = { getElementById: () => null, querySelector: () => null };
const cupContext = {
  document: domStub,
  _cupping: {
    cups: [
      { activeAttr:"acidity", noteOverall:"", generatedComment:"", flavor:3, aftertaste:3, acidity:3, sweetness:3, mouthfeel:3, overall:3 },
      { activeAttr:"flavor", noteOverall:"", generatedComment:"", flavor:3, aftertaste:3, acidity:3, sweetness:3, mouthfeel:3, overall:3 },
    ],
    currentIdx:0,
    currentAttr:"acidity",
  },
  saveKcrOverallCommentBuffer_: () => {},
  validateCuppingCommentEdited: () => true,
  renderCuppingCupNav: () => {},
  renderCuppingAttrCard: () => {},
  updateCuppingTotal: () => {},
  roundScore02: Number,
};
vm.createContext(cupContext);
vm.runInContext([
  functionSource(assessment, "saveCuppingCurrentFromDOM"),
  functionSource(assessment, "switchCuppingCup"),
  functionSource(assessment, "switchCuppingAttr"),
].join("\n"), cupContext);
cupContext.switchCuppingCup(1);
assert.equal(cupContext._cupping.currentAttr, "flavor");
cupContext.switchCuppingAttr("mouthfeel");
cupContext.switchCuppingCup(0);
assert.equal(cupContext._cupping.currentAttr, "acidity", "KCR must resume the last attribute independently for each cup");
cupContext.switchCuppingCup(1);
assert.equal(cupContext._cupping.currentAttr, "mouthfeel");

const ikrcContext = {
  document: domStub,
  _ikrcSamples: [
    { activeAttr:"acidity", comment:"", generatedComment:"" },
    { activeAttr:"flavor", comment:"", generatedComment:"" },
  ],
  _ikrcIdx:0,
  _ikrcCurrentAttr:"acidity",
  renderIkrcAttrTabs: () => {},
  renderIkrcAttrCard: () => {},
  calcIkrcTotal: () => {},
  renderIkrcNav: () => {},
  roundScore02: Number,
};
vm.createContext(ikrcContext);
vm.runInContext([
  functionSource(assessment, "saveIkrc"),
  functionSource(assessment, "loadIkrcSample"),
  functionSource(assessment, "switchIkrcAttr"),
].join("\n"), ikrcContext);
ikrcContext.loadIkrcSample(1);
assert.equal(ikrcContext._ikrcCurrentAttr, "flavor");
ikrcContext.switchIkrcAttr("mouthfeel");
ikrcContext.loadIkrcSample(0);
assert.equal(ikrcContext._ikrcCurrentAttr, "acidity", "IKRC must resume the last attribute independently for each sample");
ikrcContext.loadIkrcSample(1);
assert.equal(ikrcContext._ikrcCurrentAttr, "mouthfeel");

const mobileTotalRule = assessment.match(/\.eval-wrap\.active \.eval-total-val,[\s\S]*?font-variant-numeric:tabular-nums!important;/)?.[0] || "";
assert.match(mobileTotalRule, /max-width:none!important/);
assert.match(mobileTotalRule, /overflow:visible!important/);
assert.match(mobileTotalRule, /white-space:nowrap!important/);
assert.doesNotMatch(mobileTotalRule, /max-width:74px|overflow:hidden/);

assert.doesNotMatch(functionSource(assessment, "goReview"), /goIkrcOfficialStationResults_/);
assert.match(functionSource(assessment, "shouldHideCompletedReviewRows"), /isHeadRoleForCode_\('IKRC'\)/);
assert.match(functionSource(rpc, "getReviewList"), /ownOnly: !manager/);
assert.match(functionSource(rpc, "getReviewList"), /readOnlyHeadMonitor:false/);
assert.match(functionSource(rpc, "ikrcOfficialReviewComparison_"), /comment:\s*score\.comment/);
assert.doesNotMatch(functionSource(rpc, "updateReviewRow"), /통계 확인 전용/);
assert.match(functionSource(rpc, "updateReviewStatus"), /제출 즉시 확정/);

process.stdout.write("Stage128 cup resume, mobile total, and IKRC head-monitor tests passed.\n");
