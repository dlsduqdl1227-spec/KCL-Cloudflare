import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const kcrTagsSource = fs.readFileSync(path.join(root, "public", "assets", "kcr-sensory-tags.js"), "utf8");
const sharedTagsSource = fs.readFileSync(path.join(root, "public", "assets", "shared-sensory-tags.js"), "utf8");

const tagContext = {};
vm.createContext(tagContext);
vm.runInContext(kcrTagsSource, tagContext, { filename: "kcr-sensory-tags.js" });
vm.runInContext(sharedTagsSource, tagContext, { filename: "shared-sensory-tags.js" });

const flavor = tagContext.KCL_SENSORY_SMART_TAGS.flavor;
assert.equal(flavor["향미 계열"], undefined, "향미 계열 중간 탐색 단계가 남아 있으면 안 됩니다.");
assert.ok(Array.isArray(flavor["견과·코코아 계열"]), "견과·코코아 계열은 바로 선택 가능한 1차 계열이어야 합니다.");
assert.ok(flavor["견과·코코아 계열"].length > 0, "견과·코코아 세부 특성이 비어 있으면 안 됩니다.");

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

const selectionContext = {};
vm.createContext(selectionContext);
[
  "smartTagDedupeList_",
  "smartTagSamePath_",
  "smartTagCanonicalPath_",
  "smartTagTogglePathValue_",
  "smartTagCollectDataLabels_",
  "smartTagToggleLabelBranchValue_",
].forEach((name) => vm.runInContext(functionSource(name), selectionContext));

let pathSelection = selectionContext.smartTagTogglePathValue_([], "견과·코코아 계열");
assert.deepEqual(Array.from(pathSelection), ["견과·코코아 계열"]);
pathSelection = selectionContext.smartTagTogglePathValue_(pathSelection, "견과·코코아 계열 > 아몬드");
assert.deepEqual(Array.from(pathSelection), ["견과·코코아 계열 > 아몬드"]);
pathSelection = selectionContext.smartTagTogglePathValue_(
  ["향미 계열 > 견과·코코아 계열 > 아몬드"],
  "견과·코코아 계열",
);
assert.deepEqual(Array.from(pathSelection), ["견과·코코아 계열"]);

let labelSelection = selectionContext.smartTagToggleLabelBranchValue_(
  [],
  "견과·코코아 계열",
  flavor["견과·코코아 계열"],
  [],
);
assert.deepEqual(Array.from(labelSelection), ["견과·코코아 계열"]);
labelSelection = selectionContext.smartTagToggleLabelBranchValue_(
  labelSelection,
  flavor["견과·코코아 계열"][0],
  [],
  ["견과·코코아 계열"],
);
assert.deepEqual(Array.from(labelSelection), [flavor["견과·코코아 계열"][0]]);

assert.match(assessment, /\.shared-sensory-smart-tags \.category-primary\{\s*display:grid/);
assert.match(assessment, /\.shared-sensory-smart-tags \.category-secondary\.active\{display:grid\}/);
assert.match(assessment, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(assessment, /sharedSensory:a\.tagGroup === 'espresso' \|\| a\.tagGroup === 'signature'/);
assert.match(assessment, /meta\.group === 'brewing' && meta\.category !== 'Professionalism'/);
assert.match(assessment, /j\.type === 'final-sensory' && key !== '프레젠'/);
assert.match(assessment, /smart-tags-section shared-sensory-smart-tags/);
assert.match(assessment, /shared-sensory-tags\.js\?v=stage116/);
assert.match(assessment, /meta\.competition === 'KCR' && !meta\.isFlavorReference/);
assert.match(assessment, /1차 계열도 선택할 수 있으며/);

process.stdout.write("Stage116 smart-tag layout and family-selection tests passed.\n");
