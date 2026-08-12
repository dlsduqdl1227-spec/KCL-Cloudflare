import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { onRequestPost } from "../functions/api/rpc.js";

class D1PreparedStatement {
  constructor(database, sql, params = []) {
    this.database = database;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new D1PreparedStatement(this.database, this.sql, params);
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.params) || null;
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.params) };
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: {
        changes: Number(result.changes || 0),
        last_row_id: Number(result.lastInsertRowid || 0),
      },
    };
  }

  runSync() {
    return this.database.prepare(this.sql).run(...this.params);
  }
}

class D1TestDatabase {
  constructor() {
    this.raw = new DatabaseSync(":memory:");
  }

  prepare(sql) {
    return new D1PreparedStatement(this.raw, sql);
  }

  async batch(statements) {
    this.raw.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.runSync());
      this.raw.exec("COMMIT");
      return results;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }
}

const testDb = new D1TestDatabase();
const env = {
  DB: testDb,
  KCL_ADMIN_NAME: "QA 관리자",
  KCL_ADMIN_PHONE: "01099990000",
  KCL_ADMIN_PASSWORD: "qa-password",
  KCL_ADMIN_SECRET_CODE: "5061",
  KCL_LOGIN_SECURITY_PEPPER: "qa-login-security-pepper",
};

let requestNumber = 0;
async function rpc(action, ...args) {
  requestNumber += 1;
  const request = new Request("https://qa.kcl.local/api/rpc", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://qa.kcl.local",
      "CF-Connecting-IP": `198.51.100.${(requestNumber % 200) + 1}`,
    },
    body: JSON.stringify({ action, args }),
  });
  const response = await onRequestPost({ request, env });
  assert.equal(response.status, 200, `${action} returned HTTP ${response.status}`);
  return response.json();
}

function managedActor(login) {
  return {
    judgeToken: login.judgeToken,
    name: login.name,
    phone: login.phone,
    reviewScope: "manage",
    manageReview: true,
  };
}

function station(id, label, prefix, start, end) {
  return { id, label, prefix, start, end };
}

function stationSettings(stations) {
  return {
    ikrcStations: {
      byRound: { 예선: stations, 결선: stations },
      stations,
      station1Prefix: stations[0]?.prefix || "A",
      station2Prefix: stations[1]?.prefix || "B",
    },
  };
}

function ikrcRows(prefix, start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const unit = `${prefix}-${start + index}`;
    return {
      data: [unit, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4, "QA", 20, "N", "미검수"],
      extraFields: { Total: 20 },
    };
  });
}

function ikrcPayload(login, stationInfo, mode = "judge") {
  return {
    competitionCode: "IKRC",
    judgeToken: login.judgeToken,
    judgeName: login.name,
    judgeRole: login.role,
    team: login.teamGroup || "",
    mode,
    stationId: stationInfo.id,
    stationLabel: stationInfo.label,
    stationPrefix: stationInfo.prefix,
    stationSampleCount: stationInfo.end - stationInfo.start + 1,
    rows: ikrcRows(stationInfo.prefix, stationInfo.start, stationInfo.end),
  };
}

function ikrcCalibrationPayload(login, stationInfo, scope) {
  const payload = ikrcPayload(login, stationInfo, scope === "team" ? "IKRC 팀별 켈리브레이션" : "IKRC 전체 켈리브레이션");
  payload.team = scope === "team" ? (login.teamGroup || "") : "전체 켈리브레이션팀";
  return payload;
}

function kcrStationSettings(stations) {
  return {
    kcrProcesses: { washed: true, natural: true, blending: true },
    kcrStations: { byRound: { 예선: stations, 결선: stations }, stations },
  };
}

function kcrStationPayload(login, stationInfo, scores, mode = "judge") {
  const rows = Array.from({ length: stationInfo.end - stationInfo.start + 1 }, (_, index) => {
    const unit = String(stationInfo.start + index);
    const score = scores[index] ?? scores[0] ?? 70;
    return { data: [unit, mode.includes("켈리브레이션") ? "켈리브레이션" : stationInfo.process], extraFields: { Total: score } };
  });
  return {
    competitionCode: "KCR",
    judgeToken: login.judgeToken,
    judgeName: login.name,
    judgeRole: login.role,
    team: login.teamGroup || "",
    mode,
    stationId: stationInfo.id,
    stationLabel: stationInfo.label,
    stationPrefix: stationInfo.prefix,
    stationProcess: stationInfo.process,
    stationSampleCount: rows.length,
    rows,
  };
}

function genericPayload(login, code, unit, score, rows = null) {
  return {
    competitionCode: code,
    judgeToken: login.judgeToken,
    judgeName: login.name,
    judgeRole: login.role,
    team: login.teamGroup || "",
    mode: "judge",
    totalScore: score,
    rows: rows || [{ data: [unit], extraFields: { Total: score } }],
  };
}

const ping = await rpc("ping");
assert.equal(ping.success, true);

const adminLogin = await rpc("adminLogin", "01099990000", "qa-password", "5061");
assert.equal(adminLogin.success, true, adminLogin.message);
assert.ok(adminLogin.judgeToken);
const adminActor = managedActor(adminLogin);
const adminConsole = await rpc("getAdminConsoleData", adminActor);
assert.equal(adminConsole.success, true, adminConsole.message);
assert.equal(adminConsole.configs.length, 7);
assert.equal(
  Object.prototype.hasOwnProperty.call(adminConsole, "accounts"),
  false,
  "The operations console must not duplicate registry account data or return operator phone numbers",
);

for (const operator of [
  {
    accountType: "JUDGE",
    name: "QA 센서리",
    phone: "01011110001",
    affiliation: "QA",
    access: "ALL",
    teamGroup: "스테이션 1",
    role: "센서리 심사위원",
  },
  {
    accountType: "JUDGE",
    name: "QA 센서리2",
    phone: "01011110004",
    affiliation: "QA",
    access: "ALL",
    teamGroup: "스테이션 3",
    role: "센서리 심사위원",
  },
  {
    accountType: "JUDGE",
    name: "QA 센서리Z",
    phone: "01011110007",
    affiliation: "QA",
    access: "IKRC",
    teamGroup: "스테이션 2",
    role: "센서리 심사위원",
  },
  {
    accountType: "JUDGE",
    name: "QA 센서리Z2",
    phone: "01011110010",
    affiliation: "QA",
    access: "IKRC",
    teamGroup: "스테이션 2",
    role: "센서리 심사위원",
  },
  {
    accountType: "JUDGE",
    name: "QA 센서리Z3",
    phone: "01011110011",
    affiliation: "QA",
    access: "IKRC",
    teamGroup: "스테이션 2",
    role: "센서리 심사위원",
  },
  {
    accountType: "JUDGE",
    name: "QA 헤드",
    phone: "01011110002",
    affiliation: "QA",
    access: "IKRC",
    teamGroup: "스테이션 2",
    role: "센서리 헤드 심사위원",
  },
  {
    accountType: "JUDGE",
    name: "QA 헤드2",
    phone: "01011110005",
    affiliation: "QA",
    access: "IKRC",
    teamGroup: "스테이션 2",
    role: "센서리 헤드 심사위원",
  },
  {
    accountType: "JUDGE",
    name: "QA 배정헤드",
    phone: "01011110009",
    affiliation: "QA",
    access: "IKRC",
    teamGroup: "스테이션 1",
    role: "센서리 헤드 심사위원",
  },
  {
    accountType: "TEAMLEAD",
    name: "QA 대회팀장",
    phone: "01011110003",
    affiliation: "QA",
    access: "IKRC",
    teamGroup: "전체",
    role: "대회팀장",
  },
  {
    accountType: "TEAMLEAD",
    name: "QA 스테이션2팀장",
    phone: "01011110008",
    affiliation: "QA",
    access: "IKRC",
    teamGroup: "스테이션 2",
    role: "대회팀장",
  },
  {
    accountType: "JUDGE",
    name: "QA 날짜심사",
    phone: "01011110006",
    affiliation: "QA",
    access: "MOB",
    teamGroup: "상시조",
    role: "센서리 심사위원",
  },
  {
    accountType: "TEAMLEAD",
    name: "QA 다중권한",
    phone: "01011110012",
    affiliation: "QA",
    access: "MOC",
    teamGroup: "",
    role: "대회팀장",
  },
  {
    accountType: "JUDGE",
    name: "QA 다중권한",
    phone: "01011110012",
    affiliation: "QA",
    access: "KCR",
    teamGroup: "KCR 스테이션 1",
    role: "센서리 심사위원",
  },
]) {
  const saved = await rpc("upsertOperatorAccount", operator, adminActor);
  assert.equal(saved.success, true, saved.message);
}

const kstParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(new Date()).reduce((out, part) => ({ ...out, [part.type]:part.value }), {});
const currentKstDate = `${kstParts.year}-${kstParts.month}-${kstParts.day}`;
const datedPermission = await rpc("applyOperatorDateSchedule", {
  competitionCode: "MOB",
  entries: [{
    effectiveDate: currentKstDate,
    teamGroup: "B조",
    role: "센서리 헤드 심사위원",
    name: "QA 날짜심사",
  }],
}, adminActor);
assert.equal(datedPermission.success, true, datedPermission.message);
assert.equal(datedPermission.applied, 1);
const datedJudge = await rpc("judgeLogin", "QA 날짜심사", "01011110006");
assert.equal(datedJudge.success, true, datedJudge.message);
assert.equal(datedJudge.permissionDate, currentKstDate);
assert.equal(datedJudge.teamMap.MOB, "B조");
assert.equal(datedJudge.roleMap.MOB, "센서리 헤드 심사위원");
assert.ok(datedJudge.operatorRows.some(row => row.access === "MOB" && row.effectiveDate === currentKstDate));

const nextKstDate = new Date(Date.parse(currentKstDate + "T00:00:00.000Z") + 86400000).toISOString().slice(0, 10);
for (const participant of [
  { name:"QA MOB 현재 A", prelimCupNo:"901", uniqueNo:"MOB-CURRENT-A", competitionDate:currentKstDate, extra:{심사조:"A조", 경연순서:"1"} },
  { name:"QA MOB 현재 B", prelimCupNo:"902", uniqueNo:"MOB-CURRENT-B", competitionDate:currentKstDate, extra:{심사조:"B조", 경연순서:"2"} },
  { name:"QA MOB 다음 B", prelimCupNo:"903", uniqueNo:"MOB-NEXT-B", competitionDate:nextKstDate, extra:{심사조:"B조", 경연순서:"1"} },
]) {
  const saved = await rpc("upsertParticipant", { competitionCode:"MOB", ...participant }, adminActor);
  assert.equal(saved.success, true, saved.message);
}
const datedMobAssignments = await rpc("getParticipantAssignments", "MOB", { judgeToken:datedJudge.judgeToken });
assert.equal(datedMobAssignments.success, true, datedMobAssignments.message);
assert.deepEqual(datedMobAssignments.assignments.map(item => item.name), ["QA MOB 현재 B"], "MOB judge must only see the active date and assigned team");
assert.equal(datedMobAssignments.scheduleScope.competitionDate, currentKstDate);
assert.equal(datedMobAssignments.scheduleScope.team, "B조");
const adminMobAssignments = await rpc("getParticipantAssignments", "MOB", adminActor);
assert.equal(adminMobAssignments.assignments.length, 3, "MOB manager must retain all dates and teams");

const multiRoleJudge = await rpc("judgeLogin", "QA 다중권한", "01011110012");
assert.equal(multiRoleJudge.success, true, multiRoleJudge.message);
assert.deepEqual([...multiRoleJudge.accessCodes].sort(), ["KCR", "MOC"], "동일 심사위원의 대회 접근 권한은 모두 유지되어야 합니다");
assert.equal(multiRoleJudge.accountTypeMap.MOC, "TEAMLEAD", "MOC 팀장 권한은 MOC에만 유지되어야 합니다");
assert.equal(multiRoleJudge.roleMap.MOC, "대회팀장");
assert.equal(multiRoleJudge.accountTypeMap.KCR, "JUDGE", "KCR 심사위원 권한은 MOC 팀장 권한과 섞이면 안 됩니다");
assert.equal(multiRoleJudge.roleMap.KCR, "센서리 심사위원");
assert.equal(multiRoleJudge.teamMap.KCR, "KCR 스테이션 1");

const duplicateMobParticipant = await rpc("upsertParticipant", {
  competitionCode:"MOB", name:"QA 중복 참가자", phone:"01022228888", uniqueNo:"DUPLICATE-IDENTITY",
  prelimCupNo:"990", competitionDate:currentKstDate, extra:{심사조:"A조", 경연순서:"99"},
}, adminActor);
assert.equal(duplicateMobParticipant.success, true, duplicateMobParticipant.message);
const duplicateKcrParticipant = await rpc("upsertParticipant", {
  competitionCode:"KCR", name:"QA 중복 참가자", phone:"01022228888", uniqueNo:"DUPLICATE-IDENTITY", prelimCupNo:"990",
}, adminActor);
assert.equal(duplicateKcrParticipant.success, true, duplicateKcrParticipant.message);
assert.deepEqual(
  testDb.raw.prepare("SELECT competition_code, name, phone, prelim_cup_no FROM participants WHERE name='QA 중복 참가자' ORDER BY competition_code").all().map(row => ({ ...row })),
  [
    { competition_code:"KCR", name:"QA 중복 참가자", phone:"01022228888", prelim_cup_no:"990" },
    { competition_code:"MOB", name:"QA 중복 참가자", phone:"01022228888", prelim_cup_no:"990" },
  ],
  "동일 이름·연락처·참가번호라도 대회가 다르면 별도 참가자로 저장되어야 합니다",
);
const duplicateMobId = testDb.raw.prepare("SELECT id FROM participants WHERE competition_code='MOB' AND name='QA 중복 참가자'").get().id;
const crossCompetitionEdit = await rpc("upsertParticipant", {
  rowIndex:duplicateMobId, competitionCode:"KCR", name:"QA 중복 참가자", phone:"01022228888", uniqueNo:"DUPLICATE-IDENTITY", prelimCupNo:"990",
}, adminActor);
assert.equal(crossCompetitionEdit.success, false, "다른 대회 참가자 행을 현재 대회에서 수정할 수 없어야 합니다");
assert.match(crossCompetitionEdit.message, /각 대회에서 별도로 등록/);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM participants WHERE name='QA 중복 참가자'").get().n,
  2,
  "차단된 교차 대회 수정 이후에도 두 대회 참가자 행이 모두 보존되어야 합니다",
);
for (const participant of [
  { name:"QA 블라인드 선수1", phone:"01022229999", uniqueNo:"KCR-BLIND-01", prelimCupNo:"1" },
  { name:"QA 블라인드 선수2", phone:"01022229998", uniqueNo:"KCR-BLIND-02", prelimCupNo:"2" },
]) {
  const saved = await rpc("upsertParticipant", { competitionCode:"KCR", ...participant }, adminActor);
  assert.equal(saved.success, true, saved.message);
}
const multiRoleKcrAssignments = await rpc("getParticipantAssignments", "KCR", { judgeToken:multiRoleJudge.judgeToken });
assert.equal(multiRoleKcrAssignments.success, true, multiRoleKcrAssignments.message);
assert.equal(multiRoleKcrAssignments.assignments[0].identityHidden, true, "MOC teamlead must not unlock KCR participant identity");
assert.equal(multiRoleKcrAssignments.assignments[0].name, "");

