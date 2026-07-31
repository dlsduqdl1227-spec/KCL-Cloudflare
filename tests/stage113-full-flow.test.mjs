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
    teamGroup: "QA팀",
    role: "센서리 심사위원",
  },
  {
    accountType: "JUDGE",
    name: "QA 센서리2",
    phone: "01011110004",
    affiliation: "QA",
    access: "ALL",
    teamGroup: "QA팀",
    role: "센서리 심사위원",
  },
  {
    accountType: "JUDGE",
    name: "QA 헤드",
    phone: "01011110002",
    affiliation: "QA",
    access: "IKRC",
    teamGroup: "QA팀",
    role: "센서리 헤드 심사위원",
  },
  {
    accountType: "TEAMLEAD",
    name: "QA 대회팀장",
    phone: "01011110003",
    affiliation: "QA",
    access: "IKRC",
    teamGroup: "QA팀",
    role: "대회팀장",
  },
]) {
  const saved = await rpc("upsertOperatorAccount", operator, adminActor);
  assert.equal(saved.success, true, saved.message);
}

const judge = await rpc("judgeLogin", "QA 센서리", "01011110001");
const judge2 = await rpc("judgeLogin", "QA 센서리2", "01011110004");
const head = await rpc("judgeLogin", "QA 헤드", "01011110002");
const lead = await rpc("judgeLogin", "QA 대회팀장", "01011110003");
for (const login of [judge, judge2, head, lead]) {
  assert.equal(login.success, true, login.message);
  assert.ok(login.judgeToken);
}
const leadActor = managedActor(lead);

const station1 = station("station1", "스테이션 1", "X", 1, 2);
const station2 = station("station2", "스테이션 2", "Z", 1, 6);
const station3 = station("station3", "스테이션 3", "Y", 1, 2);

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

const participantSave = await rpc(
  "upsertParticipant",
  {
    competitionCode: "IKRC",
    name: "QA 참가자",
    phone: "01022220001",
    uniqueNo: "QA-001",
    prelimCupNo: "X-1",
    sampleNo: "X-1",
  },
  adminActor,
);
assert.equal(participantSave.success, true, participantSave.message);

const ikrcX = await rpc("submitScores", ikrcPayload(judge, station1));
const ikrcZ = await rpc("submitScores", ikrcPayload(judge, station2));
const ikrcHeadZ = await rpc("submitScores", ikrcPayload(head, station2, "IKRC 켈리브레이션"));
assert.equal(ikrcX.success, true, JSON.stringify(ikrcX));
assert.equal(ikrcZ.success, true, JSON.stringify(ikrcZ));
assert.equal(ikrcHeadZ.success, true, JSON.stringify(ikrcHeadZ));
assert.equal(ikrcX.inserted, 2);
assert.equal(ikrcZ.inserted, 6);
assert.equal(ikrcHeadZ.inserted, 6);

const duplicateX = await rpc("submitScores", ikrcPayload(judge, station1));
assert.equal(duplicateX.success, false);
assert.ok(duplicateX.duplicateId);

const addedStationSave = await rpc(
  "updateCompetitionAdminSettings",
  {
    code: "IKRC",
    currentRound: "예선",
    isActive: true,
    debriefing: true,
    optionSettings: stationSettings([station1, station2, station3]),
  },
  adminActor,
);
assert.equal(addedStationSave.success, true, addedStationSave.message);
assert.equal(addedStationSave.preservedScoreCount, 14);

const ikrcY = await rpc("submitScores", ikrcPayload(judge, station3));
assert.equal(ikrcY.inserted, 2);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='IKRC'").get().n,
  16,
);

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
    genericPayload(judge, "KCR", "KCR-1", 70, [
      { data: ["KCR-1", "Washed"], extraFields: { Total: 70 } },
      { data: ["KCR-2", "Washed"], extraFields: { Total: 72 } },
    ]),
    "",
  ],
  ["MOB", genericPayload(judge, "MOB", "MOB-1", 55), ""],
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

const secondJudgeSameKcrCup = await rpc(
  "submitScores",
  genericPayload(judge2, "KCR", "KCR-1", 66, [
    { data: ["KCR-1", "Washed"], extraFields: { Total: 66 } },
  ]),
);
assert.equal(secondJudgeSameKcrCup.success, true, JSON.stringify(secondJudgeSameKcrCup));
assert.equal(secondJudgeSameKcrCup.inserted, 1);
const independentKcrRows = testDb.raw
  .prepare("SELECT judge_name, unit, total_score FROM scores WHERE competition_code='KCR' ORDER BY judge_name, unit")
  .all();
