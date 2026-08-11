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
  let depth = 0;
  let quote = "";
  let escaped = false;
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

// IKRC 메인 진입 순서는 요청한 네 단계와 같아야 한다.
const stationButton = assessment.indexOf('id="btn-calibration-station"');
const evalButton = assessment.indexOf('id="btn-eval"');
const reviewButton = assessment.indexOf('id="btn-review"');
const resultButton = assessment.indexOf('id="btn-calibration"');
assert.ok(stationButton >= 0 && stationButton < evalButton);
assert.ok(evalButton < reviewButton);
assert.ok(reviewButton < resultButton);
assert.match(assessment.slice(stationButton, evalButton), />전체 켈리브레이션</);
assert.match(assessment.slice(evalButton, reviewButton), />대회평가시작</);
assert.match(assessment.slice(reviewButton, resultButton), />내평가검수</);
assert.match(assessment.slice(resultButton, resultButton + 240), />심사 켈리브레이션</);

// 표시 명칭만 바뀌고, 서버가 순위에서 제외하는 기존 station calibration 모드는 유지한다.
const purposeContext = {_selComp:{code:"IKRC"}};
vm.createContext(purposeContext);
vm.runInContext([
  "var _evaluationPurpose={type:'competition',scope:'',label:'대회평가'};",
  functionSource(assessment, "setEvaluationPurpose_"),
  functionSource(assessment, "isActiveCalibrationMode_"),
  functionSource(assessment, "evaluationPurposeLabel_"),
  functionSource(assessment, "evaluationPurposeDisplayLabel_"),
  functionSource(assessment, "evaluationModeValue_"),
].join("\n"), purposeContext);
purposeContext.setEvaluationPurpose_("calibration", "station");
assert.equal(purposeContext.evaluationPurposeDisplayLabel_(), "전체 켈리브레이션");
assert.equal(purposeContext.evaluationModeValue_("judge"), "IKRC 스테이션 켈리브레이션");

const stationContext = {};
vm.createContext(stationContext);
vm.runInContext([
  functionSource(assessment, "ikrcStationId_"),
  functionSource(assessment, "ikrcNextStationId_"),
  functionSource(assessment, "ikrcRepairDuplicateStationIds_"),
].join("\n"), stationContext);

const existingRows = [
  {dataset:{stationId:"station1", stationLabel:"A조"}},
  {dataset:{stationId:"station2", stationLabel:"B조"}},
];
const stationContainer = {querySelectorAll:()=>existingRows};
assert.equal(stationContext.ikrcNextStationId_(stationContainer), "station3", "새 ID는 보이는 이름이 아닌 실제 기존 ID 다음 번호여야 합니다");

const duplicateRows = [
  {dataset:{stationId:"station1"}},
  {dataset:{stationId:"station1"}},
  {dataset:{stationId:"station2"}},
];
assert.equal(stationContext.ikrcRepairDuplicateStationIds_(duplicateRows), true);
assert.deepEqual(duplicateRows.map(row => row.dataset.stationId), ["station1", "station3", "station2"]);
const payloadSource = functionSource(assessment, "configSelectableOptionsPayload_");
assert.match(payloadSource, /ikrcRepairDuplicateStationIds_\(rows\)/);
assert.match(payloadSource, /ikrcRepairDuplicateStationIds_\(kcrRows\)/);

function blindSelect(unit, value, optionValues = []) {
  return {
    value,
    options: optionValues.map(optionValue => ({value:optionValue, disabled:false})),
    getAttribute(name) { return name === "data-ikrc-blind-unit" ? unit : ""; },
  };
}

let blindSelects = [];
const blindContext = {document:{querySelectorAll:()=>blindSelects}};
vm.createContext(blindContext);
vm.runInContext([
  functionSource(assessment, "ikrcSyncBlindParticipantOptions_"),
  functionSource(assessment, "ikrcValidateBlindAssignmentSelections_"),
].join("\n"), blindContext);

blindSelects = [blindSelect("A-1", "11"), blindSelect("A-2", "11")];
assert.equal(blindContext.ikrcValidateBlindAssignmentSelections_().ok, false, "한 선수를 두 코드에 연결하면 저장을 막아야 합니다");
blindSelects = [blindSelect("A-1", "11"), blindSelect("A-1", "12")];
assert.equal(blindContext.ikrcValidateBlindAssignmentSelections_().ok, false, "같은 선수코드 행이 중복되어도 저장을 막아야 합니다");
blindSelects = [blindSelect("A-1", "11"), blindSelect("A-2", "12")];
assert.equal(blindContext.ikrcValidateBlindAssignmentSelections_().ok, true);

const firstSelect = blindSelect("A-1", "11", ["", "11", "12"]);
const secondSelect = blindSelect("A-2", "", ["", "11", "12"]);
blindSelects = [firstSelect, secondSelect];
blindContext.ikrcSyncBlindParticipantOptions_();
assert.equal(secondSelect.options.find(option => option.value === "11").disabled, true, "이미 연결한 선수는 다른 코드 선택지에서 비활성화해야 합니다");
assert.equal(firstSelect.options.find(option => option.value === "11").disabled, false, "현재 행의 선택은 유지되어야 합니다");

const saveAssignmentsSource = functionSource(assessment, "saveIkrcBlindAssignments_");
assert.match(saveAssignmentsSource, /ikrcValidateBlindAssignmentSelections_\(\)/);
const serverSaveSource = functionSource(rpc, "saveIkrcBlindAssignments");
assert.match(serverSaveSource, /byId\.has\(participantId\)/);
assert.match(serverSaveSource, /usedUnits\.has\(unit\)/);

// 운영자와 팀장 화면에서도 동일한 명칭·순서를 쓰며, 기능이 다른 KCR 버튼은 구분한다.
const adminCardsSource = functionSource(assessment, "adminRenderRunCards_");
assert.match(adminCardsSource, /workflowBefore = '<button data-act="ikrc-cal-input">전체 켈리브레이션<\/button>'/);
assert.match(adminCardsSource, /workflowAfter = '<button data-act="ikrc-cal">심사 켈리브레이션<\/button>'/);
const adminWorkflowAssembly = [
  "workflowBefore +",
  "data-act=\"eval\">대회평가시작",
  "data-act=\"review\">평가 검수/수정",
  "workflowAfter +",
];
for (let i = 1; i < adminWorkflowAssembly.length; i += 1) {
  assert.ok(adminCardsSource.indexOf(adminWorkflowAssembly[i - 1]) < adminCardsSource.indexOf(adminWorkflowAssembly[i]));
}
const teamPanelSource = functionSource(assessment, "loadTeamPanel");
assert.match(teamPanelSource, /전체 켈리브레이션/);
assert.match(teamPanelSource, /대회평가시작/);
assert.match(teamPanelSource, /내평가검수/);
assert.match(teamPanelSource, /심사 켈리브레이션/);
assert.match(teamPanelSource, /스테이션 켈리브레이션/);
assert.match(teamPanelSource, /MOB 심사 켈리브레이션/);

process.stdout.write("Stage160 IKRC workflow naming, station identity, and blind assignment tests passed.\n");