// 관리자가 역할·팀을 수정하거나 권한 행을 삭제하면 로그인 당시 세션보다 최신 D1 값이 우선되어야 합니다.
const liveStateBeforeAdminEdit = await rpc("getRegistryLiveState", "KCR", { judgeToken:multiRoleJudge.judgeToken }, "");
assert.equal(liveStateBeforeAdminEdit.success, true, liveStateBeforeAdminEdit.message);
assert.equal(liveStateBeforeAdminEdit.participantChanged, true);
const multiRoleKcrRow = testDb.raw.prepare("SELECT * FROM operators WHERE name='QA 다중권한' AND access='KCR'").get();
const liveRoleEdit = await rpc("upsertOperatorAccount", {
  rowIndex:multiRoleKcrRow.id, accountType:"JUDGE", name:multiRoleKcrRow.name, phone:multiRoleKcrRow.phone,
  affiliation:multiRoleKcrRow.affiliation, access:"KCR", teamGroup:"KCR 스테이션 2", role:"센서리 헤드 심사위원",
}, adminActor);
assert.equal(liveRoleEdit.success, true, liveRoleEdit.message);
const liveStateAfterRoleEdit = await rpc("getRegistryLiveState", "KCR", { judgeToken:multiRoleJudge.judgeToken }, liveStateBeforeAdminEdit.revision);
assert.equal(liveStateAfterRoleEdit.success, true, liveStateAfterRoleEdit.message);
assert.notEqual(liveStateAfterRoleEdit.revision, liveStateBeforeAdminEdit.revision);
assert.equal(liveStateAfterRoleEdit.actor.roleMap.KCR, "센서리 헤드 심사위원");
assert.equal(liveStateAfterRoleEdit.actor.teamMap.KCR, "KCR 스테이션 2");
const multiRoleMocRow = testDb.raw.prepare("SELECT id FROM operators WHERE name='QA 다중권한' AND access='MOC'").get();
const removedMocRole = await rpc("deleteOperatorAccount", multiRoleMocRow.id, adminActor);
assert.equal(removedMocRole.success, true, removedMocRole.message);
const liveStateAfterRoleDelete = await rpc("getRegistryLiveState", "KCR", { judgeToken:multiRoleJudge.judgeToken }, liveStateAfterRoleEdit.revision);
assert.equal(liveStateAfterRoleDelete.success, true, liveStateAfterRoleDelete.message);
assert.deepEqual([...liveStateAfterRoleDelete.actor.accessCodes], ["KCR"]);
assert.equal(liveStateAfterRoleDelete.actor.roleMap.MOC, undefined, "삭제한 MOC 역할이 로그인 당시 역할 맵에서 되살아나면 안 됩니다");

// 선수 수정도 같은 변경 버전으로 감지되고 새 번호·이름·소속이 즉시 다시 전달되어야 합니다.
const liveParticipantRow = testDb.raw.prepare("SELECT id FROM participants WHERE competition_code='KCR' AND unique_no='KCR-BLIND-01'").get();
const liveParticipantEdit = await rpc("upsertParticipant", {
  rowIndex:liveParticipantRow.id, competitionCode:"KCR", name:"QA 블라인드 선수1 수정", phone:"01022229999",
  affiliation:"관리자 최신 소속", uniqueNo:"KCR-BLIND-01", prelimCupNo:"1",
}, adminActor);
assert.equal(liveParticipantEdit.success, true, liveParticipantEdit.message);
const liveAdminParticipants = await rpc("getRegistryLiveState", "KCR", adminActor, liveStateAfterRoleDelete.revision);
assert.equal(liveAdminParticipants.success, true, liveAdminParticipants.message);
assert.equal(liveAdminParticipants.participantChanged, true);
const refreshedParticipant = liveAdminParticipants.assignments.find(item => Number(item.rowIndex) === Number(liveParticipantRow.id));
assert.equal(refreshedParticipant.name, "QA 블라인드 선수1 수정");
assert.equal(refreshedParticipant.affiliation, "관리자 최신 소속");

const judge = await rpc("judgeLogin", "QA 센서리", "01011110001");
const judge2 = await rpc("judgeLogin", "QA 센서리2", "01011110004");
const judgeZ = await rpc("judgeLogin", "QA 센서리Z", "01011110007");
const judgeZ2 = await rpc("judgeLogin", "QA 센서리Z2", "01011110010");
const judgeZ3 = await rpc("judgeLogin", "QA 센서리Z3", "01011110011");
const head = await rpc("judgeLogin", "QA 헤드", "01011110002");
const head2 = await rpc("judgeLogin", "QA 헤드2", "01011110005");
const assignedHead = await rpc("judgeLogin", "QA 배정헤드", "01011110009");
const lead = await rpc("judgeLogin", "QA 대회팀장", "01011110003");
const stationLead = await rpc("judgeLogin", "QA 스테이션2팀장", "01011110008");
for (const login of [judge, judge2, judgeZ, judgeZ2, judgeZ3, head, head2, assignedHead, lead, stationLead]) {
  assert.equal(login.success, true, login.message);
  assert.ok(login.judgeToken);
}
const leadActor = managedActor(lead);
const stationLeadActor = managedActor(stationLead);

const station1 = station("station1", "스테이션 1", "X", 1, 2);
const station2 = station("station2", "스테이션 2", "Z", 1, 6);
const station3 = station("station3", "스테이션 3", "Y", 1, 2);
const kcrStation1 = { id:"kcr-station1", label:"스테이션 1", prefix:"KCR", start:1, end:2, process:"Washed", useForCalibration:true, useForCompetition:true, numberMode:"participant" };

const initialStationSave = await rpc(
  "updateCompetitionAdminSettings",
  {
    code: "IKRC",
    name: "IKAWA Korea Roasting Championship",
    currentRound: "예선",
    isActive: true,
    debriefing: true,
    optionSettings: stationSettings([station1, station2]),
  },
  adminActor,
);
assert.equal(initialStationSave.success, true, initialStationSave.message);

const initialKcrStationSave = await rpc(
  "updateCompetitionAdminSettings",
  {
    code: "KCR",
    name: "KCR Cupping",
    currentRound: "예선",
    isActive: true,
    debriefing: true,
    optionSettings: kcrStationSettings([kcrStation1]),
  },
  adminActor,
);
assert.equal(initialKcrStationSave.success, true, initialKcrStationSave.message);
const partialKcrPayload = kcrStationPayload(judge, kcrStation1, [70, 72]);
partialKcrPayload.rows.pop();
partialKcrPayload.stationSampleCount = 1;
const partialKcrSubmit = await rpc("submitScores", partialKcrPayload);
assert.equal(partialKcrSubmit.success, false, "KCR station submission must reject a missing participant");
assert.match(partialKcrSubmit.message, /2명이 모두 있어야/);

const participantSave = await rpc(
  "upsertParticipant",
  {
    competitionCode: "IKRC",
    name: "QA 참가자",
    phone: "01022220001",
    uniqueNo: "QA-001",
    prelimCupNo: "1",
    sampleNo: "",
  },
  adminActor,
);
assert.equal(participantSave.success, true, participantSave.message);

const ikrcX = await rpc("submitScores", ikrcPayload(judge, station1));
const ikrcZ = await rpc("submitScores", ikrcPayload(judgeZ, station2));
const ikrcZ2 = await rpc("submitScores", ikrcPayload(judgeZ2, station2));
const headOfficialPayload = ikrcPayload(head, station2);
headOfficialPayload.clientSubmissionId = "QA-IKRC-HEAD-STATION2";
const ikrcHeadZ = await rpc("submitScores", headOfficialPayload);
assert.equal(ikrcX.success, true, JSON.stringify(ikrcX));
assert.equal(ikrcZ.success, true, JSON.stringify(ikrcZ));
assert.equal(ikrcZ2.success, true, JSON.stringify(ikrcZ2));
assert.equal(ikrcHeadZ.success, true, JSON.stringify(ikrcHeadZ));
assert.equal(ikrcX.inserted, 2);
assert.equal(ikrcZ.inserted, 6);
assert.equal(ikrcZ2.inserted, 6);
assert.equal(ikrcHeadZ.inserted, 6);
const ikrcHeadRetry = await rpc("submitScores", headOfficialPayload);
assert.equal(ikrcHeadRetry.success, true);
assert.equal(ikrcHeadRetry.idempotent, true, "동일 전체제출 재시도는 중복 저장 없이 기존 영수증을 반환해야 합니다");
assert.equal(ikrcHeadRetry.inserted, 6);
// 배포 전 OT에서 저장된 헤드 기록은 미검수일 수 있다. 새 규칙에서는 별도 헤드 검수 없이도 공식 확정으로 호환해야 한다.
testDb.raw.prepare("UPDATE scores SET review_status='미검수' WHERE competition_code='IKRC' AND judge_name='QA 헤드' AND mode NOT LIKE '%켈리브레이션%'").run();

