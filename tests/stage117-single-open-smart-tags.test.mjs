import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");

function functionSource(name) {
  const marker = `function ${name}(`;
  const start = assessment.indexOf(marker);
  assert.ok(start >= 0, `${name} 함수를 찾을 수 없습니다.`);
  const bodyStart = assessment.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = bodyStart; i < assessment.length; i += 1) {
    const char = assessment[i];
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
      if (depth === 0) return assessment.slice(start, i + 1);
    }
  }
  throw new Error(`${name} 함수 끝을 찾을 수 없습니다.`);
}

const stateContext = {};
vm.createContext(stateContext);
[
  "smartTagOpenBranchState_",
  "smartTagSetOpenBranchState_",
  "smartTagBranchIsOpen_",
].forEach((name) => vm.runInContext(functionSource(name), stateContext));

const openState = {};
stateContext.smartTagSetOpenBranchState_(openState, "flavor", 0, -1);
assert.equal(stateContext.smartTagBranchIsOpen_(openState, "flavor", 0), true);
assert.equal(stateContext.smartTagBranchIsOpen_(openState, "flavor", 1), false);

stateContext.smartTagSetOpenBranchState_(openState, "flavor", 1, -1);
assert.equal(stateContext.smartTagBranchIsOpen_(openState, "flavor", 0), false);
assert.equal(stateContext.smartTagBranchIsOpen_(openState, "flavor", 1), true);

stateContext.smartTagSetOpenBranchState_(openState, "flavor", 1, 2);
assert.equal(stateContext.smartTagBranchIsOpen_(openState, "flavor", 1, 1), false);
assert.equal(stateContext.smartTagBranchIsOpen_(openState, "flavor", 1, 2), true);

const kbcRenderer = functionSource("kbcTagButtonsHtml_");
assert.match(kbcRenderer, /smartTagBranchIsOpen_\(_kbcOpenSmartTagBranches/);
assert.doesNotMatch(kbcRenderer, /smartTagPathBranchSelected_|smartTagPathSecondarySelected_/);

const mobRenderer = functionSource("mobTagButtonsHtml_");
assert.match(mobRenderer, /smartTagBranchIsOpen_\(_mobOpenSmartTagBranches/);
assert.doesNotMatch(mobRenderer, /smartTagPathBranchSelected_|smartTagPathSecondarySelected_/);

const kcacRenderer = functionSource("kcacSmartTagButtonsHtml_");
assert.match(kcacRenderer, /smartTagBranchIsOpen_\(_kcacOpenSmartTagBranches/);
assert.doesNotMatch(kcacRenderer, /smartTagDataHasSelected_/);

const reviewRenderer = functionSource("reviewHierarchicalSmartTagButtonsHtml_");
assert.match(reviewRenderer, /smartTagBranchIsOpen_\(_reviewOpenSmartTagBranches/);
assert.doesNotMatch(reviewRenderer, /reviewSmartTagBranchSelected_|reviewSmartTagSecondaryBranchSelected_/);

assert.match(functionSource("kbcOpenInlinePrimary_"), /smartTagSetOpenBranchState_/);
assert.match(functionSource("mobOpenTagPrimary_"), /smartTagSetOpenBranchState_/);
assert.match(functionSource("toggleKcacSmartTagGroup_"), /smartTagSetOpenBranchState_/);
assert.match(functionSource("toggleReviewSmartTagPrimary"), /smartTagSetOpenBranchState_/);
assert.match(functionSource("toggleReviewSmartTagSecondary"), /smartTagSetOpenBranchState_/);

assert.match(functionSource("startKbc"), /_kbcOpenSmartTagBranches = \{\}/);
assert.match(functionSource("startMob"), /_mobOpenSmartTagBranches = \{\}/);
assert.match(functionSource("startKcac"), /_kcacOpenSmartTagBranches = \{\}/);
assert.match(functionSource("openReviewEdit"), /_reviewOpenSmartTagBranches = \{\}/);

process.stdout.write("Stage117 single-open smart-tag tests passed.\n");
