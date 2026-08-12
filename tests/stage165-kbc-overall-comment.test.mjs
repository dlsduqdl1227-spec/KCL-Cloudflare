import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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

assert.match(assessment, /id="kbc-comment-reference"/);
assert.match(assessment, /id="kbc-auto-comment-generate"[\s\S]*AI 자동 코멘트 생성/);
assert.match(assessment, /id="kbc-auto-comment-disable"[\s\S]*AI 코멘트 사용 안 함/);
assert.match(assessment, /_kbcAutoCommentEnabled\s*=\s*false/);

const tagSection = functionSource(assessment, "renderKbcInlineTagSection_");
assert.doesNotMatch(tagSection, /custom-tag-row|직접 입력|addKbcInlineCustomTag/);
assert.doesNotMatch(assessment, /function addKbcInlineCustomTag\(/);

const evidence = functionSource(assessment, "kbcCommentEvidenceItems_");
assert.match(evidence, /kbcVisibleItems_\(\)\.map/);
assert.match(evidence, /rating:kbcGetDesc\(score\)/);
assert.match(evidence, /weightedScore:roundTotal/);
assert.match(evidence, /tags:kbcCategoryTags_/);
assert.match(evidence, /comment:kbcCommentValue_/);

const reference = functionSource(assessment, "buildKbcCommentReferenceHtml_");
assert.match(reference, /점수|평가한 모든 항목/);
assert.match(reference, /선택 스마트태그/);
assert.match(reference, /직접 코멘트/);
assert.match(reference, /시간감점/);
assert.match(reference, /반영 총점/);

const generateClient = functionSource(assessment, "generateKbcComment");
assert.match(generateClient, /evaluatedItems:\s*kbcCommentEvidenceItems_\(\)/);
assert.match(generateClient, /_kbcAutoCommentEnabled\s*=\s*true/);
const clearClient = functionSource(assessment, "clearKbcGeneratedComment");
assert.match(clearClient, /_kbcAutoCommentEnabled\s*=\s*false/);
assert.match(clearClient, /_kbcGeneratedComment\s*=\s*''/);

const reviewPayload = functionSource(assessment, "reviewBuildKbcCommentPayload_");
assert.match(reviewPayload, /evaluatedItems/);
assert.match(reviewPayload, /comment:reviewCommentAttrText_/);

const generateServer = functionSource(rpc, "generateKbcComment");
assert.match(generateServer, /payload\.evaluatedItems/);
assert.match(generateServer, /sourceItems\.map/);
assert.match(generateServer, /item\.tags\.length/);
assert.match(generateServer, /item\.comment/);
assert.match(generateServer, /sectionText/);
assert.match(generateServer, /timePenalty/);
assert.match(generateServer, /_sensoryOptionSet_/);

assert.match(functionSource(assessment, "kbcSubmit"), /'종합코멘트 사용여부':\s*_kbcAutoCommentEnabled/);

process.stdout.write("Stage165 KBC overall-comment workflow tests passed.\n");
