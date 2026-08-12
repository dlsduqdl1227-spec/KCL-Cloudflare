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
assert.match(assessment, /id="kbc-auto-comment-generate"[\s\S]*AI 코멘트 생성 \/ 다시 생성/);
assert.match(assessment, /id="kbc-auto-comment-disable"[\s\S]*AI 코멘트 사용 안 함/);
assert.match(assessment, /id="kbc-auto-comment-reset"[\s\S]*AI 코멘트 생성 초기화/);
assert.match(assessment, /_kbcAutoCommentEnabled\s*=\s*false/);
assert.match(assessment, /class="btn-gen-comment comment-regenerate-btn" onclick="generateKbcComment\(\)"[\s\S]*AI 코멘트 다시 생성/);

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
const resetClient = functionSource(assessment, "resetKbcAiCommentGeneration");
assert.match(resetClient, /cancelKbcCommentGeneration_/);
assert.match(resetClient, /current\s*===\s*generated/);
assert.match(resetClient, /_kbcGeneratedComment\s*=\s*''/);
assert.match(resetClient, /kclSaveActiveEvalDraftNow_/);
assert.doesNotMatch(resetClient, /_kbcTags\s*=|_kbcYN\s*=|kbcScoreValue_\(|KBC_(?:SERVICE|ESPRESSO|SIGNATURE_SENSORY|MACHINE)\s*=/);
assert.match(generateClient, /requestToken/);
assert.match(generateClient, /_kbcCommentGenerationTimer/);
assert.match(generateClient, /requestToken\s*!==\s*_kbcCommentGenerationToken/);

const reviewPayload = functionSource(assessment, "reviewBuildKbcCommentPayload_");
assert.match(reviewPayload, /evaluatedItems/);
assert.match(reviewPayload, /comment:reviewCommentAttrText_/);
const reviewReference = functionSource(assessment, "reviewCommentReferenceHtml_");
assert.match(reviewReference, /data-review-kbc-comment-reference/);
assert.match(reviewReference, /현재 검수 화면에서 수정한 점수·스마트태그·항목별 코멘트/);
const reviewCard = functionSource(assessment, "ensureReviewOverallCard_");
assert.match(reviewCard, /AI 코멘트 생성 \/ 다시 생성/);
assert.match(reviewCard, /AI 코멘트 생성 초기화/);
assert.match(reviewCard, /resetReviewAiCommentGeneration/);
assert.match(reviewCard, /review-kbc-comment-reference/);
const reviewGenerate = functionSource(assessment, "generateReviewOverallComment");
assert.match(reviewGenerate, /refreshReviewKbcCommentReference_/);
assert.match(reviewGenerate, /AI 코멘트 다시 생성/);
assert.match(reviewGenerate, /runner\.generateKbcComment\(payload\)/);
assert.match(reviewGenerate, /requestToken/);
assert.match(reviewGenerate, /reviewCommentGenerationKey_/);
const reviewReset = functionSource(assessment, "resetReviewAiCommentGeneration");
assert.match(reviewReset, /current\s*===\s*generated/);
assert.match(reviewReset, /delete _reviewGeneratedComments/);
assert.match(reviewReset, /scheduleReviewAutoSave\(true\)/);
assert.doesNotMatch(reviewReset, /reviewSetFieldValueByIndex_\([^,]+,\s*(?:score|tags)|_reviewState\.current\s*=/);
assert.match(functionSource(assessment, "useReviewGeneratedComment"), /_reviewGeneratedComments\[reviewCommentGenerationKey_/);
assert.match(functionSource(assessment, "scheduleReviewAutoSave"), /refreshReviewKbcCommentReference_/);

const generateServer = functionSource(rpc, "generateKbcComment");
assert.match(generateServer, /payload\.evaluatedItems/);
assert.match(generateServer, /sourceItems\.map/);
assert.match(generateServer, /item\.tags\.length/);
assert.match(generateServer, /item\.comment/);
assert.match(generateServer, /sectionText/);
assert.match(generateServer, /timePenalty/);
assert.match(generateServer, /function impressionText/);
assert.match(generateServer, /안정적인 인상/);
assert.match(generateServer, /심사에서 느껴진 내용을 간단히/);
assert.doesNotMatch(generateServer, /우선적인 개선|연습이 필요|재정비|핵심 보완 지점|높아질 수 있습니다/);
assert.doesNotMatch(generateServer, /항목 합계.*최종.*점으로 기록/s);
assert.match(generateServer, /_sensoryOptionSet_/);

assert.match(functionSource(assessment, "kbcSubmit"), /'종합코멘트 사용여부':\s*_kbcAutoCommentEnabled/);

process.stdout.write("Stage165 KBC overall-comment workflow tests passed.\n");
