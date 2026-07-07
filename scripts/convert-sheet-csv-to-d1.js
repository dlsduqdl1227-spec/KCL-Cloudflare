#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import iconv from "iconv-lite";

const inputDir = process.argv[2];
const outSql = process.argv[3] || "migration_insert.sql";
const reportPath = process.argv[4] || "migration_report.json";
const remoteSqlPath = path.join(path.dirname(outSql), "migration_insert_remote.sql");

if (!inputDir) {
  console.error("Usage: node scripts/convert-sheet-csv-to-d1.js ./csv-dir [migration_insert.sql] [migration_report.json]");
  process.exit(1);
}

const KNOWN_CODES = ["KBC", "KCR", "KCAC", "MOB", "IKRC", "MOC", "KTCC"];
const report = {
  files: [],
  warnings: [],
  errors: [],
  encodingUsed: {},
  remoteSqlGenerated: false,
  remoteSqlValidationErrors: [],
  remoteSqlValidationWarnings: [],
  counters: { competitions: 0, operators: 0, participants: 0, submissions: 0, metaRows: 0 }
};
const bodySql = [];

function csvParse(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quote) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quote = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quote = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function decodeCandidate(buffer, encoding) {
  if (encoding === "utf8-bom") return buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (encoding === "utf8") return buffer.toString("utf8");
  return iconv.decode(buffer, encoding);
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function decodeScore(text) {
  const replacement = countMatches(text, /\uFFFD/g);
  const mojibake = countMatches(text, /怨꾩|寃곗|珥앹|理쒖|源\?|몄뿽|붽컙|而ㅽ|덉꽑|쇱꽌|ㅻ뱶|�/g);
  const hangul = countMatches(text, /[가-힣]/g);
  const known = countMatches(text, /대회코드|이름|소속|예선|결선|월간커피|관리자|헤드|센서리|심사위원|제출시간/g);
  return replacement * 1000 + mojibake * 200 - hangul - known * 50;
}

function decodeCsvBuffer(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: decodeCandidate(buffer, "utf8-bom"), encoding: "utf8-bom" };
  }
  const candidates = ["utf8", "cp949", "euc-kr"].map((encoding) => {
    const text = decodeCandidate(buffer, encoding);
    return { encoding, text, score: decodeScore(text) };
  });
  candidates.sort((a, b) => a.score - b.score);
  return { text: candidates[0].text, encoding: candidates[0].encoding };
}

function readCsvFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return decodeCsvBuffer(buffer);
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function sqlNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return "NULL";
  const num = Number(text.replace(/,/g, ""));
  return Number.isFinite(num) ? String(num) : "NULL";
}

function norm(value) {
  return String(value || "").replace(/\s/g, "").toLowerCase();
}

function headerMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const key = norm(header);
    if (key) map[key] = index;
  });
  return map;
}

function indexOfHeader(map, names, fallback = -1) {
  for (const name of names) {
    const index = map[norm(name)];
    if (index != null) return index;
  }
  return fallback;
}

function cell(row, map, names, fallbackIndex = -1) {
  const index = indexOfHeader(map, names, fallbackIndex);
  return index >= 0 ? row[index] || "" : "";
}

function rowObject(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [header || `_col${index}`, row[index] || ""]));
}

function rawJsonValue(headers, row) {
  return sqlValue(JSON.stringify(rowObject(headers, row)));
}

function phoneInfo(phone) {
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  return {
    hash: digits ? crypto.createHash("sha256").update(digits).digest("hex") : "",
    last4: digits.slice(-4)
  };
}

function isTruthy(value) {
  return /^(true|1|y|yes|on|active|enabled|활성|사용)$/i.test(String(value || "").trim());
}

function headerKey(label, ordinal) {
  const ascii = String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ascii || `col_${ordinal}`;
}

function detectCompetitionCode(value, fallback = "") {
  const source = String(value || fallback || "").toUpperCase();
  return KNOWN_CODES.find((code) => source.includes(code)) || source.trim();
}

function detectSheet(sheetName) {
  const n = norm(sheetName);
  if (n === "config") return "config";
  if (n === "participants" || n === "participant" || n.includes("participant") || n.includes("선수등록")) return "participants";
  if (n === "operators" || n.includes("operator") || n === "운영탭" || n.includes("운영탭")) return "operators";
  if (n.includes("scores_")) return "scores";
  return "unknown";
}

