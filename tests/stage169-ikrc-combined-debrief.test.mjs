import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const debriefing = fs.readFileSync(path.join(root, "public", "debriefing", "index.html"), "utf8");

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

assert.match(functionSource(debriefing, "renderResult"), /buildIkrcCombinedCommentBox_\(round, list\)/, "IKRC round must render one combined judge comment before individual cards");
assert.match(debriefing, /className = 'comment-box ikrc-combined-comment'/, "combined comment must use a dedicated public debrief card");
assert.match(debriefing, /점수·스마트태그·수기 코멘트를 함께 반영/, "combined comment must disclose the evidence used");

const context = {
  isSmartTagLabel: (label) => /스마트\s*태그|Smart\s*Tags?/i.test(String(label || "")),
  isCommentLabel: (label) => /코멘트|Comment/i.test(String(label || "")),
  splitPublicTokens_: (raw) => String(raw == null ? "" : raw).split(/[,;\n/]+/).map((x) => x.trim()).filter(Boolean),
  normalizePublicTag_: (tag) => String(tag == null ? "" : tag).trim().replace(/\s+/g, " "),
  cleanupPublicCommentText_: (_label, raw) => String(raw == null ? "" : raw).trim(),
  firstFilledScoreValue: (item, keys) => {
    for (const key of keys) if (item[key] != null && String(item[key]) !== "") return item[key];
    return "";
  },
  joinNatural_: (items, fallback) => {
    const values = [...new Set((items || []).filter(Boolean))];
    if (!values.length) return fallback || "";
    if (values.length === 1) return values[0];
    if (values.length === 2) return `${values[0]}와 ${values[1]}`;
    return `${values.slice(0, -1).join(", ")}, 그리고 ${values.at(-1)}`;
  }
};
vm.createContext(context);
[
  "ikrcAggregateJudgeCount_",
  "ikrcAggregateTags_",
  "ikrcAggregateScore_",
  "ikrcLooksGeneratedComment_",
  "ikrcCommentExcerpt_",
  "ikrcManualCommentExcerpts_",
  "buildIkrcCombinedCommentText_"
].forEach((name) => vm.runInContext(functionSource(debriefing, name), context));

const rows = [
  {
    "심사위원명": "헤드",
    "Flavor(플레이버) ×3": "7.8",
    "Clean Cup(클린컵) ×2": "7.0",
    "Flavor 스마트태그": "오렌지, 캐러멜",
    "Acidity 스마트태그": "브라이트",
    "종합코멘트": "오렌지의 산미와 단맛이 자연스럽게 이어졌습니다."
  },
  {
    "심사위원명": "센서리1",
    "Flavor(플레이버) ×3": "7.4",
    "Clean Cup(클린컵) ×2": "6.8",
    "Flavor 스마트태그": "오렌지, 베리",
    "Mouthfeel 스마트태그": "실키한"
  },
  {
    "심사위원명": "센서리2",
    "Flavor(플레이버) ×3": "7.2",
    "Clean Cup(클린컵) ×2": "6.6",
    "Flavor 스마트태그": "오렌지, 캐러멜",
    "종합코멘트": "플레이버에서 오렌지가 느껴졌습니다. 클린컵에서 선명한 인상이었습니다."
  },
  {
    "심사위원명": "센서리3",
    "Flavor(플레이버) ×3": "7.0",
    "Clean Cup(클린컵) ×2": "6.4",
    "Flavor 스마트태그": "코코아",
    "종합코멘트": "달콤한 여운이 남았습니다."
  }
];
const before = JSON.stringify(rows);
const combined = context.buildIkrcCombinedCommentText_(rows);
assert.match(combined, /심사위원 4명/, "all judges for the player must be represented once");
assert.match(combined, /주요 향미로 오렌지/, "the most repeated smart tag must lead the combined sensory description");
assert.match(combined, /오렌지의 산미와 단맛/, "manual sensory comments must be retained as evidence");
assert.doesNotMatch(combined, /플레이버에서 오렌지가 느껴졌습니다/, "standard generated boilerplate must not be repeated as a manual note");
assert.equal(JSON.stringify(rows), before, "building the public combined comment must never mutate stored evaluation rows");

process.stdout.write("Stage169 IKRC combined debrief comment tests passed.\n");
