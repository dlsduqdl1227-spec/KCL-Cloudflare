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

const sample = {
  flavor: 7.4,
  flavorIntensity: 6,
  selectedTagsFlavor: ["견과·코코아 > 아몬드", "베리 > 블루베리"],
  cleanCup: 6.2,
  cleanCupIntensity: 3,
  selectedTagsCleanCup: [],
  generatedComment: "자동 생성 문장",
  comment: "자동 생성 문장",
  commentEdited: false,
};
const attrs = [
  { name: "Flavor(플레이버)", key: "flavor", weight: 3 },
  { name: "Clean Cup(클린컵)", key: "cleanCup", weight: 2 },
];
const renderContext = {
  IKRC_ATTRS: attrs,
  ikrcTagKey_: (key) => `selectedTags${key[0].toUpperCase()}${key.slice(1)}`,
  ikrcIntensityKey_: (key) => `${key}Intensity`,
  ikrcIntensityLabel_: (value) => ({ 3: "약함", 6: "강함" }[value] || "보통"),
  ikrcGetMeaning: (score) => score >= 7 ? "양호" : "안정적",
  smartTagLeaf_: (tag) => String(tag).split(">").at(-1).trim(),
  fmtScore: (value) => Number(value).toFixed(1),
  calcIkrcSampleTotal_: (value) => attrs.reduce((sum, attr) => sum + Number(value[attr.key] || 0) * attr.weight, 0),
  escHtml: (value) => String(value ?? ""),
};
vm.createContext(renderContext);
vm.runInContext(functionSource(assessment, "buildIkrcManualCommentReferenceHtml_"), renderContext);
const html = renderContext.buildIkrcManualCommentReferenceHtml_(sample);
assert.match(html, /AI 코멘트를 사용하지 않아도/);
assert.match(html, /7\.4점 \(양호\)/);
assert.match(html, /강도 강함/);
assert.match(html, /아몬드, 블루베리/);
assert.match(html, /선택 표현 없음/);
assert.match(html, /data-ikrc-comment-reference="true"/);

assert.match(assessment, /id="ikrc-ai-comment-generate"[\s\S]*AI 코멘트 생성 \/ 다시 생성/);
assert.match(assessment, /id="ikrc-ai-comment-reset"[\s\S]*AI 코멘트 생성 초기화/);
const generateIkrc = functionSource(assessment, "generateIkrcComment");
assert.match(generateIkrc, /requestToken/);
assert.match(generateIkrc, /_ikrcCommentGenerationTimer/);
assert.match(generateIkrc, /AI 코멘트 다시 생성/);
assert.match(generateIkrc, /resetIkrcAiCommentGeneration/);
const resetIkrc = functionSource(assessment, "resetIkrcAiCommentGeneration");
assert.match(resetIkrc, /current\s*===\s*generated/);
assert.match(resetIkrc, /s\.generatedComment\s*=\s*''/);
assert.match(resetIkrc, /kclSaveActiveEvalDraftNow_/);
assert.doesNotMatch(resetIkrc, /s\.(?:flavor|cleanCup|sweetness|acidity|mouthfeel)\s*=/);
const reviewCard = functionSource(assessment, "ensureReviewOverallCard_");
assert.match(reviewCard, /currentCode === 'KBC' \|\| currentCode === 'IKRC'/);
assert.match(reviewCard, /resetReviewAiCommentGeneration/);

let cardRenderCount = 0;
const clearContext = {
  _ikrcSamples: [sample],
  _ikrcIdx: 0,
  document: { getElementById: (id) => id === "ikrc-comment" ? { value: "자동 생성 문장" } : null },
  renderIkrcAttrCard: () => { cardRenderCount += 1; },
  renderIkrcAttrTabs: () => {},
  renderIkrcNav: () => {},
  cancelIkrcCommentGeneration_: () => {},
  toast: () => {},
};
vm.createContext(clearContext);
vm.runInContext(functionSource(assessment, "clearIkrcGeneratedComment"), clearContext);
clearContext.clearIkrcGeneratedComment();
assert.equal(sample.generatedComment, "");
assert.equal(sample.comment, "");
assert.equal(sample.flavor, 7.4, "score must remain selected");
assert.equal(sample.flavorIntensity, 6, "intensity must remain selected");
assert.deepEqual(sample.selectedTagsFlavor, ["견과·코코아 > 아몬드", "베리 > 블루베리"], "smart tags must remain selected");
assert.equal(cardRenderCount, 1, "comment card must rerender so the retained reference stays visible");

process.stdout.write("Stage126 IKRC manual-comment reference tests passed.\n");
