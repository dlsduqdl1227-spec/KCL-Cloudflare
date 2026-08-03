import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/rpc.js";

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

const generatedPairs = [];
for (let index = 1; index <= 30; index += 1) {
  const judgeName = `QA 심사위원 ${index}`;
  const result = await rpc("generateMobComment", {
    judgeName,
    variationSeed: `${judgeName}|MOB|101|브루잉`,
    menu: "브루잉",
    techVals: [3.4, 3.6, 3.2],
    sensVals: [3.8, 3.4, 3.6, 3.2, 3.4, 3.6],
    sigVals: [],
    totalScore: 31.2,
    tags: { brewing: { Flavor: ["견과·코코아 계열"], Balance: ["균형 잡힌"] } },
    attributeComments: "전체적으로 단맛과 견과류 향미가 연결됨",
  });
  assert.equal(result.success, true);
  assert.equal(result.comments.length, 2, "자동 코멘트 예시는 정확히 2개여야 합니다.");
  assert.notEqual(result.comments[0], result.comments[1]);
  generatedPairs.push(result.comments.join("\n---\n"));
}

const uniquePairCount = new Set(generatedPairs).size;
assert.ok(uniquePairCount >= 18, `30명 심사에서 코멘트 문장 구성의 반복이 과도합니다: ${uniquePairCount}종`);

const lowResult = await rpc("generateMobComment", {
  judgeName: "QA 낮은 점수",
  variationSeed: "QA 낮은 점수|MOB|102|브루잉",
  menu: "브루잉",
  techVals: [1.2, 1.4, 1.6],
  sensVals: [1.2, 1.4, 1.6, 1.2, 1.4, 1.6],
  sigVals: [],
  totalScore: 12.6,
  tags: { brewing: { Flavor: ["불명확"], Balance: ["불균형"] } },
  attributeComments: "전체 향미 구조의 보완이 필요함",
});
assert.equal(lowResult.comments.length, 2);
assert.match(lowResult.comments.join(" "), /개선이 필요한|낮은|보완/);
assert.doesNotMatch(lowResult.comments.join(" "), /매우 선명하고 완성도 높은|뚜렷하고 안정적인/);

process.stdout.write("Stage121 comment variation tests passed.\n");