const crossStationOfficial = await rpc("submitScores", ikrcPayload(judge, station2));
assert.equal(crossStationOfficial.success, true, "한 심사위원은 현장 안내에 따라 여러 공식평가 스테이션을 순차 평가할 수 있어야 합니다");
assert.equal(crossStationOfficial.inserted, 6);

const ikrcBlindBefore = await rpc("getIkrcBlindAssignments", adminActor);
assert.equal(ikrcBlindBefore.success, true, ikrcBlindBefore.message);
assert.equal(ikrcBlindBefore.participants.length, 1);
assert.equal(ikrcBlindBefore.participants[0].validUnit, false, "기존 참가자번호는 스테이션 블라인드코드로 오인하면 안 됩니다");
const firstBlindLinkAfterScores = await rpc(
  "saveIkrcBlindAssignments",
  {
    currentRound: "예선",
    assignments: [{ participantId:ikrcBlindBefore.participants[0].participantId, unit:"X-1" }],
  },
  adminActor,
);
assert.equal(firstBlindLinkAfterScores.success, true, firstBlindLinkAfterScores.message);
assert.equal(testDb.raw.prepare("SELECT prelim_cup_no FROM participants WHERE competition_code='IKRC'").get().prelim_cup_no, "1", "블라인드코드 연결이 기존 참가자번호를 덮어쓰면 안 됩니다");
const blockedBlindRemap = await rpc(
  "saveIkrcBlindAssignments",
  {
    currentRound: "예선",
    assignments: [{ participantId:ikrcBlindBefore.participants[0].participantId, unit:"X-2" }],
  },
  adminActor,
);
assert.equal(blockedBlindRemap.success, false, "평가 후 이미 연결된 블라인드코드는 다른 선수로 변경되면 안 됩니다");

const duplicateX = await rpc("submitScores", ikrcPayload(judge, station1));
assert.equal(duplicateX.success, false);
assert.ok(duplicateX.duplicateId);

const addedStationSave = await rpc(
  "saveIkrcStationSettings",
  {
    currentRound: "예선",
    stations: [station1, station2, station3],
  },
  leadActor,
);
assert.equal(addedStationSave.success, true, addedStationSave.message);
assert.equal(addedStationSave.preservedScoreCount, 26);

const ikrcY = await rpc("submitScores", ikrcPayload(judge2, station3));
assert.equal(ikrcY.inserted, 2);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='IKRC'").get().n,
  28,
);
assert.deepEqual(
  testDb.raw.prepare("SELECT team, COUNT(*) AS n FROM scores WHERE competition_code='IKRC' AND mode NOT LIKE '%켈리브레이션%' GROUP BY team ORDER BY team").all().map((row) => [row.team, row.n]),
  [["스테이션 1", 2], ["스테이션 2", 24], ["스테이션 3", 2]],
  "IKRC 공식 점수는 계정의 가변 팀명이 아니라 선택한 스테이션으로 분리 저장되어야 합니다",
);

const removedOverallCalibration = await rpc("submitScores", ikrcCalibrationPayload(head, station2, "all"));
assert.equal(removedOverallCalibration.success, false, "IKRC 전체 켈리브레이션 제출은 서버에서도 차단되어야 합니다");

for (const [login, stationInfo, scope] of [
  [judge, station1, "team"], [judgeZ, station2, "team"], [judge2, station3, "team"],
  [head, station2, "team"], [head2, station2, "team"],
]) {
  const submitted = await rpc("submitScores", ikrcCalibrationPayload(login, stationInfo, scope));
  assert.equal(submitted.success, true, `${login.name} ${scope} calibration: ${submitted.message}`);
}
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='IKRC'").get().n,
  50,
);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='IKRC' AND mode LIKE '%전체 켈리브레이션%' AND team='전체 켈리브레이션팀'").get().n,
  0,
  "IKRC 전체 켈리브레이션 데이터는 새로 저장되지 않아야 합니다",
);

// 팀별 켈리브레이션은 운영계정의 고정 스테이션이 아니라 실제 현장 선택으로 임시 팀을 구성합니다.
// 스테이션 2에 공식 배정된 헤드도 현장에서 안내받은 스테이션 1 팀별 켈리에 참여할 수 있어야 합니다.
const adHocHeadCalibration = await rpc("submitScores", ikrcCalibrationPayload(head, station1, "team"));
assert.equal(adHocHeadCalibration.success, true, adHocHeadCalibration.message);
const headScopeOptions = await rpc("getIkrcCalibrationScopeOptions", { judgeToken: head.judgeToken });
assert.equal(headScopeOptions.success, true, headScopeOptions.message);
assert.equal(headScopeOptions.canViewOverall, false);
assert.deepEqual(headScopeOptions.stations.map((item) => item.id).sort(), ["station1", "station2"]);
const head2ScopeOptions = await rpc("getIkrcCalibrationScopeOptions", { judgeToken: head2.judgeToken });
assert.deepEqual(head2ScopeOptions.stations.map((item) => item.id), ["station2"]);
const assignedHeadScopeOptions = await rpc("getIkrcCalibrationScopeOptions", { judgeToken: assignedHead.judgeToken });
assert.deepEqual(assignedHeadScopeOptions.stations.map((item) => item.id), ["station1"], "헤드는 제출 전에도 사전 배정된 스테이션 켈리브레이션을 확인할 수 있어야 합니다");
const managerScopeOptions = await rpc("getIkrcCalibrationScopeOptions", { judgeToken: lead.judgeToken });
assert.equal(managerScopeOptions.success, true, managerScopeOptions.message);
assert.deepEqual(managerScopeOptions.stations.map((item) => item.id), ["station1", "station2", "station3"]);
const sensoryScopeOptions = await rpc("getIkrcCalibrationScopeOptions", { judgeToken: judge.judgeToken });
assert.equal(sensoryScopeOptions.success, false, "일반 센서리 심사위원은 표준편차·켈리 결과를 볼 수 없어야 합니다");
const forbiddenHeadStation = await rpc("getIkrcCalibrationCupNumbers", { scope:"station", stationId:"station1", team:"스테이션 1" }, { judgeToken:head2.judgeToken });
assert.equal(forbiddenHeadStation.success, false, "헤드는 자신이 팀별 켈리에 참여하지 않은 스테이션 결과를 볼 수 없어야 합니다");
const managerStationCalibration = await rpc("getIkrcCalibrationCupNumbers", { scope:"station", stationId:"station1", team:"스테이션 1" }, { judgeToken:lead.judgeToken });
assert.equal(managerStationCalibration.length, 2, "대회팀장은 모든 스테이션의 켈리 결과를 볼 수 있어야 합니다");
assert.equal(managerStationCalibration[0].judgeCount, 1);
assert.equal(managerStationCalibration[0].headCount, 1);

const officialScopeOptions = await rpc("getIkrcOfficialCalibrationScopeOptions", { judgeToken:head.judgeToken });
assert.equal(officialScopeOptions.success, true, officialScopeOptions.message);
assert.deepEqual(officialScopeOptions.stations.map((item) => item.id), ["station2"], "헤드는 담당 공식평가 스테이션만 확인해야 합니다");
const officialStationBeforeReview = await rpc("getIkrcOfficialCalibrationCupNumbers", { scope:"station", stationId:"station2", team:"스테이션 2" }, { judgeToken:head.judgeToken });
assert.equal(officialStationBeforeReview.success, true);
assert.equal(officialStationBeforeReview.items.length, 6);
assert.ok(officialStationBeforeReview.items.every((item) => item.headCount === 1 && item.judgeCount === 3 && item.sensoryReviewCount === 0));
const headOnlyLiveRanking = await rpc("getRanking", "IKRC", adminActor);
const headOnlyZ1 = headOnlyLiveRanking.ranking.find((item) => item.unit === "Z-1");
assert.ok(headOnlyZ1, "현재 제출된 헤드·센서리 공식점수는 별도 완료 버튼 없이 실시간 순위에 표시되어야 합니다");
assert.equal(headOnlyZ1.confirmedJudgeCount, 4);
assert.equal(headOnlyZ1.finalized, false);