assert.deepEqual(
  independentKcrRows.map((row) => [row.judge_name, row.unit, row.total_score]),
  [
    ["QA 센서리", "KCR-1", 70],
    ["QA 센서리", "KCR-2", 72],
    ["QA 센서리2", "KCR-1", 66],
  ],
  "같은 컵의 심사위원별 평가와 같은 심사위원의 컵별 평가는 각각 독립 행으로 저장되어야 합니다.",
);

const duplicateKbc = await rpc("submitScores", genericPayload(judge, "KBC", "KBC-1", 81));
assert.equal(duplicateKbc.success, false);
assert.ok(duplicateKbc.duplicateId);

const reviewExpectedMinimums = {
  KBC: 1,
  KCAC: 2,
  KCR: 3,
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
assert.equal(reviewLists.IKRC.list.length, 10, "Head calibration rows must stay out of the normal review list");
assert.ok(reviewLists.IKRC.list.some((item) => item.unit === "X-1"));
assert.ok(reviewLists.IKRC.list.some((item) => item.unit === "Y-2"));
assert.ok(
  reviewLists.IKRC.list.some(
    (item) => item.unit === "X-1" && (item.participantName === "QA 참가자" || item["선수명"] === "QA 참가자"),
  ),
  "Manager review must enrich the blind sample with participant identity",
);

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
assert.equal(judgeOwnReview.list.length, 10);

const calibrationBeforeCheck = await rpc("getIkrcCalibrationCupNumbers", "", {
  judgeToken: head.judgeToken,
});
assert.equal(calibrationBeforeCheck.length, 10);
const z1Before = calibrationBeforeCheck.find((item) => item.sampleNo === "Z-1");
assert.equal(z1Before.judgeCount, 1);
assert.equal(z1Before.headCount, 1);
assert.equal(z1Before.checked, false);

const calibrationDetail = await rpc("getIkrcCalibrationResultsByCup", "Z-1", "", {
  judgeToken: head.judgeToken,
});
assert.equal(calibrationDetail.length, 2);
assert.equal(calibrationDetail.filter((item) => item.isHeadCalibration).length, 1);

const checked = await rpc(
  "markIkrcCalibrationChecked",
  "Z-1",
  "",
  "QA 헤드",
  "센서리 헤드 심사위원",
  { judgeToken: head.judgeToken },
);
assert.equal(checked.success, true, checked.message);
const calibrationAfterCheck = await rpc("getIkrcCalibrationCupNumbers", "", {
  judgeToken: head.judgeToken,
});
assert.equal(calibrationAfterCheck.find((item) => item.sampleNo === "Z-1").checked, true);

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

const backupBeforeDelete = await rpc("getScoreBackupReport", "IKRC", adminActor);
assert.equal(backupBeforeDelete.success, true, backupBeforeDelete.message);
assert.equal(backupBeforeDelete.rows.length, 16);
assert.equal(backupBeforeDelete.calibrationRows.length, 6);
assert.equal(backupBeforeDelete.competitionRows.length, 10);
assert.ok(backupBeforeDelete.rows.some((row) => row["스테이션ID"] === "station1"));
assert.ok(backupBeforeDelete.rows.some((row) => row["스테이션ID"] === "station3"));

const removeStations = await rpc(
  "updateCompetitionAdminSettings",
  {
    code: "IKRC",
    currentRound: "예선",
    isActive: true,
    debriefing: true,
    optionSettings: stationSettings([station2]),
  },
  adminActor,
);
assert.equal(removeStations.success, true, removeStations.message);
assert.equal(removeStations.stationChanged, true);
assert.equal(removeStations.preservedScoreCount, 16);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='IKRC'").get().n,
  16,
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
  16,
);

const reviewAfterStationDelete = await rpc("getReviewList", "IKRC", adminActor);
assert.equal(reviewAfterStationDelete.list.length, 10);
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
  15,
);

const backupAfterDelete = await rpc("getScoreBackupReport", "IKRC", adminActor);
assert.equal(backupAfterDelete.rows.length, 15);
assert.ok(backupAfterDelete.rows.some((row) => row["스테이션ID"] === "station3"));

const storedPayloads = testDb.raw
  .prepare("SELECT payload_json FROM scores")
  .all()
  .map((row) => row.payload_json);
for (const payloadJson of storedPayloads) {
  assert.doesNotMatch(payloadJson, /judgeToken|actorToken|adminToken|sessionToken/);
}

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
