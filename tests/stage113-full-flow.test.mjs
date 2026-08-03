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
    const unit = `${stationInfo.prefix}-${stationInfo.start + index}`;
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
    accountType: "JUDGE",
    name: "QA 헤드2",
    phone: "01011110005",
    affiliation: "QA",
    access: "IKRC",
    teamGroup: "다른팀",
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
  {
    accountType: "JUDGE",
    name: "QA 날짜심사",
    phone: "01011110006",
    affiliation: "QA",
    access: "MOB",
    teamGroup: "상시조",
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

const judge = await rpc("judgeLogin", "QA 센서리", "01011110001");
const judge2 = await rpc("judgeLogin", "QA 센서리2", "01011110004");
const head = await rpc("judgeLogin", "QA 헤드", "01011110002");
const head2 = await rpc("judgeLogin", "QA 헤드2", "01011110005");
const lead = await rpc("judgeLogin", "QA 대회팀장", "01011110003");
for (const login of [judge, judge2, head, head2, lead]) {
  assert.equal(login.success, true, login.message);
  assert.ok(login.judgeToken);
}
const leadActor = managedActor(lead);

const station1 = station("station1", "스테이션 1", "X", 1, 2);
const station2 = station("station2", "스테이션 2", "Z", 1, 6);
const station3 = station("station3", "스테이션 3", "Y", 1, 2);
const kcrStation1 = { id:"kcr-station1", label:"KCR 스테이션 1", prefix:"KCR", start:1, end:2, process:"Washed" };

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
assert.equal(partialKcrSubmit.success, false, "KCR station submission must reject a missing cup");
assert.match(partialKcrSubmit.message, /2개 컵이 모두 있어야/);

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
const ikrcHeadZ = await rpc("submitScores", ikrcPayload(head, station2));
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
  "saveIkrcStationSettings",
  {
    currentRound: "예선",
    stations: [station1, station2, station3],
  },
  leadActor,
);
assert.equal(addedStationSave.success, true, addedStationSave.message);
assert.equal(addedStationSave.preservedScoreCount, 14);

const ikrcY = await rpc("submitScores", ikrcPayload(judge, station3));
assert.equal(ikrcY.inserted, 2);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='IKRC'").get().n,
  16,
);

for (const [login, stationInfo, scope] of [
  [judge, station1, "all"], [judge, station2, "all"], [judge, station3, "all"],
  [head, station2, "all"], [head2, station2, "all"],
  [judge, station1, "team"], [judge, station2, "team"], [judge, station3, "team"],
  [head, station2, "team"], [head2, station2, "team"],
]) {
  const submitted = await rpc("submitScores", ikrcCalibrationPayload(login, stationInfo, scope));
  assert.equal(submitted.success, true, `${login.name} ${scope} calibration: ${submitted.message}`);
}
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='IKRC'").get().n,
  60,
);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='IKRC' AND mode LIKE '%전체 켈리브레이션%' AND team='전체 켈리브레이션팀'").get().n,
  22,
  "Overall calibration must merge every original team into one calibration team",
);

const mobReviewComment = "향미의 연결성과 밸런스를 확인한 MOB 전체 종합 코멘트";
const mobReviewPayload = genericPayload(judge, "MOB", "MOB-1", 55);
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
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='KCR' AND mode LIKE '%스테이션 켈리브레이션%' AND team='KCR 스테이션 1'").get().n,
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
    ["QA 센서리", "KCR-1", 70],
    ["QA 센서리", "KCR-2", 72],
    ["QA 센서리2", "KCR-1", 66],
    ["QA 센서리2", "KCR-2", 68],
  ],
  "같은 컵의 심사위원별 평가와 같은 심사위원의 컵별 평가는 각각 독립 행으로 저장되어야 합니다.",
);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='KCR' AND mode NOT LIKE '%켈리브레이션%' AND team='KCR 스테이션 1'").get().n,
  4,
  "KCR official scores must use the selected station instead of a mutable judge team",
);