const preReviewIkrcList = await rpc("getReviewList", "IKRC", adminActor);
const firstSensoryStationRows = preReviewIkrcList.list.filter((item) => item.judgeName === "QA 센서리Z" && String(item.unit).startsWith("Z-"));
const firstSensoryReview = await rpc("updateReviewStatusBatch", "IKRC", firstSensoryStationRows.map((item) => item.rowIndex), "검수완료", "관리자", adminActor);
assert.equal(firstSensoryReview.success, true, firstSensoryReview.message);
const twoJudgeLiveRanking = await rpc("getRanking", "IKRC", adminActor);
const twoJudgeZ1 = twoJudgeLiveRanking.ranking.find((item) => item.unit === "Z-1");
assert.ok(twoJudgeZ1, "센서리 심사위원 검수 완료 점수는 즉시 실시간 순위에 합산되어야 합니다");
assert.equal(twoJudgeZ1.confirmedJudgeCount, 4);
assert.equal(twoJudgeZ1.scoreBasis, "현재 제출 평균");
const resetFirstSensoryReview = await rpc("updateReviewStatusBatch", "IKRC", firstSensoryStationRows.map((item) => item.rowIndex), "미검수", "관리자", adminActor);
assert.equal(resetFirstSensoryReview.success, true, resetFirstSensoryReview.message);
const officialZ1Detail = await rpc("getIkrcOfficialCalibrationResultsByCup", "Z-1", { scope:"station", stationId:"station2", team:"스테이션 2" }, { judgeToken:head.judgeToken });
assert.equal(officialZ1Detail.success, true, officialZ1Detail.message);
assert.equal(officialZ1Detail.rows.length, 3, "헤드 화면에는 센서리 3명만 개별 표시해야 합니다");
assert.equal(officialZ1Detail.headCount, 1);
assert.equal(officialZ1Detail.headScoreHidden, true);
assert.ok(officialZ1Detail.rows.every((item) => !/헤드|head/i.test(item.role)));
const prematureFinalization = await rpc("finalizeIkrcStationEvaluation", { scope:"station", stationId:"station2", team:"스테이션 2" }, { judgeToken:head.judgeToken });
assert.equal(prematureFinalization.success, true, "현장 심사 인원수나 별도 검수완료 상태를 최종확정 조건으로 강제하면 안 됩니다");
assert.match(prematureFinalization.message, /심사 인원수는 강제하지 않으며/);

const mobReviewComment = "향미의 연결성과 밸런스를 확인한 MOB 전체 종합 코멘트";
const mobReviewPayload = genericPayload(judge, "MOB", "MOB-1", 55);
mobReviewPayload.clientSubmissionId = "QA-MOB-SUBMISSION-1";
mobReviewPayload.rows[0].extraFields["종합코멘트"] = mobReviewComment;

for (const [code, payload, signature] of [
  ["KBC", genericPayload(judge, "KBC", "KBC-1", 81), ""],
  [
    "KCAC",
    genericPayload(judge, "KCAC", "KCAC-1", 30, [
      { data: ["KCAC-1"], extraFields: { Total: 12 } },
      { data: ["KCAC-1"], extraFields: { Total: 18 } },
    ]),
    "",
  ],
  [
    "KCR",
    kcrStationPayload(judge, kcrStation1, [70, 72]),
    "",
  ],
  ["MOB", mobReviewPayload, ""],
  ["MOC", genericPayload(judge, "MOC", "MOC-1", 5), "data:image/png;base64,UUE="],
  ["KTCC", genericPayload(judge, "KTCC", "KTCC-1", 8), "data:image/png;base64,UUE="],
]) {
  const submitted = signature
    ? await rpc("submitWithSignature", payload, signature)
    : await rpc("submitScores", payload);
  assert.equal(submitted.success, true, `${code}: ${submitted.message}`);
  if (code === "KCR") assert.equal(submitted.inserted, 2);
  else assert.equal(submitted.inserted, 1);
}

const mobRetry = await rpc("submitScores", mobReviewPayload);
assert.equal(mobRetry.success, true, mobRetry.message);
assert.equal(mobRetry.idempotent, true, "MOB network retry must return the prior receipt");
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='MOB' AND unit='MOB-1'").get().n,
  1,
  "MOB retry must not create a duplicate score row",
);

const secondJudgeSameKcrCup = await rpc(
  "submitScores",
  kcrStationPayload(judge2, kcrStation1, [66, 68]),
);
assert.equal(secondJudgeSameKcrCup.success, true, JSON.stringify(secondJudgeSameKcrCup));
assert.equal(secondJudgeSameKcrCup.inserted, 2);

for (const [mode, team] of [
  ["KCR 스테이션 켈리브레이션", kcrStation1.label],
  ["KCR 전체 켈리브레이션", "전체 켈리브레이션팀"],
]) {
  const calibrationPayload = kcrStationPayload(judge, kcrStation1, [64, 65], mode);
  calibrationPayload.team = team;
  const submitted = await rpc("submitScores", calibrationPayload);
  assert.equal(submitted.success, true, `${mode}: ${submitted.message}`);
}
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='KCR' AND mode LIKE '%스테이션 켈리브레이션%' AND team='스테이션 1'").get().n,
  2,
);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='KCR' AND mode LIKE '%전체 켈리브레이션%' AND team='전체 켈리브레이션팀'").get().n,
  2,
  "KCR overall calibration must use the shared overall-calibration team",
);
const independentKcrRows = testDb.raw
  .prepare("SELECT judge_name, unit, total_score FROM scores WHERE competition_code='KCR' AND mode NOT LIKE '%켈리브레이션%' ORDER BY judge_name, unit")
  .all();
assert.deepEqual(
  independentKcrRows.map((row) => [row.judge_name, row.unit, row.total_score]),
  [
    ["QA 센서리", "1", 70],
    ["QA 센서리", "2", 72],
    ["QA 센서리2", "1", 66],
    ["QA 센서리2", "2", 68],
  ],
  "같은 컵의 심사위원별 평가와 같은 심사위원의 컵별 평가는 각각 독립 행으로 저장되어야 합니다.",
);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='KCR' AND mode NOT LIKE '%켈리브레이션%' AND team='스테이션 1'").get().n,
  4,
  "KCR official scores must use the selected station instead of a mutable judge team",
);

const duplicateKbc = await rpc("submitScores", genericPayload(judge, "KBC", "KBC-1", 81));
assert.equal(duplicateKbc.success, false);
assert.ok(duplicateKbc.duplicateId);

