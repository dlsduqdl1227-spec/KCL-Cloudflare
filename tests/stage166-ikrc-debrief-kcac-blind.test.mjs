import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const debriefing = fs.readFileSync(path.join(root, "public", "debriefing", "index.html"), "utf8");
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

const commentBox = functionSource(debriefing, "buildCommentBox");
assert.match(commentBox, /comp === 'IKRC' && hasSmartTags/, "IKRC 스마트태그가 있으면 표시용 종합 코멘트를 보완해야 합니다");
assert.match(commentBox, /buildProfessionalOverallComment_/, "IKRC 디브리핑 보완 문장은 기존 평가 근거에서 생성해야 합니다");

assert.match(functionSource(rpc, "actorCanSeeParticipantIdentity_"), /code\)\.toUpperCase\(\) === 'KCAC'[\s\S]*?hasAdmin\(actor\)/, "KCAC 선수 신원은 관리자만 확인해야 합니다");
assert.match(functionSource(rpc, "getReviewList"), /code === 'KCAC' && !hasAdmin\(auth\.actor\)/, "KCAC 검수 응답도 비관리자 신원을 제거해야 합니다");
assert.match(functionSource(rpc, "getRanking"), /redactKcacIdentityForActor_/, "KCAC 순위 응답도 비관리자 신원을 제거해야 합니다");
assert.match(functionSource(assessment, "syncKcacRoundParticipantUi_"), /identityHidden = !isAdminRole\(\)/, "KCAC 평가 입력 화면의 이름은 관리자 외에는 숨겨야 합니다");
assert.match(functionSource(assessment, "kcacSubmitAll"), /!isQualSubmission && isAdminRole\(\)/, "KCAC 비관리자 제출에는 선수명을 포함하면 안 됩니다");

const liveSync = functionSource(assessment, "refreshRegistryLiveState_");
assert.doesNotMatch(liveSync, /관리자가 변경한 최신 선수 명단을 반영했습니다/, "선수명단 자동 동기화 알림을 반복 표시하면 안 됩니다");
assert.match(liveSync, /applyLiveParticipantAssignments_/, "알림 제거 후에도 선수명단 실시간 동기화는 유지해야 합니다");

process.stdout.write("Stage166 IKRC debrief fallback, KCAC blind identity, and quiet roster sync tests passed.\n");
