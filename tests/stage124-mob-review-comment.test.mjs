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

const generatorSource = functionSource(assessment, "reviewCommentGeneratorCode_");
assert.doesNotMatch(generatorSource, /KCR\|KBC\|KCAC\|MOB/);

const cardSource = functionSource(assessment, "ensureReviewOverallCard_");
assert.match(cardSource, /currentCode === 'MOB'/);
assert.match(cardSource, /MOB 전체 종합 코멘트/);
assert.match(cardSource, /검수 중 수정한 내용이 최종 코멘트로 저장/);
assert.doesNotMatch(cardSource, /readonly aria-readonly="true"/);
assert.match(cardSource, /isMobManualComment \? '' : '<button/);

const wrap = {
  firstChild: null,
  card: null,
  insertBefore(card) { this.card = card; },
};
const context = {
  _reviewState: {
    code: "MOB",
    headers: ["종합코멘트"],
    current: { "종합코멘트": "향미의 연결성과 밸런스가 안정적으로 표현되었습니다." },
  },
  document: {
    getElementById(id) {
      if (id === "review-edit-fields") return wrap;
      return null;
    },
    createElement() { return {}; },
  },
  escHtml(value) { return String(value ?? ""); },
  canReviewEditDetails() { return true; },
  updateReviewOverallInsights_() { throw new Error("MOB must not render generated comment insights"); },
};
vm.createContext(context);
vm.runInContext([
  generatorSource,
  functionSource(assessment, "reviewIsOverallCommentHeader_"),
  functionSource(assessment, "reviewOverallCommentIndex_"),
  cardSource,
].join("\n"), context);
context.ensureReviewOverallCard_();
assert.ok(wrap.card, "MOB review comment card must be inserted");
assert.match(wrap.card.innerHTML, /MOB 전체 종합 코멘트/);
assert.match(wrap.card.innerHTML, /향미의 연결성과 밸런스가 안정적으로 표현되었습니다/);
assert.match(wrap.card.innerHTML, /scheduleReviewAutoSave/);
assert.doesNotMatch(wrap.card.innerHTML, /readonly|disabled/);
assert.doesNotMatch(wrap.card.innerHTML, /초안 생성/);

assert.match(functionSource(assessment, "mobSubmit"), /total, comment, mobDqInfo/);
assert.match(rpc, /else if \(code === 'MOB'\) data = \[[^\]]*'총점','종합코멘트'/s);
assert.match(assessment, /\.review-comment-center textarea\[readonly\]/);

process.stdout.write("Stage124 MOB review overall-comment tests passed.\n");