const duplicateKbc = await rpc("submitScores", genericPayload(judge, "KBC", "KBC-1", 81));
assert.equal(duplicateKbc.success, false);
assert.ok(duplicateKbc.duplicateId);

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
assert.equal(reviewLists.IKRC.list.length, 16, "IKRC head official scores must be included in the normal review list");
assert.equal(reviewLists.KCR.list.length, 4, "KCR station/all calibration rows must stay out of official competition review");
assert.equal(reviewLists.MOB.list[0]["종합코멘트"], mobReviewComment, "MOB review must expose the submitted overall comment verbatim");
assert.ok(reviewLists.IKRC.list.some((item) => item.judgeName === "QA 헤드" || item["심사위원명"] === "QA 헤드"));
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

const headOwnReview = await rpc("getReviewList", "IKRC", {
  judgeToken: head.judgeToken,
  reviewScope: "own",
  manageReview: false,
});
assert.equal(headOwnReview.success, true);
assert.equal(headOwnReview.ownOnly, true);
assert.equal(headOwnReview.list.length, 6, "The IKRC head must retain all six official station scores in their own review list");
const headZ1BeforeEdit = headOwnReview.list.find((item) => item.unit === "Z-1");
assert.ok(headZ1BeforeEdit, "The head's official Z-1 score must be reviewable");
assert.equal(headZ1BeforeEdit._stddev.judgeCount, 2, "Head review must compare the head and same-team sensory judge");
assert.deepEqual(
  headZ1BeforeEdit._stddev.judges.map((item) => item.judgeName).sort(),
  ["QA 센서리", "QA 헤드"],
  "The official review comparison must expose same-team judge scores to the head",
);
assert.equal(headZ1BeforeEdit._stddev.judges.filter((item) => item.isCurrentJudge).length, 1);
assert.equal(headZ1BeforeEdit._stddev.totalAvg, 20);
assert.equal(headZ1BeforeEdit._stddev.totalStddev, 0);

const flavorColumn = headOwnReview.headers.indexOf("Flavor(플레이버) ×3");
assert.ok(flavorColumn >= 0);
const headScoreEdit = await rpc(
  "updateReviewRow",
  "IKRC",
  headZ1BeforeEdit.rowIndex,
  { [flavorColumn]: 4 },
  "수정완료",
  "센서리 헤드 심사위원",
  { judgeToken: head.judgeToken, reviewScope: "own", manageReview: false },
);
assert.equal(headScoreEdit.success, true, headScoreEdit.message);
const headOwnReviewAfterEdit = await rpc("getReviewList", "IKRC", {
  judgeToken: head.judgeToken,
  reviewScope: "own",
  manageReview: false,
});
const headZ1AfterEdit = headOwnReviewAfterEdit.list.find((item) => item.unit === "Z-1");
assert.equal(headZ1AfterEdit.totalScore, 26, "Editing the head's Flavor score must recalculate and retain the official total");
assert.equal(headZ1AfterEdit.status, "수정완료");
assert.equal(headZ1AfterEdit._stddev.totalAvg, 23);
assert.equal(headZ1AfterEdit._stddev.totalStddev, 3);
assert.equal(headZ1AfterEdit._stddev.metrics.find((item) => item.key === "flavor").avg, 3);

const sensoryZ1 = reviewLists.IKRC.list.find((item) => item.unit === "Z-1" && item.judgeName === "QA 센서리");
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

const allScope = { scope: "all", team: "QA팀" };
const teamScope = { scope: "team", team: "QA팀" };
const otherTeamScope = { scope: "team", team: "다른팀" };
const calibrationBeforeCheck = await rpc("getIkrcCalibrationCupNumbers", allScope, {
  judgeToken: head.judgeToken,
});
assert.equal(calibrationBeforeCheck.length, 10);
const z1Before = calibrationBeforeCheck.find((item) => item.sampleNo === "Z-1");
assert.equal(z1Before.judgeCount, 1);
assert.equal(z1Before.headCount, 2);
assert.equal(z1Before.checked, false);

