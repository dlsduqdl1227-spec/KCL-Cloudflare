import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = fs.readFileSync(path.join(root, "public", "registry", "index.html"), "utf8");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} function not found`);
  const open = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} function incomplete`);
}

// 선수 기본정보와 공통 일정은 하나의 작업 카드에서 관리한다.
assert.match(registry, /class="card player-workspace-card"/);
assert.match(registry, /선수·일정 관리/);
assert.match(registry, /id="scheduleBuilder"/);
assert.match(registry, /예외 일정 직접 입력/);
assert.match(registry, /선택 선수 일정 적용·변경/);

// 기본 화면에는 준비시간과 시연·로스팅시간만 두고 과거 필드는 숨겨 보존한다.
for (const id of ["scheduleDay", "scheduleWaiting", "scheduleCleanup", "mDay", "mWaiting", "mCleanup"]) {
  assert.match(registry, new RegExp(`id=["']${id}["'][^>]*type=["']hidden["']|type=["']hidden["'][^>]*id=["']${id}["']`));
}
assert.match(registry, /id="schedulePrep"/);
assert.match(registry, /id="schedulePerformance"/);
assert.match(functionSource(registry, "scheduleTimesText_"), /\['준비'/);
assert.doesNotMatch(functionSource(registry, "scheduleTimesText_"), /\['대기'|\['정리'/);

// IKRC 로스팅 위치는 선수 일정 정보일 뿐 센서리 평가 스테이션을 덮지 않는다.
assert.match(registry, /IKRC의 운영 위치는 로스팅 일정 참고용/);
const assignSource = functionSource(rpc, "assignRegistrySchedule");
assert.match(assignSource, /teamGroupOverride:context\.code === 'IKRC' \? ''/);
assert.match(assignSource, /extra\['로스팅위치'\] = schedule\.station/);
assert.match(assignSource, /else extra\['스테이션번호'\] = schedule\.station/);
assert.doesNotMatch(assignSource, /extra\['대기시간'\] = schedule/);
assert.doesNotMatch(assignSource, /extra\['정리시간'\] = schedule/);
assert.doesNotMatch(assignSource, /extra\['운영일차'\] = schedule/);

const participantPayloadSource = functionSource(rpc, "participantPayloadFromRow_");
assert.match(participantPayloadSource, /code === 'IKRC' \? '로스팅위치' : '스테이션번호'/);
assert.match(functionSource(rpc, "participantRowOut_"), /r\.competition_code === 'IKRC'/);

// 공식 IKRC 제출 스테이션은 운영팀장이 만든 평가 스테이션 선택값만 사용한다.
const ikrcSubmitSource = functionSource(assessment, "ikrcSubmitAll");
assert.match(ikrcSubmitSource, /stationId: _ikrcStation\.id/);
assert.match(ikrcSubmitSource, /stationLabel: _ikrcStation\.label/);
assert.doesNotMatch(ikrcSubmitSource, /participant.*station|stationNo/i);

process.stdout.write("Stage162 IKRC roasting schedule separation and efficient registry workflow tests passed.\n");