function detectAuxType(sheetName) {
  const n = norm(sheetName);
  if (n.includes("ikrc") && (n.includes("seedtocup") || n.includes("seed") || n.includes("시드"))) return "IKRC_SEED_MATCH";
  if (n.includes("ikrc") && (n.includes("calibration") || n.includes("calib") || n.includes("켈리") || n.includes("캘리"))) return "IKRC_CAL_CHECK";
  if (n.includes("mob") && (n.includes("calibration") || n.includes("calib") || n.includes("켈리") || n.includes("캘리"))) return "MOB_CAL_CHECK";
  return "";
}

function filePriority(file) {
  const sheetName = path.basename(file, ".csv");
  const type = detectSheet(sheetName);
  if (type === "config") return 0;
  if (type === "operators") return 1;
  if (type === "participants") return 2;
  if (type === "scores") return 3;
  return 4;
}

function emitParticipantIdentifiers(sheetName, rowNumber, values) {
  for (const [identifierType, identifier] of values) {
    if (!identifier) continue;
    bodySql.push(`INSERT OR IGNORE INTO participant_identifiers (participant_id,identifier,identifier_type)
SELECT id,${sqlValue(identifier)},${sqlValue(identifierType)} FROM participants WHERE legacy_sheet_name=${sqlValue(sheetName)} AND legacy_row_index=${rowNumber} ORDER BY id DESC LIMIT 1;`);
  }
}

function emitSubmissionValues(headers, row, sheetName, rowNumber) {
  headers.forEach((label, ordinal) => {
    const value = row[ordinal] || "";
    bodySql.push(`INSERT OR IGNORE INTO submission_values (submission_id,header_key,header_label,value_text,value_number,ordinal)
SELECT id,${sqlValue(headerKey(label, ordinal))},${sqlValue(label || `_col${ordinal}`)},${sqlValue(value)},${sqlNumber(value)},${ordinal}
FROM submissions WHERE legacy_sheet_name=${sqlValue(sheetName)} AND legacy_row_index=${rowNumber} ORDER BY id DESC LIMIT 1;`);
  });
}