const kbcCommentEvidence = [
  { id:"kbc-presentation", label:"서비스 전문성", section:"서비스", score:3.0, rating:"안정적", weight:1, weightedScore:3.0, tags:["커피 지식 전달", "자신감"], comment:"테스트입니다." },
  { id:"kbc-espresso-taste", label:"에스프레소 맛과 설계", section:"에스프레소", score:2.6, rating:"기준점", weight:2, weightedScore:5.2, tags:[], comment:"" },
  { id:"kbc-espresso-clean", label:"에스프레소 클린컵", section:"에스프레소", score:3.0, rating:"안정적", weight:1, weightedScore:3.0, tags:[], comment:"" },
  { id:"kbc-espresso-mouth", label:"에스프레소 마우스필", section:"에스프레소", score:3.0, rating:"안정적", weight:1, weightedScore:3.0, tags:[], comment:"" },
  { id:"kbc-espresso-flavor", label:"에스프레소 플레이버", section:"에스프레소", score:3.0, rating:"안정적", weight:1, weightedScore:3.0, tags:["포도·건과일 계열", "라즈베리"], comment:"" },
  { id:"kbc-machine", label:"머신 및 기물 운용 전문성", section:"운영", score:1.6, rating:"미흡", weight:1, weightedScore:1.6, tags:[], comment:"" },
];
const generatedKbc = await rpc("generateKbcComment", {
  judgeName:"QA 심사위원",
  variationSeed:"KBC-all-evidence",
  presentationVal:3.0,
  espressoVals:[2.6, 3.0, 3.0, 3.0],
  sigVals:[],
  machineVal:1.6,
  subtotalScore:18.8,
  totalScore:18.8,
  timePenalty:0,
  isMain:false,
  evaluatedItems:kbcCommentEvidence,
});
assert.equal(generatedKbc.success, true);
assert.equal(generatedKbc.comments.length, 2);
generatedKbc.comments.forEach((comment) => {
  kbcCommentEvidence.forEach((item) => {
    assert.ok(comment.includes(item.label), `KBC generated comment omitted ${item.label}`);
    item.tags.forEach((tag) => assert.ok(comment.includes(tag), `KBC generated comment omitted ${tag}`));
    if (item.comment) assert.ok(comment.includes("테스트입니다"), `KBC generated comment omitted direct note for ${item.label}`);
  });
  assert.match(comment, /안정적인 인상/);
  assert.match(comment, /다소 불안정한 인상/);
  assert.match(comment, /심사에서 느껴진 내용을 간단히|서비스 전문성/);
  assert.doesNotMatch(comment, /우선적인 개선|연습이 필요|재정비|핵심 보완 지점|높아질 수 있습니다/);
  assert.ok(comment.length <= 550, `KBC generated comment is too long: ${comment.length}`);
  assert.doesNotMatch(comment, /항목 합계|가중 반영|전 항목 평균|최종 18\.8점|\d+(?:\.\d+)?점\s*\(/);
});

const reviewExpectedMinimums = {
  KBC: 1,
  KCAC: 2,
  KCR: 4,
  MOB: 1,
  MOC: 1,
  KTCC: 1,
  IKRC: 10,
};
const reviewLists = {};
for (const [code, minimum] of Object.entries(reviewExpectedMinimums)) {
  const review = await rpc("getReviewList", code, adminActor);
  assert.equal(review.success, true, `${code}: ${review.message}`);
  assert.ok(review.list.length >= minimum, `${code} review list is shorter than expected`);
  reviewLists[code] = review;
}
assert.equal(reviewLists.IKRC.list.length, 28, "IKRC head official scores must be included in the normal review list");
assert.equal(reviewLists.KCR.list.length, 4, "KCR station/all calibration rows must stay out of official competition review");
assert.equal(reviewLists.MOB.list[0]["종합코멘트"], mobReviewComment, "MOB review must expose the submitted overall comment verbatim");
assert.ok(reviewLists.IKRC.list.some((item) => item.judgeName === "QA 헤드" || item["심사위원명"] === "QA 헤드"));
assert.ok(reviewLists.IKRC.list.filter((item) => item.judgeName === "QA 헤드").every((item) => item.status === "검수완료"), "기존 미검수 헤드 기록도 화면에서는 검수 없는 확정 상태로 보여야 합니다");
assert.ok(reviewLists.IKRC.list.some((item) => item.unit === "X-1"));
assert.ok(reviewLists.IKRC.list.some((item) => item.unit === "Y-2"));
assert.ok(
  reviewLists.IKRC.list.some(
    (item) => item.unit === "X-1" && (item.participantName === "QA 참가자" || item["선수명"] === "QA 참가자"),
  ),
  "Manager review must enrich the blind sample with participant identity",
);

const stationLeadReview = await rpc("getReviewList", "IKRC", stationLeadActor);
assert.equal(stationLeadReview.success, true);
assert.equal(stationLeadReview.stationScope.label, "스테이션 2");
assert.equal(stationLeadReview.list.length, 24, "스테이션 2 팀장은 해당 스테이션의 헤드·심사위원 공식 점수만 확인해야 합니다");
assert.ok(stationLeadReview.list.every((item) => String(item.unit || "").startsWith("Z-")));
const stationLeadCrossEdit = await rpc(
  "updateReviewRow",
  "IKRC",
  reviewLists.IKRC.list.find((item) => item.unit === "X-1").rowIndex,
  {},
  "검수완료",
  "대회팀장",
  stationLeadActor,
);
assert.equal(stationLeadCrossEdit.success, false, "스테이션 팀장은 다른 스테이션 행을 직접 지정해도 수정할 수 없어야 합니다");

const kbcCommentColumn = reviewLists.KBC.headers.indexOf("종합코멘트");
assert.ok(kbcCommentColumn >= 0);
const kbcReviewEdit = await rpc(
  "updateReviewRow",
  "KBC",
  reviewLists.KBC.list[0].rowIndex,
  { [kbcCommentColumn]: "QA 검수 수정 확인" },
  "수정완료",
  "관리자",
  adminActor,
);
assert.equal(kbcReviewEdit.success, true, kbcReviewEdit.message);
const kbcReviewAfterEdit = await rpc("getReviewList", "KBC", adminActor);
assert.equal(kbcReviewAfterEdit.list[0]["종합코멘트"], "QA 검수 수정 확인");
assert.equal(kbcReviewAfterEdit.list[0].status, "수정완료");
reviewLists.KBC = kbcReviewAfterEdit;

const judgeOwnReview = await rpc("getReviewList", "IKRC", {
  judgeToken: judge.judgeToken,
  reviewScope: "own",
  manageReview: false,
});
assert.equal(judgeOwnReview.success, true);
assert.equal(judgeOwnReview.ownOnly, true);
assert.equal(judgeOwnReview.list.length, 8, "여러 스테이션을 평가한 심사위원은 각 스테이션의 본인 공식 평가를 모두 검수할 수 있어야 합니다");

const headOwnReview = await rpc("getReviewList", "IKRC", {
  judgeToken: head.judgeToken,
  reviewScope: "own",
  manageReview: false,
});
assert.equal(headOwnReview.success, true);
assert.equal(headOwnReview.ownOnly, true);
assert.equal(headOwnReview.readOnlyHeadMonitor, false);
assert.equal(headOwnReview.stationScope, null);
assert.equal(headOwnReview.list.length, 6, "IKRC 헤드의 내 제출 검수에는 본인 공식 평가만 보여야 합니다");
const headZ1BeforeEdit = headOwnReview.list.find((item) => item.unit === "Z-1" && item.judgeName === "QA 헤드");
assert.ok(headZ1BeforeEdit, "헤드의 공식 Z-1 제출은 내 제출 검수에서 확인되어야 합니다");
assert.equal(headZ1BeforeEdit._stddev, undefined, "스테이션 통계는 내 제출 검수가 아니라 켈리브레이션 확인 화면에서만 제공합니다");

const flavorColumn = headOwnReview.headers.indexOf("Flavor(플레이버) ×3");
assert.ok(flavorColumn >= 0);
const headScoreEdit = await rpc(
  "updateReviewRow",
  "IKRC",
  headZ1BeforeEdit.rowIndex,
  { [flavorColumn]: 2 },
  "수정완료",
  "센서리 헤드 심사위원",
  { judgeToken: head.judgeToken, reviewScope: "own", manageReview: false },
);
assert.equal(headScoreEdit.success, true, "IKRC 헤드는 내 제출 검수에서 본인 점수·코멘트를 수정할 수 있어야 합니다");
const headOwnReviewAfterEdit = await rpc("getReviewList", "IKRC", {
  judgeToken: head.judgeToken,
  reviewScope: "own",
  manageReview: false,
});
const headZ1AfterEdit = headOwnReviewAfterEdit.list.find((item) => item.unit === "Z-1" && item.judgeName === "QA 헤드");
assert.equal(headZ1AfterEdit.totalScore, 20, "같은 점수를 저장하면 공식 총점이 유지되어야 합니다");

const sensoryZ1 = reviewLists.IKRC.list.find((item) => item.unit === "Z-1" && item.judgeName === "QA 센서리Z");
assert.ok(sensoryZ1);
const forbiddenPeerEdit = await rpc(
  "updateReviewRow",
  "IKRC",
  sensoryZ1.rowIndex,
  {},
  "검수완료",
  "센서리 헤드 심사위원",
  { judgeToken: head.judgeToken, reviewScope: "own", manageReview: false },
);
assert.equal(forbiddenPeerEdit.success, false, "The head may compare peer scores but must not edit another judge's submission");

const teamScope = { scope: "station", team: "스테이션 2" };
const otherTeamScope = { scope: "station", team: "스테이션 2" };
const calibrationBeforeCheck = await rpc("getIkrcCalibrationCupNumbers", teamScope, {
  judgeToken: head.judgeToken,
});
assert.equal(calibrationBeforeCheck.length, 6);
const z1Before = calibrationBeforeCheck.find((item) => item.sampleNo === "Z-1");
assert.equal(z1Before.judgeCount, 1);
assert.equal(z1Before.headCount, 2);
assert.equal(z1Before.checked, false);

const calibrationDetail = await rpc("getIkrcCalibrationResultsByCup", "Z-1", teamScope, {
  judgeToken: head.judgeToken,
});
assert.equal(calibrationDetail.length, 3);
assert.equal(calibrationDetail.filter((item) => item.isHeadCalibration).length, 2);

const teamCalibration = await rpc("getIkrcCalibrationCupNumbers", teamScope, { judgeToken: head.judgeToken });
assert.equal(teamCalibration.length, 6);
const otherTeamCalibration = await rpc("getIkrcCalibrationCupNumbers", otherTeamScope, { judgeToken: head2.judgeToken });
assert.equal(otherTeamCalibration.length, 6, "Team calibration must use only its initially assigned team");
assert.ok(otherTeamCalibration.every((item) => String(item.sampleNo).startsWith("Z-")));

const checked = await rpc(
  "markIkrcCalibrationChecked",
  "Z-1",
  teamScope,
  "QA 헤드",
  "센서리 헤드 심사위원",
  { judgeToken: head.judgeToken },
);
assert.equal(checked.success, true, checked.message);
const calibrationAfterCheck = await rpc("getIkrcCalibrationCupNumbers", teamScope, {
  judgeToken: head.judgeToken,
});
assert.equal(calibrationAfterCheck.find((item) => item.sampleNo === "Z-1").checked, true);
const head2AfterHead1Check = await rpc("getIkrcCalibrationCupNumbers", teamScope, { judgeToken: head2.judgeToken });
assert.equal(head2AfterHead1Check.find((item) => item.sampleNo === "Z-1").checked, false, "각 헤드의 스테이션 켈리브레이션 확인 상태는 독립적이어야 합니다");

for (const [code, review] of Object.entries(reviewLists)) {
  const statusUpdate = await rpc(
    "updateReviewStatusBatch",
    code,
    review.list.map((item) => item.rowIndex),
    "검수완료",
    "관리자",
    adminActor,
  );
  assert.equal(statusUpdate.success, true, `${code}: ${statusUpdate.message}`);
  const report = await rpc("getFinalReport", code, adminActor);
  assert.equal(report.success, true, `${code}: ${report.message}`);
  assert.ok(report.approvedRows.length > 0, `${code} final report has no approved rows`);
}

const ikrcRankingBeforeStationFinal = await rpc("getRanking", "IKRC", adminActor);
assert.equal(ikrcRankingBeforeStationFinal.success, true);
const reviewedBeforeFinalZ1 = ikrcRankingBeforeStationFinal.ranking.find((item) => item.unit === "Z-1");
assert.ok(reviewedBeforeFinalZ1, "센서리 검수 완료 점수는 헤드 최종확정 전에도 실시간 순위에 표시되어야 합니다");
assert.equal(reviewedBeforeFinalZ1.confirmedJudgeCount, 4);
assert.equal(reviewedBeforeFinalZ1.finalized, false);
const stationFinal = await rpc("finalizeIkrcStationEvaluation", { scope:"station", stationId:"station2", team:"스테이션 2" }, { judgeToken:head.judgeToken });
assert.equal(stationFinal.success, true, stationFinal.message);
assert.equal(stationFinal.finalization.units.length, 6);
const officialStationAfterReview = await rpc("getIkrcOfficialCalibrationCupNumbers", { scope:"station", stationId:"station2", team:"스테이션 2" }, { judgeToken:head.judgeToken });
assert.ok(officialStationAfterReview.items.every((item) => item.reviewComplete && item.sensoryReviewCount === 3));
assert.ok(officialStationAfterReview.finalization && officialStationAfterReview.finalization.confirmedAt);

const ikrcRankingAfterReview = await rpc("getRanking", "IKRC", adminActor);
assert.equal(ikrcRankingAfterReview.success, true, ikrcRankingAfterReview.message);
const rankedZ1 = ikrcRankingAfterReview.ranking.find((item) => item.unit === "Z-1");
assert.ok(rankedZ1);
assert.equal(rankedZ1.totalScore, 20, "The official IKRC result must average the unchanged head and sensory scores");
assert.equal(rankedZ1.judgeCount, 4, "The head official score and three sensory scores must be averaged together");
assert.equal(rankedZ1.confirmedJudgeCount, 4);
assert.equal(rankedZ1.finalized, true);

const judgeZRows = reviewLists.IKRC.list.filter((item) => item.judgeName === "QA 센서리Z" && String(item.unit).startsWith("Z-"));
const reopenJudgeZ = await rpc("updateReviewStatusBatch", "IKRC", judgeZRows.map((item) => item.rowIndex), "미검수", "관리자", adminActor);
assert.equal(reopenJudgeZ.success, true, reopenJudgeZ.message);
const judgeZOwnReopened = await rpc("getReviewList", "IKRC", { judgeToken:judgeZ.judgeToken, reviewScope:"own", manageReview:false });
assert.equal(judgeZOwnReopened.list.length, 6, "재평가 허용 후 센서리 심사위원의 내 제출 검수에 다시 보여야 합니다");
const rankingAfterReopen = await rpc("getRanking", "IKRC", adminActor);
const reopenedZ1 = rankingAfterReopen.ranking.find((item) => item.unit === "Z-1");
assert.ok(reopenedZ1, "재수정 중에도 현재 제출점수의 실시간 평균은 유지되어야 합니다");
assert.equal(reopenedZ1.confirmedJudgeCount, 4);
assert.equal(reopenedZ1.finalized, false, "재평가 허용 시 기존 스테이션 최종확정은 해제되어야 합니다");
const completeJudgeZAgain = await rpc("updateReviewStatusBatch", "IKRC", judgeZRows.map((item) => item.rowIndex), "검수완료", "센서리 심사위원", { judgeToken:judgeZ.judgeToken, reviewScope:"own", manageReview:false });
assert.equal(completeJudgeZAgain.success, true, completeJudgeZAgain.message);
const rankingBeforeRefinal = await rpc("getRanking", "IKRC", adminActor);
const reviewedAgainZ1 = rankingBeforeRefinal.ranking.find((item) => item.unit === "Z-1");
assert.ok(reviewedAgainZ1, "재검수 완료 점수는 헤드 재확정 전에도 즉시 실시간 순위에 복구되어야 합니다");
assert.equal(reviewedAgainZ1.confirmedJudgeCount, 4);
assert.equal(reviewedAgainZ1.finalized, false);
const refinal = await rpc("finalizeIkrcStationEvaluation", { scope:"station", stationId:"station2", team:"스테이션 2" }, { judgeToken:head.judgeToken });
assert.equal(refinal.success, true, refinal.message);
const rankingAfterRefinal = await rpc("getRanking", "IKRC", adminActor);
assert.equal(rankingAfterRefinal.ranking.find((item) => item.unit === "Z-1").finalized, true);

const backupBeforeDelete = await rpc("getScoreBackupReport", "IKRC", adminActor);
assert.equal(backupBeforeDelete.success, true, backupBeforeDelete.message);
assert.equal(backupBeforeDelete.rows.length, 52);
assert.equal(backupBeforeDelete.calibrationRows.length, 24);
assert.equal(backupBeforeDelete.competitionRows.length, 28);
assert.ok(backupBeforeDelete.rows.some((row) => row["스테이션ID"] === "station1"));
assert.ok(backupBeforeDelete.rows.some((row) => row["스테이션ID"] === "station3"));

const removeStations = await rpc(
  "saveIkrcStationSettings",
  {
    currentRound: "예선",
    stations: [station2],
  },
  leadActor,
);
assert.equal(removeStations.success, true, removeStations.message);
assert.equal(removeStations.stationChanged, true);
assert.equal(removeStations.preservedScoreCount, 52);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='IKRC'").get().n,
  52,
);

