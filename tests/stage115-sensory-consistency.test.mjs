import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { onRequestPost } from "../functions/api/rpc.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const kcrTagsSource = fs.readFileSync(path.join(root, "public", "assets", "kcr-sensory-tags.js"), "utf8");
const sharedTagsSource = fs.readFileSync(path.join(root, "public", "assets", "shared-sensory-tags.js"), "utf8");

const tagContext = {};
vm.createContext(tagContext);
vm.runInContext(kcrTagsSource, tagContext, { filename: "kcr-sensory-tags.js" });
vm.runInContext(sharedTagsSource, tagContext, { filename: "shared-sensory-tags.js" });
const shared = tagContext.KCL_SENSORY_SMART_TAGS;

function leaves(value, out = []) {
  if (Array.isArray(value)) value.forEach((item) => out.push(String(item)));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => leaves(item, out));
  return out;
}

assert.ok(Object.keys(shared.flavor["향미 계열"]).length >= 10);
assert.ok(leaves(shared.flavor).includes("재스민"));
assert.ok(leaves(shared.flavor).includes("다크초콜릿"));
assert.ok(leaves(shared.mouthfeel).includes("매끄러운"));
assert.ok(leaves(shared.mouthfeel).includes("수렴감 있는"));
assert.ok(leaves(shared.cleanCup).includes("후미가 깔끔한"));
assert.ok(leaves(shared.balance).includes("향미가 충돌함"));

const ikrcAcidity = leaves(shared.ikrcAcidity);
assert.deepEqual(
  Array.from(ikrcAcidity),
  ["선명한", "부드러운", "과즙감 있는", "밝은", "강렬한", "산뜻한", "섬세한", "평평한", "신맛이 도드라진", "거친"],
);
assert.ok(ikrcAcidity.every((tag) => !/[A-Za-z]/.test(tag)));

assert.match(assessment, /'Espresso Taste & Design':KCL_SENSORY_SMART_TAGS\.tasteDesign/);
assert.match(assessment, /'Signature Mouthfeel':KCL_SENSORY_SMART_TAGS\.mouthfeel/);
assert.match(assessment, /'Balance':KCL_SENSORY_SMART_TAGS\.balance/);
assert.match(assessment, /'Creative Balance':KCL_SENSORY_SMART_TAGS\.balance/);
assert.match(assessment, /'맛균형': KCL_SENSORY_SMART_TAGS\.milkTasteBalance/);
assert.match(assessment, /'질감': KCL_SENSORY_SMART_TAGS\.mouthfeel/);
assert.match(assessment, /'프레젠': \{\s*'긍정'/);
assert.match(assessment, /service:\{\s*'Service Professionalism':\{/);
assert.match(assessment, /technical:\{\s*'Pre-Service Station':\{/);

assert.doesNotMatch(assessment, /kcac-smooth-(?:score|track|fill|thumb)/);
assert.match(assessment, /function buildKcacScoreSlider_[\s\S]*class="score-slider"/);
assert.match(assessment, /smartTagPolarity:\s*kcacSmartTagPolarityPayload_\(j\)/);
assert.match(assessment, /smartTagPolarity:\s*kcacSmartTagPolarityFromPayload_\(type, smartTags\)/);

async function rpc(action, payload) {
  const statement = {
    bind() { return this; },
    async run() { return { success: true }; },
    async first() { return { n: 1 }; },
    async all() { return { results: [] }; },
  };
  const request = new Request("https://qa.kcl.local/api/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://qa.kcl.local" },
    body: JSON.stringify({ action, args: [payload] }),
  });
  const response = await onRequestPost({ request, env: { DB: { prepare() { return statement; } } } });
  assert.equal(response.status, 200);
  return response.json();
}

const negativeComment = await rpc("generateKcacComment", {
  label: "예선 테스트 잔",
  type: "qual",
  patternType: "SLOW Rosetta",
  scores: { 완성도: 2.2, 균형: 1.8, 표면: 2.0, 위치: 2.2, 선명도: 1.6 },
  smartTags: {
    "Pattern Symmetry & Balance(대칭과 균형)": ["좌우 비대칭 확인", "흐름 단절"],
    "Surface Quality(표면 품질)": ["광택 저하", "라인 번짐 확인"],
  },
  smartTagPolarity: {
    positive: [],
    refinement: ["대칭과 균형: 좌우 비대칭 확인", "대칭과 균형: 흐름 단절", "표면 품질: 광택 저하", "표면 품질: 라인 번짐 확인"],
    custom: [],
  },
});
assert.equal(negativeComment.success, true);
assert.equal(negativeComment.comments.length, 3);
negativeComment.comments.forEach((comment) => {
  assert.match(comment, /보완|개선|낮게 평가|긍정적으로만 해석하지 않았습니다/);
  assert.doesNotMatch(comment, /기준을 충족하는|안정적인 결과|완성도 높은 결과/);
});

const lowScorePositiveTagComment = await rpc("generateKcacComment", {
  label: "낮은 점수 테스트 잔",
  type: "final-sensory",
  scores: { 맛균형: 1.6, 질감: 1.8 },
  smartTagPolarity: { positive: ["맛의 균형: 커피와 우유의 조화"], refinement: [], custom: [] },
});
lowScorePositiveTagComment.comments.forEach((comment) => {
  assert.doesNotMatch(comment, /기준을 충족하는|안정적인 결과|완성도 높은 결과/);
});

process.stdout.write("Stage115 sensory consistency tests passed.\n");