function insertMetaRow(file, row, rowNumber, headers, sheetName) {
  const isInternal = row[0] === "__META__";
  const metaType = isInternal ? String(row[3] || "") : detectAuxType(sheetName);
  const raw = rawJsonValue(headers, row);
  const legacy = sqlValue(sheetName);

  if (metaType === "IKRC_SEED_MATCH") {
    const code = String(isInternal ? row[1] : row[1] || "IKRC").toUpperCase();
    const matchNo = isInternal ? row[5] : row[3];
    if (code !== "IKRC" || !matchNo) {
      report.warnings.push({ file, row: rowNumber, message: "Invalid IKRC seed match meta row" });
      return true;
    }
    const participantA = isInternal
      ? { targetType: row[7] || "", targetValue: row[8] || "", label: row[9] || "" }
      : { targetType: row[5] || "", targetValue: row[6] || "", label: row[7] || "" };
    const participantB = isInternal
      ? { targetType: row[10] || "", targetValue: row[11] || "", label: row[12] || "" }
      : { targetType: row[8] || "", targetValue: row[9] || "", label: row[10] || "" };
    const status = isInternal ? row[6] : row[4];
    const memo = isInternal ? row[13] : row[11];
    bodySql.push(`INSERT OR IGNORE INTO ikrc_seed_matches (competition_id,match_no,participant_a_json,participant_b_json,memo,status,legacy_row_index,legacy_sheet_name)
SELECT id,${sqlValue(matchNo)},${sqlValue(JSON.stringify(participantA))},${sqlValue(JSON.stringify(participantB))},${sqlValue(memo || "")},${sqlValue(status || "draft")},${rowNumber},${legacy} FROM competitions WHERE code=${sqlValue("IKRC")};`);
    report.counters.metaRows++;
    return true;
  }

  if (metaType === "IKRC_CAL_CHECK") {
    const code = String(isInternal ? row[1] : row[1] || "IKRC").toUpperCase();
    const checkedAt = isInternal ? row[4] : row[0];
    const team = isInternal ? row[5] : row[3];
    const sampleNo = isInternal ? row[6] : row[4];
    const checkerName = isInternal ? row[7] : row[5];
    const checkerRole = isInternal ? row[8] : row[6];
    if (code !== "IKRC" || !sampleNo) {
      report.warnings.push({ file, row: rowNumber, message: "Invalid IKRC calibration meta row" });
      return true;
    }
    bodySql.push(`INSERT OR IGNORE INTO ikrc_calibration_checks (competition_id,sample_no,team,checker_name,checker_role,checked_at,legacy_row_index,legacy_sheet_name,raw_json)
SELECT id,${sqlValue(sampleNo)},${sqlValue(team || "")},${sqlValue(checkerName || "")},${sqlValue(checkerRole || "")},${sqlValue(checkedAt || new Date().toISOString())},${rowNumber},${legacy},${raw} FROM competitions WHERE code=${sqlValue("IKRC")};`);
    report.counters.metaRows++;
    return true;
  }

  if (metaType === "MOB_CAL_CHECK") {
    const code = String(isInternal ? row[1] : row[1] || "MOB").toUpperCase();
    const checkedAt = isInternal ? row[4] : row[0];
    const team = isInternal ? row[5] : row[3];
    const category = isInternal ? row[6] : row[4];
    const participantNo = isInternal ? row[7] : row[5];
    const checkerName = isInternal ? row[8] : row[6];
    const checkerRole = isInternal ? row[9] : row[7];
    if (code !== "MOB" || !participantNo) {
      report.warnings.push({ file, row: rowNumber, message: "Invalid MOB calibration meta row" });
      return true;
    }
    bodySql.push(`INSERT OR IGNORE INTO mob_calibration_checks (competition_id,participant_no,team,category,checker_name,checker_role,checked_at,legacy_row_index,legacy_sheet_name,raw_json)
SELECT id,${sqlValue(participantNo)},${sqlValue(team || "")},${sqlValue(category || "")},${sqlValue(checkerName || "")},${sqlValue(checkerRole || "")},${sqlValue(checkedAt || new Date().toISOString())},${rowNumber},${legacy},${raw} FROM competitions WHERE code=${sqlValue("MOB")};`);
    report.counters.metaRows++;
    return true;
  }

  return false;
}

function shouldImportParticipant(values) {
  return Boolean(
    values.name ||
    values.teamName ||
    values.teamNo ||
    values.phone.hash ||
    values.uniqueNo ||
    values.prelimCup ||
    values.mainCup ||
    values.finalCup ||
    values.cupNo ||
    values.sampleNo
  );
}

function hasUnclosedQuote(statement) {
  let inString = false;
  for (let i = 0; i < statement.length; i++) {
    if (statement[i] !== "'") continue;
    if (statement[i + 1] === "'") {
      i++;
      continue;
    }
    inString = !inString;
  }
  return inString;
}

function splitSqlStatements(sqlText) {
  const statements = [];
  let current = "";
  let inString = false;
  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    current += ch;
    if (ch === "'") {
      if (sqlText[i + 1] === "'") {
        current += sqlText[i + 1];
        i++;
      } else {
        inString = !inString;
      }
    } else if (ch === ";" && !inString) {
      statements.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) statements.push(current.trim());
  return { statements, inStringAtEnd: inString };
}

function lineNumberAt(sqlText, index) {
  return sqlText.slice(0, index).split(/\n/).length;
}