const calibrationDetail = await rpc("getIkrcCalibrationResultsByCup", "Z-1", allScope, {
  judgeToken: head.judgeToken,
});
assert.equal(calibrationDetail.length, 3);
assert.equal(calibrationDetail.filter((item) => item.isHeadCalibration).length, 2);

const teamCalibration = await rpc("getIkrcCalibrationCupNumbers", teamScope, { judgeToken: head.judgeToken });
assert.equal(teamCalibration.length, 10);
const otherTeamCalibration = await rpc("getIkrcCalibrationCupNumbers", otherTeamScope, { judgeToken: head2.judgeToken });
assert.equal(otherTeamCalibration.length, 6, "Team calibration must use only its initially assigned team");
assert.ok(otherTeamCalibration.every((item) => String(item.sampleNo).startsWith("Z-")));

const checked = await rpc(
  "markIkrcCalibrationChecked",
  "Z-1",
  allScope,
  "QA 헤드",
  "센서리 헤드 심사위원",
  { judgeToken: head.judgeToken },
);
assert.equal(checked.success, true, checked.message);
const calibrationAfterCheck = await rpc("getIkrcCalibrationCupNumbers", allScope, {
  judgeToken: head.judgeToken,
});
assert.equal(calibrationAfterCheck.find((item) => item.sampleNo === "Z-1").checked, true);
const head2AfterHead1Check = await rpc("getIkrcCalibrationCupNumbers", allScope, { judgeToken: head2.judgeToken });
assert.equal(head2AfterHead1Check.find((item) => item.sampleNo === "Z-1").checked, false, "Each head must have an independent overall-calibration check state");
const head1TeamBeforeCheck = await rpc("getIkrcCalibrationCupNumbers", teamScope, { judgeToken: head.judgeToken });
assert.equal(head1TeamBeforeCheck.find((item) => item.sampleNo === "Z-1").checked, false, "Team and overall calibration states must be independent");
const checkedTeam = await rpc("markIkrcCalibrationChecked", "Z-1", teamScope, "QA 헤드", "센서리 헤드 심사위원", { judgeToken: head.judgeToken });
assert.equal(checkedTeam.success, true, checkedTeam.message);
const head1TeamAfterCheck = await rpc("getIkrcCalibrationCupNumbers", teamScope, { judgeToken: head.judgeToken });
assert.equal(head1TeamAfterCheck.find((item) => item.sampleNo === "Z-1").checked, true);

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

const ikrcRankingAfterReview = await rpc("getRanking", "IKRC", adminActor);
assert.equal(ikrcRankingAfterReview.success, true, ikrcRankingAfterReview.message);
const rankedZ1 = ikrcRankingAfterReview.ranking.find((item) => item.unit === "Z-1");
assert.ok(rankedZ1);
assert.equal(rankedZ1.totalScore, 23, "The official IKRC result must average the reviewed head score (26) with the sensory score (20)");
assert.equal(rankedZ1.judgeCount, 2, "The head official score must remain part of the counted judge set");

const backupBeforeDelete = await rpc("getScoreBackupReport", "IKRC", adminActor);
assert.equal(backupBeforeDelete.success, true, backupBeforeDelete.message);
assert.equal(backupBeforeDelete.rows.length, 60);
assert.equal(backupBeforeDelete.calibrationRows.length, 44);
assert.equal(backupBeforeDelete.competitionRows.length, 16);
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
assert.equal(removeStations.preservedScoreCount, 60);
assert.equal(
  testDb.raw.prepare("SELECT COUNT(*) AS n FROM scores WHERE competition_code='IKRC'").get().n,
  60,
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
  60,
);

const reviewAfterStationDelete = await rpc("getReviewList", "IKRC", adminActor);
assert.equal(reviewAfterStationDelete.list.length, 16);
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
  59,
);

const backupAfterDelete = await rpc("getScoreBackupReport", "IKRC", adminActor);
assert.equal(backupAfterDelete.rows.length, 59);
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
