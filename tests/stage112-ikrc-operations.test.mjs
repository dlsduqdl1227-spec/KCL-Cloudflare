import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assessment = fs.readFileSync(path.join(root, "public", "assessment", "index.html"), "utf8");
const rpc = fs.readFileSync(path.join(root, "functions", "api", "rpc.js"), "utf8");
const sharedSensoryTags = fs.readFileSync(path.join(root, "public", "assets", "shared-sensory-tags.js"), "utf8");

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} function not found`);
  const open = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
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
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} function is incomplete`);
}

const calibrationContext = {
  safeStr: (value) => String(value == null ? "" : value),
  itemJudgeIdentityKey_: (item) => String(item.judgeName || ""),
};
vm.createContext(calibrationContext);
for (const name of ["calibrationSortValue_", "calibrationJudgeIdentityKey_", "latestCalibrationRowsByJudge_"]) {
  vm.runInContext(extractFunction(rpc, name), calibrationContext);
}
const calibrationRows = [
  { rowIndex: 1, judgeName: "헤드1", round: "예선", unit: "X-1", role: "센서리 헤드", mode: "IKRC 켈리브레이션", submittedAt: "2026-07-30T01:00:00.000Z" },
  { rowIndex: 2, judgeName: "헤드1", round: "예선", unit: "X-2", role: "센서리 헤드", mode: "IKRC 켈리브레이션", submittedAt: "2026-07-30T01:00:01.000Z" },
  { rowIndex: 3, judgeName: "헤드1", round: "예선", unit: "X-1", role: "센서리 헤드", mode: "IKRC 켈리브레이션", submittedAt: "2026-07-30T01:00:02.000Z" },
];
const latestCalibration = Array.from(calibrationContext.latestCalibrationRowsByJudge_(calibrationRows));
assert.equal(latestCalibration.length, 2, "Each station sample must remain visible for the same judge");
assert.equal(latestCalibration.find((row) => row.unit === "X-1").rowIndex, 3, "Only the same judge/sample retry may supersede an older row");
assert.ok(calibrationContext.calibrationJudgeIdentityKey_(calibrationRows[0]).includes("X-1"));

const stationContext = {
  safeStr: (value) => String(value == null ? "" : value).trim(),
};
vm.createContext(stationContext);
for (const name of ["ikrcDefaultStationPrefixServer_", "normalizeIkrcStationListServer_"]) {
  vm.runInContext(extractFunction(rpc, name), stationContext);
}
const normalizedStations = Array.from(stationContext.normalizeIkrcStationListServer_([
  { id: "station2", label: "스테이션 2", prefix: "Z", start: 1, end: 6 },
  { id: "station7", label: "스테이션 7", prefix: "X", start: 1, end: 2 },
], true).list);
assert.deepEqual(
  normalizedStations.map((station) => [station.id, station.label, station.prefix, station.start, station.end]),
  [
    ["station2", "스테이션 2", "Z", 1, 6],
    ["station7", "스테이션 7", "X", 1, 2],
  ],
  "Station IDs and labels must remain stable after deletion or reordering",
);

const updateSettingsSource = extractFunction(rpc, "updateCompetitionAdminSettings");
assert.doesNotMatch(updateSettingsSource, /평가 기록이 이미 있어 스테이션 범위를 변경할 수 없습니다/);
assert.match(updateSettingsSource, /기존 IKRC 평가 \$\{preservedIkrcScoreCount\}건은 삭제하지 않고/);
assert.match(extractFunction(rpc, "getIkrcCalibrationCupNumbers"), /normal\.concat\(heads\)/);
assert.match(extractFunction(rpc, "getIkrcCalibrationCupNumbers"), /headCount/);
assert.match(extractFunction(rpc, "getIkrcCalibrationCupNumbers"), /data\.scope\.key/);
assert.match(extractFunction(rpc, "markIkrcCalibrationChecked"), /data\.checkerKey/);
assert.match(extractFunction(rpc, "ikrcCalibrationRows_"), /scope\.scope === 'team'/);
assert.match(extractFunction(rpc, "rowToReviewItem"), /스테이션ID/);
assert.match(assessment, /커핑 기준: 11g 홀빈 \/ 200g 물 \/ 93℃ \/ 700~800µm/);
assert.match(extractFunction(assessment, "isIkrcCalibrationMode_"), /return false/);
assert.match(extractFunction(assessment, "showIkrcSetup"), /헤드 평가 점수 반영/);
assert.match(extractFunction(assessment, "setIkrcCalibrationScope_"), /'team'/);

const unifiedAcidityTags = ["선명한", "부드러운", "과즙감 있는", "밝은", "강렬한", "평평한", "산뜻한", "신맛이 도드라진", "거친", "섬세한"];
unifiedAcidityTags.forEach((tag) => assert.match(sharedSensoryTags, new RegExp(`["']${tag}["']`)));
assert.match(assessment, /acidity:\s*KCL_SENSORY_SMART_TAGS\.ikrcAcidity/);
assert.doesNotMatch(sharedSensoryTags, /["'](?:Sour|Harsh|Delicate)["']/);

assert.match(assessment, /data-station-id/);
assert.match(extractFunction(assessment, "configSelectableOptionsPayload_"), /id:stationId, label:stationLabel/);
assert.match(extractFunction(assessment, "ikrcRemoveStationConfigRow_"), /이미 제출된 점수와 백업 데이터는 삭제되지 않습니다/);

assert.match(assessment, /\/assets\/vendor\/qrcode\.min\.js\?v=stage112/);
assert.match(extractFunction(assessment, "judgeEntryUrl_"), /searchParams\.set\('competition', code\)/);
assert.match(assessment, /data-act="judge-qr"/);
assert.match(extractFunction(assessment, "renderCompList"), /requestedCompetitionCode_/);
assert.ok(fs.existsSync(path.join(root, "public", "assets", "vendor", "qrcode.min.js")));

const xlsxLoader = extractFunction(assessment, "ensureXlsxLib_");
assert.match(xlsxLoader, /\/assets\/vendor\/xlsx\.full\.min\.js\?v=stage112/);
assert.doesNotMatch(xlsxLoader, /https?:\/\//);
assert.match(extractFunction(assessment, "deliverWorkbook_"), /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
assert.match(extractFunction(assessment, "deliverBlob_"), /fileDeliveryModal/);
assert.ok(fs.existsSync(path.join(root, "public", "assets", "vendor", "xlsx.full.min.js")));

assert.equal(
  (assessment.match(/onclick="return goBackContext_\(\)"/g) || []).length,
  1,
  "이전과 뒤로가기는 공통 버튼 한 개로 제공해야 합니다.",
);
assert.doesNotMatch(assessment, /mobile-context-back/);
assert.match(extractFunction(assessment, "installBrowserBackGuard_"), /goBackContext_\(\)/);
assert.match(assessment, /등록 참여인원 수 자체에는 별도 제한이 없으며/);

process.stdout.write("Stage112 IKRC operations tests passed.\n");