const configAfterDelete = await rpc("getConfig");
assert.equal(configAfterDelete.success, true);
const ikrcConfig = configAfterDelete.configs.find((config) => config.code === "IKRC");
assert.deepEqual(
  ikrcConfig.optionSettings.ikrcStations.stations.map((item) => [item.id, item.label, item.prefix]),
  [["station2", "스테이션 2", "Z"]],
);

const oldStationSubmit = await rpc("submitScores", ikrcPayload(judge, station1));
assert.equal(oldStationSubmit.success, false);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='IKRC'").get().n,
  52,
);

const reviewAfterStationDelete = await rpc("getReviewList", "IKRC", adminActor);
assert.equal(reviewAfterStationDelete.list.length, 28);
assert.ok(reviewAfterStationDelete.list.some((item) => item.unit === "X-1"));
assert.ok(reviewAfterStationDelete.list.some((item) => item.unit === "Y-1"));

const protectedRow = reviewAfterStationDelete.list.find((item) => item.unit === "X-1");
const leadDeleteAttempt = await rpc(
  "deleteReviewRow",
  "IKRC",
  protectedRow.rowIndex,
  "대회팀장",
  leadActor,
);
assert.equal(leadDeleteAttempt.success, false);

const adminDelete = await rpc(
  "deleteReviewRow",
  "IKRC",
  protectedRow.rowIndex,
  "관리자",
  adminActor,
);
assert.equal(adminDelete.success, true, adminDelete.message);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='IKRC'").get().n,
  51,
);