function validateRemoteSql(sqlText) {
  const errors = [];
  const warnings = [];
  const disallowed = /\b(BEGIN\s+TRANSACTION|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/gi;
  for (const match of sqlText.matchAll(disallowed)) {
    errors.push({ line: lineNumberAt(sqlText, match.index || 0), message: `Remote SQL contains disallowed transaction keyword: ${match[1]}` });
  }
  const placeholder = /\bVALUES\s*\([^;]*\?/gis;
  for (const match of sqlText.matchAll(placeholder)) {
    errors.push({ line: lineNumberAt(sqlText, match.index || 0), message: "Remote SQL contains VALUES placeholder '?'" });
  }
  const mojibakeError = /�/g;
  for (const match of sqlText.matchAll(mojibakeError)) {
    errors.push({ line: lineNumberAt(sqlText, match.index || 0), message: "Remote SQL contains Unicode replacement character" });
  }
  const mojibakeWarning = /(?:\?덉꽑|源\?|源|몄뿽|붽컙|而ㅽ|怨꾩|寃곗|珥앹|理쒖|쇱꽌|ㅻ뱶)/g;
  for (const match of sqlText.matchAll(mojibakeWarning)) {
    warnings.push({ line: lineNumberAt(sqlText, match.index || 0), message: `Possible mojibake near '${match[0]}'` });
  }
  const { statements, inStringAtEnd } = splitSqlStatements(sqlText);
  if (inStringAtEnd) errors.push({ message: "Remote SQL ended while inside a string literal" });
  statements.forEach((statement, index) => {
    if (hasUnclosedQuote(statement)) {
      errors.push({ statement: index + 1, message: "Statement has unbalanced single quotes" });
    }
    if (!statement.endsWith(";")) {
      errors.push({ statement: index + 1, message: "Statement is missing a semicolon" });
    }
  });
  return { errors, warnings };
}

const files = fs.readdirSync(inputDir)
  .filter((file) => file.toLowerCase().endsWith(".csv"))
  .sort((a, b) => filePriority(a) - filePriority(b) || a.localeCompare(b));

for (const file of files) {
  const full = path.join(inputDir, file);
  const decoded = readCsvFile(full);
  report.encodingUsed[file] = decoded.encoding;
  const rows = csvParse(decoded.text);
  if (!rows.length) continue;

  const headers = rows[0];
  const map = headerMap(headers);
  const sheetName = path.basename(file, ".csv");
  const type = detectSheet(sheetName);
  const auxType = detectAuxType(sheetName);
  const reportType = auxType || type;
  report.files.push({ file, type: reportType, rows: rows.length - 1, encodingUsed: decoded.encoding });

  if (type === "unknown" && !auxType) {
    report.warnings.push({ file, message: "Unknown CSV type. File was skipped instead of being treated as config." });
    continue;
  }

  if (type === "config") {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const code = detectCompetitionCode(cell(row, map, ["competition_code", "competition", "code", "대회코드", "대회"], 0));
      if (!code) continue;
      const name = cell(row, map, ["name", "competition_name", "대회명"], 1) || code;
      const round = cell(row, map, ["current_round", "currentround", "round", "현재라운드"], 3);
      const legacy = cell(row, map, ["score_sheet_name", "sheet_name", "sheetname", "legacy_sheet_name", "시트명"], 4) || code;
      const active = isTruthy(cell(row, map, ["is_active", "active", "활성", "사용여부"], 2));
      const debrief = isTruthy(cell(row, map, ["debriefing_active", "debriefing_enabled", "debriefing", "디브리핑"], 5));
      const sms = cell(row, map, ["sms_prefix", "smsprefix", "sms"], 6);
      bodySql.push(`INSERT OR IGNORE INTO competitions (code,name,is_active,current_round,legacy_sheet_name,debriefing_enabled,sms_prefix) VALUES (${sqlValue(code)},${sqlValue(name)},${active ? 1 : 0},${sqlValue(round)},${sqlValue(legacy)},${debrief ? 1 : 0},${sqlValue(sms)});`);
      report.counters.competitions++;
    }
    continue;
  }

  if (type === "operators") {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = cell(row, map, ["name", "operator_name", "judge_name", "이름", "성명"], 1);
      const phone = phoneInfo(cell(row, map, ["phone", "mobile", "tel", "연락처", "핸드폰번호", "휴대폰번호", "전화번호"], 3));
      if (!name || !phone.hash) {
        report.warnings.push({ file, row: i + 1, message: "Operator name or phone is missing" });
        continue;
      }
      const accountType = cell(row, map, ["account_type", "accounttype", "type", "계정구분", "구분"], 0) || "JUDGE";
      const affiliation = cell(row, map, ["affiliation", "company", "소속"], 2);
      const access = cell(row, map, ["access", "competition_access", "competition", "담당대회", "대회"], 4);
      const teamGroup = cell(row, map, ["team_group", "teamgroup", "team", "팀구분", "심사팀"], 5);
      const role = cell(row, map, ["role", "judge_role", "역할"], 6);
      bodySql.push(`INSERT INTO operators (account_type,name,affiliation,phone_hash,phone_last4,role,team_group,legacy_row_index,legacy_sheet_name) VALUES (${sqlValue(accountType)},${sqlValue(name)},${sqlValue(affiliation)},${sqlValue(phone.hash)},${sqlValue(phone.last4)},${sqlValue(role)},${sqlValue(teamGroup)},${i + 1},${sqlValue(sheetName)});`);
      const permissionCodes = String(access || "")
        .split(/[;,/|]+/)
        .map((value) => detectCompetitionCode(value))
        .filter((value) => KNOWN_CODES.includes(value));
      for (const code of permissionCodes) {
        bodySql.push(`INSERT OR IGNORE INTO operator_permissions (operator_id,competition_code,role,team_group)
SELECT id,${sqlValue(code)},${sqlValue(role)},${sqlValue(teamGroup)} FROM operators WHERE name=${sqlValue(name)} AND phone_hash=${sqlValue(phone.hash)} ORDER BY id DESC LIMIT 1;`);
      }
      report.counters.operators++;
    }
    continue;
  }

  if (type === "participants") {
    let insertedForFile = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const code = detectCompetitionCode(cell(row, map, ["competition_code", "competition", "code", "대회코드", "대회"], 0), sheetName);
      if (!KNOWN_CODES.includes(code)) {
        report.warnings.push({ file, row: i + 1, message: "Participant competition code is missing", inferred: code });
        continue;
      }
      const phone = phoneInfo(cell(row, map, ["phone", "mobile", "tel", "핸드폰번호", "휴대폰번호", "전화번호", "연락처"], 3));
      const name = cell(row, map, ["name", "participant_name", "player_name", "이름", "성명", "선수명", "참가자명"], 1);
      const teamName = cell(row, map, ["team_name", "teamname", "team", "팀명"], -1);
      const teamNo = cell(row, map, ["team_no", "teamno", "팀번호"], -1);
      const affiliation = cell(row, map, ["affiliation", "company", "소속"], 2);
      const uniqueNo = cell(row, map, ["unique_no", "uniqueno", "participant_no", "player_no", "고유번호", "선수번호", "참가자번호"], 4);
      const prelimCup = cell(row, map, ["prelim_cup_no", "prelimcupno", "예선컵번호"], 5);
      const mainCup = cell(row, map, ["main_cup_no", "maincupno", "본선컵번호"], 6);
      const finalCup = cell(row, map, ["final_cup_no", "finalcupno", "결선컵번호"], 7);
      const explicitCup = cell(row, map, ["cup_no", "cupno", "컵번호"], -1);
      const sampleNo = cell(row, map, ["sample_no", "sampleno", "sample", "샘플번호"], 8);
      const cupNo = explicitCup || finalCup || mainCup || prelimCup;
      const values = { name, teamName, teamNo, phone, uniqueNo, prelimCup, mainCup, finalCup, cupNo, sampleNo };
      if (!shouldImportParticipant(values)) continue;

      bodySql.push(`INSERT INTO participants (competition_id,name,team_name,team_no,affiliation,phone_hash,phone_last4,unique_no,prelim_cup_no,main_cup_no,final_cup_no,cup_no,sample_no,legacy_row_index,legacy_sheet_name,raw_json)
SELECT id,${sqlValue(name)},${sqlValue(teamName)},${sqlValue(teamNo)},${sqlValue(affiliation)},${sqlValue(phone.hash)},${sqlValue(phone.last4)},${sqlValue(uniqueNo)},${sqlValue(prelimCup)},${sqlValue(mainCup)},${sqlValue(finalCup)},${sqlValue(cupNo)},${sqlValue(sampleNo)},${i + 1},${sqlValue(sheetName)},${rawJsonValue(headers, row)} FROM competitions WHERE code=${sqlValue(code)};`);
      emitParticipantIdentifiers(sheetName, i + 1, [
        ["unique_no", uniqueNo],
        ["prelim_cup_no", prelimCup],
        ["main_cup_no", mainCup],
        ["final_cup_no", finalCup],
        ["cup_no", cupNo],
        ["sample_no", sampleNo],
        ["team_no", teamNo],
        ["team_name", teamName]
      ]);
      report.counters.participants++;
      insertedForFile++;
    }
    if (insertedForFile === 0) {
      report.errors.push({ file, message: "Participants CSV was detected but produced 0 participant rows." });
    }
    continue;
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[0] === "__META__" || auxType) {
      if (!insertMetaRow(file, row, i + 1, headers, sheetName)) {
        report.warnings.push({ file, row: i + 1, message: "Unsupported meta row", metaType: row[3] || auxType });
      }
      continue;
    }

    const code = detectCompetitionCode(cell(row, map, ["competition_code", "competition", "code", "대회코드", "대회"], 1), sheetName);
    if (!KNOWN_CODES.includes(code)) {
      report.warnings.push({ file, row: i + 1, message: "Submission competition code is missing", inferred: code });
      continue;
    }
    const submittedAt = cell(row, map, ["submitted_at", "timestamp", "time", "제출시각", "타임스탬프"], 0) || new Date().toISOString();
    const round = cell(row, map, ["round", "current_round", "라운드"], 2);
    const judgeName = cell(row, map, ["judge_name", "checker_name", "name", "심사위원", "검수자", "이름"], 3);
    const judgeTeam = cell(row, map, ["judge_team", "team", "심사팀", "팀"], 4);
    const judgeRole = cell(row, map, ["judge_role", "role", "역할"], 5);
    const mode = cell(row, map, ["mode", "evaluation_mode", "모드"], 6);
    const participantKey = cell(row, map, ["participant_key", "participant_no", "player_no", "sample_no", "cup_no", "참가자번호", "선수번호", "샘플번호", "컵번호"], 7);
    const participantName = cell(row, map, ["participant_name", "player_name", "선수명", "참가자명"], -1);
    const teamName = cell(row, map, ["team_name", "teamname", "팀명"], -1);
    const total = cell(row, map, ["total_score", "total", "총점"], -1);
    const finalScore = cell(row, map, ["final_score", "finalscore", "최종점수"], -1);
    const status = cell(row, map, ["review_status", "status", "검수상태"], -1) || row[row.length - 1] || "pending";
    const disqualified = isTruthy(cell(row, map, ["disqualified", "dq", "실격여부"], -1));
    const disqReason = cell(row, map, ["disqualification_reason", "dq_reason", "실격사유"], -1);
    bodySql.push(`INSERT INTO submissions (competition_id,submitted_at,competition_code,round,judge_name,judge_team,judge_role,mode,participant_key,participant_name,team_name,total_score,final_score,review_status,disqualified,disqualification_reason,legacy_row_index,legacy_sheet_name,raw_json)
SELECT id,${sqlValue(submittedAt)},${sqlValue(code)},${sqlValue(round)},${sqlValue(judgeName)},${sqlValue(judgeTeam)},${sqlValue(judgeRole)},${sqlValue(mode)},${sqlValue(participantKey)},${sqlValue(participantName)},${sqlValue(teamName)},${sqlNumber(total)},${sqlNumber(finalScore)},${sqlValue(status)},${disqualified ? 1 : 0},${sqlValue(disqReason)},${i + 1},${sqlValue(sheetName)},${rawJsonValue(headers, row)} FROM competitions WHERE code=${sqlValue(code)};`);
    emitSubmissionValues(headers, row, sheetName, i + 1);
    report.counters.submissions++;
  }
}

const localSql = ["PRAGMA foreign_keys = ON;", "BEGIN TRANSACTION;", ...bodySql, "COMMIT;"].join("\n") + "\n";
const remoteSql = bodySql.join("\n") + "\n";
const remoteValidation = validateRemoteSql(remoteSql);
report.remoteSqlGenerated = true;
report.remoteSqlValidationErrors = remoteValidation.errors;
report.remoteSqlValidationWarnings = remoteValidation.warnings;
if (remoteValidation.errors.length) {
  report.errors.push({ file: remoteSqlPath, message: "Remote SQL validation failed", count: remoteValidation.errors.length });
}

fs.writeFileSync(outSql, localSql, "utf8");
fs.writeFileSync(remoteSqlPath, remoteSql, "utf8");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(`Wrote ${outSql}`);
console.log(`Wrote ${remoteSqlPath}`);
console.log(`Wrote ${reportPath}`);
if (remoteValidation.errors.length) {
  console.error(`Remote SQL validation failed: ${remoteValidation.errors.length} error(s)`);
  process.exitCode = 1;
}