const backupAfterDelete = await rpc("getScoreBackupReport", "IKRC", adminActor);
assert.equal(backupAfterDelete.rows.length, 51);
assert.ok(backupAfterDelete.rows.some((row) => row["스테이션ID"] === "station3"));

const storedPayloads = testDb.raw
  .prepare("SELECT payload_json FROM scores")
  .all()
  .map((row) => row.payload_json);
for (const payloadJson of storedPayloads) {
  assert.doesNotMatch(payloadJson, /judgeToken|actorToken|adminToken|sessionToken/);
}

const initialLoginSecurity = await rpc("getLoginSecurityStatus", adminActor);
assert.equal(initialLoginSecurity.success, true, initialLoginSecurity.message);
assert.equal(initialLoginSecurity.enabled, false);

const unauthorizedLoginSecurity = await rpc("getLoginSecurityStatus", { judgeToken: judge.judgeToken });
assert.equal(unauthorizedLoginSecurity.success, false, "일반 심사위원은 로그인 보안번호 설정을 조회할 수 없어야 합니다");

const createLoginSecurity = await rpc(
  "setLoginSecurityCode",
  { code: "2468", confirmCode: "2468" },
  adminActor,
);
assert.equal(createLoginSecurity.success, true, createLoginSecurity.message);
assert.equal(createLoginSecurity.enabled, true);

const enabledLoginSecurity = await rpc("getLoginSecurityStatus", adminActor);
assert.equal(enabledLoginSecurity.success, true, enabledLoginSecurity.message);
assert.equal(enabledLoginSecurity.enabled, true);
assert.equal("code" in enabledLoginSecurity, false, "보안번호 평문을 상태 응답에 노출하면 안 됩니다");
assert.equal("hash" in enabledLoginSecurity, false, "보안번호 해시를 상태 응답에 노출하면 안 됩니다");

const loginWithoutSecurity = await rpc("judgeLogin", "QA 센서리", "01011110001");
assert.equal(loginWithoutSecurity.success, false, "보안번호 사용 중에는 이름과 연락처만으로 로그인되면 안 됩니다");
const loginWithWrongSecurity = await rpc("judgeLogin", "QA 센서리", "01011110001", "1111");
assert.equal(loginWithWrongSecurity.success, false, "잘못된 보안번호로 로그인되면 안 됩니다");
const loginWithSecurity = await rpc("judgeLogin", "QA 센서리", "01011110001", "2468");
assert.equal(loginWithSecurity.success, true, loginWithSecurity.message);

const changeLoginSecurity = await rpc(
  "setLoginSecurityCode",
  { code: "9753", confirmCode: "9753" },
  adminActor,
);
assert.equal(changeLoginSecurity.success, true, changeLoginSecurity.message);
const loginWithOldSecurity = await rpc("judgeLogin", "QA 센서리", "01011110001", "2468");
assert.equal(loginWithOldSecurity.success, false, "변경 전 보안번호는 즉시 사용할 수 없어야 합니다");
const loginWithChangedSecurity = await rpc("judgeLogin", "QA 센서리", "01011110001", "9753");
assert.equal(loginWithChangedSecurity.success, true, loginWithChangedSecurity.message);

const deleteLoginSecurity = await rpc("deleteLoginSecurityCode", adminActor);
assert.equal(deleteLoginSecurity.success, true, deleteLoginSecurity.message);
assert.equal(deleteLoginSecurity.enabled, false);
const loginAfterSecurityDelete = await rpc("judgeLogin", "QA 센서리", "01011110001");
assert.equal(loginAfterSecurityDelete.success, true, loginAfterSecurityDelete.message);

const selectiveParticipantSave = await rpc("upsertParticipant", {
  competitionCode:"KBC", name:"QA 선택삭제 선수", phone:"01099990001", uniqueNo:"KBC-SELECTIVE", prelimCupNo:"KBC-SELECTIVE",
}, adminActor);
assert.equal(selectiveParticipantSave.success, true, selectiveParticipantSave.message);
const selectiveBefore = await rpc("getSelectiveResetOptions", "KBC", adminActor);
assert.equal(selectiveBefore.success, true, selectiveBefore.message);
const selectiveParticipant = selectiveBefore.participants.find((item) => item.name === "QA 선택삭제 선수");
assert.ok(selectiveParticipant, "선택 초기화 선수 목록에 신규 선수가 표시되어야 합니다");
const selectiveParticipantDelete = await rpc("deleteSelectedParticipantData", {
  competitionCode:"KBC", participantId:selectiveParticipant.participantId,
}, adminActor);
assert.equal(selectiveParticipantDelete.success, true, selectiveParticipantDelete.message);
assert.equal(testDb.raw.prepare("SELECT COUNT(*) AS n FROM participants WHERE competition_code='KBC' AND name='QA 선택삭제 선수'").get().n, 0);

const selectiveScorePayload = genericPayload(judge, "KBC", "KBC-SELECTIVE-SCORE", 77);
selectiveScorePayload.clientSubmissionId = "QA-KBC-SELECTIVE-SCORE";
const selectiveScoreSubmit = await rpc("submitScores", selectiveScorePayload);
assert.equal(selectiveScoreSubmit.success, true, selectiveScoreSubmit.message);
const selectiveScoreOptions = await rpc("getSelectiveResetOptions", "KBC", adminActor);
const selectiveScore = selectiveScoreOptions.scoreTargets.find((item) => item.unit === "KBC-SELECTIVE-SCORE" && item.category === "competition");
assert.ok(selectiveScore, "선택 초기화 점수 목록은 참가자·라운드·평가구분별로 표시되어야 합니다");
const selectiveScoreDelete = await rpc("deleteSelectedScoreData", {
  competitionCode:"KBC", round:selectiveScore.round, unit:selectiveScore.unit, category:selectiveScore.category,
}, adminActor);
assert.equal(selectiveScoreDelete.success, true, selectiveScoreDelete.message);
assert.equal(testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='KBC' AND unit='KBC-SELECTIVE-SCORE'").get().n, 0);
assert.equal(testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='KBC' AND unit='KBC-1'").get().n, 1, "선택 점수 삭제가 다른 참가자 점수에 영향을 주면 안 됩니다");

const unauthorizedSubmit = await rpc("submitScores", {
  competitionCode: "KBC",
  rows: [{ data: ["UNAUTHORIZED"] }],
});
assert.equal(unauthorizedSubmit.success, false);

const crossOriginRequest = new Request("https://qa.kcl.local/api/rpc", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://evil.example",
  },
  body: JSON.stringify({ action: "ping", args: [] }),
});
const crossOriginResponse = await onRequestPost({ request: crossOriginRequest, env });
assert.equal(crossOriginResponse.status, 403);

const signedScores = testDb.raw
  .prepare("SELECT competition_code, signature_data FROM scores WHERE competition_code IN ('MOC','KTCC') ORDER BY competition_code")
  .all();
assert.equal(signedScores.length, 2);
assert.ok(signedScores.every((row) => row.signature_data.startsWith("data:image/png;base64,")));

process.stdout.write("Stage113 full evaluation-to-review integration tests passed.\n");
