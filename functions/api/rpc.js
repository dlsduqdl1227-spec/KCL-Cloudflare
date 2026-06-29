const COMPETITION_CODES = ['KBC', 'KTCC', 'MOC', 'MOB', 'KCR', 'IKRC', 'KCAC'];
const COMPETITION_NAMES = {
  KBC: 'Korea Barista Championship',
  KTCC: 'Korea Team Cupping Championship',
  MOC: 'Master of Cupping',
  MOB: 'Master of Brewing',
  KCR: 'Korea Coffee Roasting',
  IKRC: 'IKAWA Korea Roasting Championship',
  KCAC: 'Korea Coffee Art Championship'
};

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    await ensureSchema(env.DB);
    await ensureDefaultData(env);
    const body = await request.json();
    const action = String(body.action || body.method || '').trim();
    const args = Array.isArray(body.args) ? body.args : [];
    if (!action) return json({ success: false, message: 'action이 없습니다.' }, 400);

    const result = await dispatch(action, args, env, request);
    return json(result);
  } catch (err) {
    return json({ success: false, message: String(err && err.stack ? err.stack : err) }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data || {}), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() }
  });
}
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
function safeStr(v) { return String(v ?? '').trim(); }
function normalizePhone(v) { return String(v ?? '').replace(/[^0-9]/g, ''); }
function nowIso() { return new Date().toISOString(); }
function uuid() { return crypto.randomUUID().replace(/-/g, ''); }
function boolInt(v) { return v ? 1 : 0; }
function parseJson(v, fallback = {}) { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } }

async function ensureSchema(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS competitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      current_round TEXT DEFAULT '예선',
      sheet_name TEXT,
      debriefing INTEGER NOT NULL DEFAULT 0,
      sms_prefix TEXT,
      option_settings TEXT DEFAULT '{}',
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_type TEXT NOT NULL DEFAULT 'JUDGE',
      name TEXT NOT NULL,
      affiliation TEXT,
      phone TEXT NOT NULL,
      access TEXT DEFAULT '',
      team_group TEXT DEFAULT '',
      role TEXT DEFAULT '센서리 심사위원',
      created_at TEXT,
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_code TEXT NOT NULL,
      name TEXT,
      affiliation TEXT,
      phone TEXT,
      unique_no TEXT,
      prelim_cup_no TEXT,
      main_cup_no TEXT,
      final_cup_no TEXT,
      cup_no TEXT,
      sample_no TEXT,
      team_name TEXT,
      team_no TEXT,
      extra_json TEXT DEFAULT '{}',
      created_at TEXT,
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submitted_at TEXT NOT NULL,
      competition_code TEXT NOT NULL,
      round TEXT,
      judge_name TEXT,
      team TEXT,
      role TEXT,
      mode TEXT,
      unit TEXT,
      participant_name TEXT,
      total_score REAL,
      disqualified INTEGER NOT NULL DEFAULT 0,
      disqualification_reason TEXT,
      review_status TEXT NOT NULL DEFAULT '미검수',
      payload_json TEXT NOT NULL,
      signature_data TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_code TEXT,
      name TEXT,
      phone TEXT,
      otp TEXT,
      expires_at TEXT,
      used_at TEXT,
      created_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_scores_comp ON scores(competition_code, round)`,
    `CREATE INDEX IF NOT EXISTS idx_participants_comp ON participants(competition_code)`,
    `CREATE INDEX IF NOT EXISTS idx_operators_phone ON operators(name, phone)`
  ];
  for (const sql of statements) await db.prepare(sql).run();
}

async function ensureDefaultData(env) {
  const db = env.DB;
  const count = await db.prepare('SELECT COUNT(*) AS n FROM competitions').first();
  if (!count || Number(count.n) === 0) {
    for (const code of COMPETITION_CODES) {
      await db.prepare(`INSERT INTO competitions (code, name, is_active, current_round, sheet_name, debriefing, sms_prefix, option_settings, updated_at)
        VALUES (?, ?, 1, '예선', ?, 0, ?, '{}', ?)`)
        .bind(code, COMPETITION_NAMES[code] || code, code, code, nowIso()).run();
    }
  }
  const adminName = safeStr(env.KCL_ADMIN_NAME);
  const adminPhone = normalizePhone(env.KCL_ADMIN_PHONE);
  if (adminName && adminPhone) {
    const found = await db.prepare('SELECT id FROM operators WHERE name=? AND phone=?').bind(adminName, adminPhone).first();
    if (!found) {
      await db.prepare(`INSERT INTO operators (account_type, name, affiliation, phone, access, team_group, role, created_at, updated_at)
        VALUES ('ADMIN', ?, ?, ?, 'ALL', '', '관리자', ?, ?)`)
        .bind(adminName, safeStr(env.KCL_ADMIN_AFFILIATION), adminPhone, nowIso(), nowIso()).run();
    }
  }
}

async function dispatch(action, args, env) {
  const handlers = {
    ping: async () => ({ success: true, message: 'KCL Cloudflare API 연결 성공', now: nowIso() }),
    getConfig: () => getConfig(env),
    judgeLogin: () => judgeLogin(env, args[0], args[1]),
    getAdminConsoleData: () => getAdminConsoleData(env, args[0]),
    updateCompetitionAdminSettings: () => updateCompetitionAdminSettings(env, args[0], args[1]),
    upsertOperatorAccount: () => upsertOperatorAccount(env, args[0], args[1]),
    deleteOperatorAccount: () => deleteOperatorAccount(env, args[0], args[1]),
    getParticipantAssignments: () => getParticipantAssignments(env, args[0], args[1]),
    submitScores: () => submitScores(env, args[0], null),
    submitWithSignature: () => submitScores(env, args[0], args[1]),
    getReviewList: () => getReviewList(env, args[0], args[1]),
    updateReviewRow: () => updateReviewRow(env, args[0], args[1], args[2], args[3], args[4], args[5]),
    updateReviewStatus: () => updateReviewStatus(env, args[0], [args[1]], args[2], args[3], args[4]),
    updateReviewStatusBatch: () => updateReviewStatus(env, args[0], args[1], args[2], args[3], args[4]),
    deleteReviewRow: () => deleteReviewRow(env, args[0], args[1], args[2]),
    getRanking: () => getRanking(env, args[0], args[1]),
    getRankingDetail: () => getRankingDetail(env, args[0], args[1], args[2], args[3]),
    sendOTP: () => sendOTP(env, args[0], args[1], args[2], args[3]),
    verifyOTP: () => verifyOTP(env, args[0], args[1], args[2], args[3], args[4]),
    createDebriefPdfFromPayload: () => ({ success: false, message: 'PDF 생성은 v2 2단계에서 Workers PDF 서비스로 연결 예정입니다.' }),
    createRankingDetailPdf: () => ({ success: false, message: 'PDF 생성은 v2 2단계에서 Workers PDF 서비스로 연결 예정입니다.' }),
    generateCuppingComment: () => generateCuppingComment(args[0]),
    generateKbcComment: () => generateKbcComment(args[0]),
    generateKcacComment: () => generateKcacComment(args[0]),
    generateMobComment: () => generateMobComment(args[0]),
    generateIkrcComment: () => generateIkrcComment(args[0]),
    getMobCalibrationParticipantNumbers: async () => ({ success: true, numbers: [] }),
    markMobCalibrationChecked: async () => ({ success: true, message: '확인 처리되었습니다.' }),
    getIkrcSeedToCupConsole: async () => ({ success: true, matches: [], results: [] }),
    saveIkrcSeedToCupMatch: async () => ({ success: true, message: '저장되었습니다.' }),
    updateIkrcSeedToCupResult: async () => ({ success: true, message: '저장되었습니다.' }),
    markIkrcCalibrationChecked: async () => ({ success: true, message: '확인 처리되었습니다.' }),
    cleanupCompetitionSheetTabs: async () => ({ success: true, message: 'Cloudflare v2에서는 보조 시트 정리가 필요 없습니다.', hiddenSheets: [] })
  };
  if (!handlers[action]) return { success: false, message: '아직 v2에 구현되지 않은 기능입니다: ' + action };
  return handlers[action]();
}

async function getConfig(env) {
  const rows = await env.DB.prepare('SELECT * FROM competitions ORDER BY id').all();
  return { success: true, configs: (rows.results || []).map(rowToConfig) };
}
function rowToConfig(r) {
  return {
    rowIndex: r.id,
    code: r.code,
    name: r.name,
    isActive: !!r.is_active,
    currentRound: r.current_round || '',
    sheetName: r.sheet_name || r.code,
    debriefing: !!r.debriefing,
    smsPrefix: r.sms_prefix || r.code,
    optionSettings: parseJson(r.option_settings, {})
  };
}

async function judgeLogin(env, name, phone) {
  name = safeStr(name); phone = normalizePhone(phone);
  if (!name) return { success: false, message: '이름을 입력해주세요.' };
  if (!phone) return { success: false, message: '연락처를 입력해주세요.' };
  const rows = await env.DB.prepare('SELECT * FROM operators WHERE name=? AND phone=? ORDER BY id').bind(name, phone).all();
  const list = rows.results || [];
  if (!list.length) return { success: false, message: '등록된 정보를 찾을 수 없습니다. 이름과 연락처를 확인해주세요.' };
  const admin = list.find(x => String(x.account_type).toUpperCase() === 'ADMIN' || x.role === '관리자');
  const primary = admin || list[0];
  const accessSet = new Set();
  const teamMap = {}, roleMap = {};
  for (const row of list) {
    const access = String(row.access || '').toUpperCase();
    if (access === 'ALL') accessSet.add('ALL');
    else access.split(/[;,/|]+/).map(x => x.trim()).filter(Boolean).forEach(code => {
      accessSet.add(code); if (row.team_group) teamMap[code] = row.team_group; if (row.role) roleMap[code] = row.role;
    });
  }
  const result = {
    success: true,
    name: primary.name,
    affiliation: primary.affiliation || '',
    phone,
    type: admin ? 'ADMIN' : (primary.account_type || 'JUDGE'),
    accountType: admin ? 'ADMIN' : (primary.account_type || 'JUDGE'),
    role: admin ? '관리자' : (primary.role || '센서리 심사위원'),
    access: admin ? 'ALL' : Array.from(accessSet).join(','),
    teamGroup: primary.team_group || '',
    teamMap,
    roleMap
  };
  result.judgeToken = await issueSession(env, 'judge', result, 21600);
  return result;
}
async function issueSession(env, kind, payload, seconds) {
  const token = uuid();
  const expires = new Date(Date.now() + seconds * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token, kind, payload_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, kind, JSON.stringify(payload), expires, nowIso()).run();
  return token;
}
async function getActor(env, actor) {
  if (!actor) return null;
  if (actor.judgeToken) {
    const row = await env.DB.prepare('SELECT payload_json FROM sessions WHERE token=? AND expires_at > ?').bind(actor.judgeToken, nowIso()).first();
    return row ? parseJson(row.payload_json, null) : null;
  }
  return actor;
}
function hasAdmin(actor) { return actor && (actor.type === 'ADMIN' || actor.accountType === 'ADMIN' || actor.role === '관리자' || actor.access === 'ALL'); }
function hasAccess(actor, code) {
  if (!actor) return false;
  if (hasAdmin(actor)) return true;
  const access = String(actor.access || '').toUpperCase();
  return access.split(/[;,/|]+/).includes(String(code || '').toUpperCase());
}

async function getAdminConsoleData(env, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!actor || (!hasAdmin(actor) && actor.type !== 'TEAMLEAD')) return { success: false, message: '관리 권한이 없습니다.' };
  const cfg = await getConfig(env);
  const rows = await env.DB.prepare('SELECT * FROM operators ORDER BY id').all();
  return {
    success: true,
    configs: cfg.configs,
    accounts: (rows.results || []).map(r => ({
      rowIndex: r.id,
      accountType: r.account_type,
      type: r.account_type,
      name: r.name,
      affiliation: r.affiliation || '',
      phone: r.phone || '',
      access: r.access || '',
      teamGroup: r.team_group || '',
      role: r.role || ''
    }))
  };
}

async function updateCompetitionAdminSettings(env, payload, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!actor || (!hasAdmin(actor) && actor.type !== 'TEAMLEAD')) return { success: false, message: '대회 설정 권한이 없습니다.' };
  const code = safeStr(payload && payload.code).toUpperCase();
  if (!code) return { success: false, message: '대회코드가 없습니다.' };
  const current = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind(code).first();
  if (!current) return { success: false, message: '대회를 찾을 수 없습니다: ' + code };
  await env.DB.prepare(`UPDATE competitions SET name=?, current_round=?, is_active=?, debriefing=?, option_settings=?, updated_at=? WHERE code=?`)
    .bind(
      safeStr(payload.name) || current.name,
      safeStr(payload.currentRound) || current.current_round || '',
      boolInt(!!payload.isActive),
      boolInt(!!payload.debriefing),
      JSON.stringify(payload.optionSettings || parseJson(current.option_settings, {})),
      nowIso(), code
    ).run();
  return { success: true, message: '저장 완료' };
}

async function upsertOperatorAccount(env, payload, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success: false, message: '계정 관리 권한이 없습니다.' };
  const id = Number(payload && (payload.rowIndex || payload.row));
  const data = {
    accountType: safeStr(payload.accountType || payload.type || 'JUDGE').toUpperCase(),
    name: safeStr(payload.name),
    phone: normalizePhone(payload.phone),
    affiliation: safeStr(payload.affiliation || payload.affil),
    access: safeStr(payload.access || ''),
    teamGroup: safeStr(payload.teamGroup || payload.team || ''),
    role: safeStr(payload.role || '센서리 심사위원')
  };
  if (!data.name || !data.phone) return { success: false, message: '이름과 연락처를 입력해주세요.' };
  if (id) {
    await env.DB.prepare(`UPDATE operators SET account_type=?, name=?, affiliation=?, phone=?, access=?, team_group=?, role=?, updated_at=? WHERE id=?`)
      .bind(data.accountType, data.name, data.affiliation, data.phone, data.access, data.teamGroup, data.role, nowIso(), id).run();
  } else {
    await env.DB.prepare(`INSERT INTO operators (account_type, name, affiliation, phone, access, team_group, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(data.accountType, data.name, data.affiliation, data.phone, data.access, data.teamGroup, data.role, nowIso(), nowIso()).run();
  }
  return { success: true, message: '저장 완료' };
}
async function deleteOperatorAccount(env, rowIndex, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success: false, message: '계정 삭제 권한이 없습니다.' };
  await env.DB.prepare('DELETE FROM operators WHERE id=?').bind(Number(rowIndex)).run();
  return { success: true, message: '삭제 완료' };
}

async function getParticipantAssignments(env, competitionCode, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const actor = await getActor(env, actorArg);
  if (!hasAccess(actor, code)) return { success: false, message: '이 대회 참가자 목록 조회 권한이 없습니다.' };
  const rows = await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY id').bind(code).all();
  const assignments = (rows.results || []).map(r => {
    const number = r.final_cup_no || r.main_cup_no || r.prelim_cup_no || r.cup_no || r.unique_no || r.team_no || String(r.id);
    const displayName = code === 'KTCC' ? (r.team_name || r.name || '') : (r.name || '');
    return {
      rowIndex: r.id,
      competitionCode: code,
      number,
      name: displayName,
      affiliation: r.affiliation || '',
      teamName: r.team_name || '',
      teamNo: r.team_no || '',
      uniqueNo: r.unique_no || '',
      roundCupNo: r.final_cup_no || r.main_cup_no || r.prelim_cup_no || r.cup_no || '',
      sampleNo: r.sample_no || '',
      display: (number ? ((code === 'KTCC' ? '팀 ' : '참가자 ') + number) : '번호 미지정') + (displayName ? ' · ' + displayName : '') + (r.affiliation ? ' · ' + r.affiliation : '')
    };
  });
  return { success: true, competitionCode: code, assignments };
}


function expectedHeadersForCompetition(code) {
  const meta = ['제출시간','대회코드','라운드','심사위원명','팀','역할','모드'];
  code = safeStr(code).toUpperCase();
  let data = [];
  if (code === 'KCR') data = ['컵번호','프로세스','Flavor(플레이버)','Flavor 강도','Aftertaste(에프터테이스트)','Aftertaste 지속성','Acidity(산미)','Acidity 강도','Body(바디)','Body 강도','Sweetness(스윗니스) ×2','Sweetness 강도','Overall(주관적 종합평가)','종합코멘트','총점','실격여부','실격사유','검수상태','Flavor 스마트태그','Aftertaste 스마트태그','Acidity 스마트태그','Body 스마트태그','Sweetness 스마트태그'];
  else if (code === 'KCAC') data = ['참가자번호','선수명','우유종류','잔용도','우유명','예선 Pattern Completion(패턴 완성도)','예선 Pattern Balance(패턴 균형)','예선 Surface Quality(표면 품질)','예선 Position & Proportion(위치와 비율)','예선 Pattern Definition(패턴 선명도)','결선 Theme Expression(주제 표현력)','결선 Technical Execution(작업 수행 완성도)','결선 Cleanliness(청결)','결선 Taste Balance(맛의 균형)','결선 Mouthfeel(질감)','결선 Presentation(프레젠테이션)','결선 Surface Quality(표면 품질)','결선 Position & Symmetry(위치와 대칭)','결선 Design Completion(디자인 완성도)','소계','감점','최종점수','가이드URL','종합코멘트','실격여부','실격사유','검수상태','패턴종류','리프수','리프수감점','시간감점','예선 Pattern Completion 스마트태그','예선 Pattern Balance 스마트태그','예선 Surface Quality 스마트태그','예선 Position & Proportion 스마트태그','예선 Pattern Definition 스마트태그','결선 Theme Expression 스마트태그','결선 Technical Execution 스마트태그','결선 Cleanliness 스마트태그','결선 Taste Balance 스마트태그','결선 Mouthfeel 스마트태그','결선 Presentation 스마트태그','결선 Surface Quality 스마트태그','결선 Position & Symmetry 스마트태그','결선 Design Completion 스마트태그'];
  else if (code === 'KBC') data = ['참가자번호','Presentation & Service(프레젠테이션과 서비스 전문성)','Espresso Taste & Design(맛과 설계) ×2','Espresso Clean Cup(클린컵)','Espresso Mouthfeel(마우스필)','Espresso Flavor(플레이버)','Espresso Total','Signature Taste & Design(맛과 설계) ×2','Signature Clean Cup(클린컵)','Signature Mouthfeel(마우스필)','Signature Flavor(플레이버)','Signature Total','Machine & Equipment Professionalism(머신 및 기물 운용 전문성)','시간감점','총점','종합코멘트','실격여부','실격사유','검수상태','선수명','경기시간','Presentation & Service 코멘트','Espresso Taste & Design 코멘트','Espresso Clean Cup 코멘트','Espresso Mouthfeel 코멘트','Espresso Flavor 코멘트','Signature Taste & Design 코멘트','Signature Clean Cup 코멘트','Signature Mouthfeel 코멘트','Signature Flavor 코멘트','Machine & Equipment Professionalism 코멘트','Presentation & Service 스마트태그','Espresso Taste & Design 스마트태그','Espresso Clean Cup 스마트태그','Espresso Mouthfeel 스마트태그','Espresso Flavor 스마트태그','Signature Taste & Design 스마트태그','Signature Clean Cup 스마트태그','Signature Mouthfeel 스마트태그','Signature Flavor 스마트태그','Machine & Equipment Professionalism 스마트태그'];
  else if (code === 'MOB') data = ['참가자번호','메뉴','Pre-Service Station(시연 전 작업대)','Service Station(시연 중 작업대)','Post-Service Station(시연 후 작업대)','Sweetness(스윗니스)','Flavor(플레이버)','Balance(균형)','Clean Cup(클린컵)','Mouthfeel(질감)','Professionalism(시연 전문성)','Creative Form & Usability(형태와 용이성)','Creative Flavor(창작 향미)','Creative Balance(균형)','Creative Mouthfeel(질감)','Creative Professionalism(전문성과 독창성)','총점','종합코멘트','실격여부','실격사유','검수상태','Pre-Service Station 코멘트','Service Station 코멘트','Post-Service Station 코멘트','Sweetness 코멘트','Flavor 코멘트','Balance 코멘트','Clean Cup 코멘트','Mouthfeel 코멘트','Professionalism 코멘트','Creative Form & Usability 코멘트','Creative Flavor 코멘트','Creative Balance 코멘트','Creative Mouthfeel 코멘트','Creative Professionalism 코멘트','시간감점','경기시간','선수명','Pre-Service Station 스마트태그','Service Station 스마트태그','Post-Service Station 스마트태그','Sweetness 스마트태그','Flavor 스마트태그','Balance 스마트태그','Clean Cup 스마트태그','Mouthfeel 스마트태그','Professionalism 스마트태그','Creative Form & Usability 스마트태그','Creative Flavor 스마트태그','Creative Balance 스마트태그','Creative Mouthfeel 스마트태그','Creative Professionalism 스마트태그','Signature Technical Pre-Service Station(창작음료 시연 전 작업대)','Signature Technical Service Station(창작음료 시연 중 작업대)','Signature Technical Ingredient Use(부재료 사용의 적절함)','Signature Technical Post-Service Station(창작음료 시연 후 작업대)','Signature Technical Pre-Service Station 코멘트','Signature Technical Service Station 코멘트','Signature Technical Ingredient Use 코멘트','Signature Technical Post-Service Station 코멘트','Signature Technical Pre-Service Station 스마트태그','Signature Technical Service Station 스마트태그','Signature Technical Ingredient Use 스마트태그','Signature Technical Post-Service Station 스마트태그'];
  else if (code === 'IKRC') data = ['샘플번호','Flavor(플레이버) ×3','Flavor 강도','Clean Cup(클린컵) ×2','Clean Cup 강도','Sweetness(스윗니스) ×2','Sweetness 강도','Acidity(산미)','Acidity 강도','Mouthfeel(마우스필) ×2','Mouthfeel 강도','종합코멘트','총점','실격여부','검수상태','참가자 번호','선수명','Seed to Cup 가산점','Seed to Cup 메모','최종점수','Flavor 스마트태그','Clean Cup 스마트태그','Sweetness 스마트태그','Acidity 스마트태그','Mouthfeel 스마트태그','실격사유'];
  else if (code === 'MOC') data = ['참가자번호','평가구분','정답수','가산점','총점','종료시간','서명','실격여부','실격사유','검수상태','Section1 지정국가','Section2 지정국가','Section1 농장','Section1 발효방식','Section2 농장','Section2 발효방식','선수명'];
  else if (code === 'KTCC') data = ['팀번호','팀명','Section1 주제','Section1 선택컵','Section1 정답수','Section2 주제','Section2 선택컵','Section2 정답수','Section3 주제','Section3 선택컵','Section3 정답수','Section3 가산점','총점','종료시간','서명','실격여부','실격사유','검수상태'];
  return meta.concat(data);
}
function firstNonEmpty(list) { for (const v of list || []) { const s = safeStr(v); if (s) return s; } return ''; }
function toNumber(v) { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; }
function numberFromKeys(obj, keys) { if (!obj || typeof obj !== 'object') return null; for (const k of keys || []) { if (Object.prototype.hasOwnProperty.call(obj, k)) { const n = toNumber(obj[k]); if (n !== null) return n; } } return null; }
function extractExtra(payload) { payload = payload || {}; const payloadRows = Array.isArray(payload.rows) ? payload.rows : []; const firstRow = payloadRows[0] || {}; return Object.assign({}, payload.extraFields || {}, firstRow.extraFields || {}); }
function mergeHeaders(code, rows) { const seen = new Set(); const out = []; function add(h){ h = safeStr(h); if (h && !seen.has(h)) { seen.add(h); out.push(h); } } expectedHeadersForCompetition(code).forEach(add); (rows || []).forEach(r => { const p = parseJson(r.payload_json, {}); Object.keys(extractExtra(p)).forEach(add); }); return out; }
function rowToReviewItem(r, code, headers, fallbackRound) {
  const payload = parseJson(r.payload_json, {}); const payloadRows = Array.isArray(payload.rows) ? payload.rows : []; const firstRow = payloadRows[0] || {}; const data = Array.isArray(firstRow.data) ? firstRow.data : []; const extra = extractExtra(payload);
  const unit = firstNonEmpty([r.unit, extra['참가자번호'], extra['참가자 번호'], extra['선수번호'], extra['선수 번호'], extra['컵번호'], extra['Cup No'], extra['샘플번호'], extra['팀번호'], extra['팀 번호'], payload.unit, payload.cupNo, payload.participantNo, payload.teamNo, data[0]]);
  const round = firstNonEmpty([r.round, payload.round, payload.currentRound, extra['라운드'], fallbackRound]);
  const participantName = firstNonEmpty([r.participant_name, extra['선수명'], extra['참가자명'], extra['이름'], extra['팀명'], payload.participantName, payload.playerName, payload.teamName]);
  const totalScore = r.total_score === null || r.total_score === undefined ? firstNonEmpty([extra['총점'], extra['최종점수'], extra['Total'], extra['Total Score']]) : Number(r.total_score);
  const item = Object.assign({}, extra);
  item.rowIndex = r.id; item['제출시간'] = r.submitted_at || ''; item['대회코드'] = r.competition_code || code; item['라운드'] = round; item['심사위원명'] = r.judge_name || payload.judgeName || ''; item['팀'] = r.team || payload.team || payload.teamGroup || ''; item['역할'] = r.role || payload.judgeRole || payload.role || ''; item['모드'] = r.mode || payload.mode || '';
  if (!item['참가자번호']) item['참가자번호'] = unit; if (!item['참가자 번호']) item['참가자 번호'] = unit; if (!item['컵번호']) item['컵번호'] = unit; if (!item['샘플번호']) item['샘플번호'] = unit; if (!item['팀번호']) item['팀번호'] = unit;
  if (!item['선수명']) item['선수명'] = participantName; if (!item['참가자명']) item['참가자명'] = participantName; if (!item['팀명'] && code === 'KTCC') item['팀명'] = participantName;
  item['총점'] = totalScore; item['최종점수'] = totalScore; item['실격여부'] = r.disqualified ? 'Y' : (item['실격여부'] || ''); item['실격사유'] = r.disqualification_reason || item['실격사유'] || ''; item['검수상태'] = r.review_status || item['검수상태'] || '미검수';
  item.status = item['검수상태']; item.submittedAt = item['제출시간']; item.timestamp = item['제출시간']; item.competitionCode = item['대회코드']; item.round = item['라운드']; item.judgeName = item['심사위원명']; item.team = item['팀']; item.role = item['역할']; item.mode = item['모드']; item.unit = unit; item.participantName = participantName; item.totalScore = totalScore; item.disqualified = !!r.disqualified; item.disqualificationReason = item['실격사유']; item.payload = payload;
  item.values = (headers || []).map((h, idx) => { const v = item[h] === undefined || item[h] === null ? '' : item[h]; item['_col' + idx] = v; return v; }); return item;
}

function inferScorePayload(payload) {
  const p = payload || {}; const rows = Array.isArray(p.rows) ? p.rows : []; const firstRow = rows[0] || {}; const extra = firstRow.extraFields || p.extraFields || {}; const data = Array.isArray(firstRow.data) ? firstRow.data : (Array.isArray(p.data) ? p.data : []);
  const code = safeStr(p.competitionCode || p.code || p.compCode || p.competition || '').toUpperCase();
  const round = safeStr(p.round || p.currentRound || p.roundName || '');
  const judgeName = firstNonEmpty([p.judgeName, p.name, p.judge && p.judge.name]);
  const role = firstNonEmpty([p.judgeRole, p.role, p.judge && p.judge.role]);
  const team = firstNonEmpty([p.team, p.teamGroup, p.judge && p.judge.teamGroup]);
  const mode = safeStr(p.mode || p.evalMode || '');
  const unit = firstNonEmpty([p.unit, p.cupNo, p.cupNumber, p.participantNo, p.participantNumber, p.teamNo, p.targetNo, p.number, extra['참가자번호'], extra['참가자 번호'], extra['Cup No'], extra['컵번호'], extra['샘플번호'], extra['팀번호'], data[0]]);
  const participantName = firstNonEmpty([p.participantName, p.playerName, p.teamName, extra['선수명'], extra['참가자명'], extra['팀명'], extra['이름']]);
  let total = toNumber(p.totalScore ?? p.total ?? p.finalScore ?? p.subtotalScore ?? p.subtotal);
  if (total === null) total = numberFromKeys(extra, ['총점','최종점수','Total','Total Score','total','totalScore','finalScore','subtotalScore','subtotal']);
  if (total === null && rows.length) { const nums = []; rows.forEach(row => { if (row && row.extraFields) { const n = numberFromKeys(row.extraFields, ['총점','최종점수','Total','Total Score','total','totalScore','finalScore','subtotalScore','subtotal']); if (n !== null) nums.push(n); } }); if (nums.length) total = Math.max(...nums); }
  if (total === null) { const nums = []; JSON.stringify(p).replace(/"(?:총점|최종점수|Total|Total Score|totalScore|finalScore|subtotalScore|subtotal|score)"\s*:\s*"?(-?[0-9]+(?:\.[0-9]+)?)/gi, (_, n) => { nums.push(Number(n)); return _; }); if (nums.length) total = Math.max(...nums); }
  const dqValue = firstNonEmpty([p.disqualified, p.dq, extra['실격여부']]);
  const disqualified = dqValue === true || dqValue === 'true' || dqValue === 'Y' || dqValue === 'y' || dqValue === '1' || dqValue === '실격';
  const dqReason = firstNonEmpty([p.disqualificationReason, p.dqReason, extra['실격사유']]);
  return { code, round, judgeName, role, team, mode, unit, participantName, total, disqualified, dqReason };
}
async function submitScores(env, payload, signature) {
  const x = inferScorePayload(payload);
  if (!x.code) return { success: false, message: '대회코드를 찾지 못했습니다.' };
  await env.DB.prepare(`INSERT INTO scores (submitted_at, competition_code, round, judge_name, team, role, mode, unit, participant_name, total_score, disqualified, disqualification_reason, review_status, payload_json, signature_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '미검수', ?, ?)`)
    .bind(nowIso(), x.code, x.round, x.judgeName, x.team, x.role, x.mode, x.unit, x.participantName, x.total, boolInt(x.disqualified), x.dqReason, JSON.stringify(payload || {}), signature || '').run();
  return { success: true, message: '저장 완료' };
}

async function getReviewList(env, competitionCode, actorArg) {
  const code = safeStr(competitionCode).toUpperCase(); const actor = await getActor(env, actorArg);
  if (!hasAccess(actor, code)) return { success: false, message: '검수 조회 권한이 없습니다.' };
  const cfg = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind(code).first();
  const rowsRaw = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id DESC').bind(code).all();
  const raw = rowsRaw.results || []; const headers = mergeHeaders(code, raw);
  const list = raw.map(r => rowToReviewItem(r, code, headers, cfg && cfg.current_round));
  return { success: true, list, headers };
}

async function updateReviewRow(env, competitionCode, rowIndex, updates, newStatus, roleText, actorArg) {
  const code = safeStr(competitionCode).toUpperCase(); const actor = await getActor(env, actorArg);
  if (!hasAccess(actor, code)) return { success: false, message: '검수 수정 권한이 없습니다.' };
  const id = Number(rowIndex); if (!id) return { success: false, message: '수정할 행 번호가 없습니다.' };
  const current = await env.DB.prepare('SELECT * FROM scores WHERE id=? AND competition_code=?').bind(id, code).first();
  if (!current) return { success: false, message: '수정할 데이터를 찾지 못했습니다.' };
  const rowsRaw = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id DESC').bind(code).all();
  const headers = mergeHeaders(code, rowsRaw.results || []); const updateObj = updates || {};
  const payload = parseJson(current.payload_json, {}); if (!Array.isArray(payload.rows)) payload.rows = [{}]; if (!payload.rows.length) payload.rows.push({}); if (!payload.rows[0].extraFields || typeof payload.rows[0].extraFields !== 'object') payload.rows[0].extraFields = {}; if (!payload.extraFields || typeof payload.extraFields !== 'object') payload.extraFields = {};
  Object.keys(updateObj).forEach(col => { const idx = Number(col); const header = headers[idx]; if (!header) return; const value = updateObj[col]; payload.rows[0].extraFields[header] = value; payload.extraFields[header] = value; });
  const tmpHeaders = mergeHeaders(code, [{...current, payload_json: JSON.stringify(payload)}]);
  const item = rowToReviewItem({...current, payload_json: JSON.stringify(payload)}, code, tmpHeaders, ''); const inferred = inferScorePayload(payload);
  const unit = firstNonEmpty([item.unit, current.unit, inferred.unit]); const participantName = firstNonEmpty([item.participantName, current.participant_name, inferred.participantName]);
  const total = inferred.total !== null && inferred.total !== undefined ? inferred.total : current.total_score;
  const dq = item['실격여부'] === 'Y' || inferred.disqualified || !!current.disqualified; const dqReason = firstNonEmpty([item['실격사유'], inferred.dqReason, current.disqualification_reason]); const status = safeStr(newStatus) || current.review_status || '미검수';
  await env.DB.prepare(`UPDATE scores SET unit=?, participant_name=?, total_score=?, disqualified=?, disqualification_reason=?, review_status=?, payload_json=? WHERE id=? AND competition_code=?`)
    .bind(unit, participantName, total === null || total === undefined || Number.isNaN(Number(total)) ? null : Number(total), boolInt(dq), dqReason, status, JSON.stringify(payload), id, code).run();
  return { success: true, message: '검수 수정 저장 완료', rowIndex: id, status };
}
async function updateReviewStatus(env, competitionCode, rowIndexes, newStatus) {
  const ids = Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes];
  for (const id of ids) await env.DB.prepare('UPDATE scores SET review_status=? WHERE id=?').bind(safeStr(newStatus) || '미검수', Number(id)).run();
  return { success: true, message: '상태 변경 완료' };
}
async function deleteReviewRow(env, competitionCode, rowIndex) {
  await env.DB.prepare('DELETE FROM scores WHERE id=?').bind(Number(rowIndex)).run();
  return { success: true, message: '삭제 완료' };
}

async function getRanking(env, competitionCode, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const actor = await getActor(env, actorArg);
  if (!hasAccess(actor, code)) return { success: false, message: '순위 조회 권한이 없습니다.' };
  const cfg = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind(code).first();
  const rows = await env.DB.prepare(`SELECT round, COALESCE(NULLIF(unit,''), CAST(id AS TEXT)) AS unit, participant_name,
    AVG(total_score) AS avg_score, SUM(CASE WHEN review_status='검수완료' THEN 1 ELSE 0 END) AS reviewed, COUNT(*) AS total,
    MAX(disqualified) AS dq
    FROM scores WHERE competition_code=? GROUP BY round, unit ORDER BY round, avg_score DESC`).bind(code).all();
  const byRound = {};
  const ranking = (rows.results || []).map(r => {
    const round = r.round || (cfg && cfg.current_round) || '-';
    if (!byRound[round]) byRound[round] = 0;
    byRound[round] += 1;
    return {
      rank: byRound[round],
      unit: r.unit,
      unitDisplay: r.unit,
      round,
      playerNameSummary: r.participant_name || '',
      nameSummary: r.participant_name || '',
      totalScore: r.avg_score,
      avgScore: r.avg_score,
      score: r.avg_score,
      scoreBasis: '평균점수',
      reviewedCount: r.reviewed || 0,
      totalCount: r.total || 0,
      disqualified: !!r.dq
    };
  });
  return { success: true, compCode: code, compName: cfg ? cfg.name : code, unitLabel: code === 'KTCC' ? '팀번호' : '참가자번호', ranking, tieBreakRule: '' };
}
async function getRankingDetail(env, competitionCode, unit, round, actorArg) {
  const code = safeStr(competitionCode).toUpperCase(); const targetUnit = safeStr(unit); const targetRound = safeStr(round);
  if (!code || !targetUnit) return { success: false, message: '상세 조회할 대회코드 또는 참가자번호가 없습니다.' };
  const actor = await getActor(env, actorArg); if (!hasAccess(actor, code)) return { success: false, message: '순위 상세 조회 권한이 없습니다.' };
  const cfg = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind(code).first();
  const rowsRaw = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id ASC').bind(code).all(); const raw = rowsRaw.results || [];
  const headers = mergeHeaders(code, raw); const converted = raw.map(r => rowToReviewItem(r, code, headers, cfg && cfg.current_round));
  const rows = converted.filter(item => { const sameUnit = safeStr(item.unit) === targetUnit; const itemRound = safeStr(item.round); const sameRound = !targetRound || !itemRound || itemRound === targetRound; return sameUnit && sameRound; });
  let totalScore = 0, count = 0, reviewedCount = 0, disqualified = false; const reasons = [];
  rows.forEach(item => { const n = toNumber(item['총점']); if (n !== null) { totalScore += n; count++; } if (String(item['검수상태'] || '').replace(/\s/g,'') === '검수완료') reviewedCount++; if (item.disqualified || item['실격여부'] === 'Y') { disqualified = true; if (item['실격사유']) reasons.push(item['실격사유']); } });
  totalScore = Math.round(totalScore * 100) / 100;
  let rankInfo = null; try { const rankResult = await getRanking(env, code, actorArg); if (rankResult && rankResult.success && Array.isArray(rankResult.ranking)) rankInfo = rankResult.ranking.find(r => safeStr(r.unit) === targetUnit && (!targetRound || safeStr(r.round) === targetRound)) || null; } catch {}
  return { success: true, compCode: code, compName: cfg ? cfg.name : (COMPETITION_NAMES[code] || code), unitLabel: code === 'KTCC' ? '팀번호' : '참가자번호', unit: targetUnit, unitDisplay: targetUnit, round: targetRound, headers, rows, scores: rows, totalScore, avgScore: count ? Math.round((totalScore / count) * 100) / 100 : 0, rankInfo, disqualified: disqualified || (rankInfo && rankInfo.disqualified) || false, disqualificationReason: reasons.join(' / ') || (rankInfo && rankInfo.disqualificationReason) || '', reviewedCount, totalCount: rows.length, playerNameSummary: (rankInfo && (rankInfo.playerNameSummary || rankInfo.nameSummary)) || (rows[0] && rows[0].participantName) || '' };
}

async function sendOTP(env, name, phone, competitionCode) {
  name = safeStr(name); phone = normalizePhone(phone); const code = safeStr(competitionCode).toUpperCase();
  if (!name || !phone || !code) return { success: false, message: '대회, 이름, 연락처를 입력해주세요.' };
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO otps (competition_code, name, phone, otp, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(code, name, phone, otp, expires, nowIso()).run();
  if (safeStr(env.SMS_PROVIDER).toLowerCase() === 'solapi') {
    // TODO: SOLAPI/NCP 문자 발송 연결
  }
  return { success: true, message: env.SMS_PROVIDER ? '인증번호를 발송했습니다.' : '개발 모드 인증번호: ' + otp, devOtp: env.SMS_PROVIDER ? undefined : otp };
}
async function verifyOTP(env, name, phone, competitionCode, otp) {
  name = safeStr(name); phone = normalizePhone(phone); const code = safeStr(competitionCode).toUpperCase();
  const row = await env.DB.prepare(`SELECT * FROM otps WHERE competition_code=? AND name=? AND phone=? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1`)
    .bind(code, name, phone, nowIso()).first();
  if (!row) return { success: false, message: '유효한 인증번호가 없습니다.' };
  if (safeStr(row.otp) !== safeStr(otp)) return { success: false, message: '인증번호가 일치하지 않습니다.' };
  await env.DB.prepare('UPDATE otps SET used_at=? WHERE id=?').bind(nowIso(), row.id).run();
  const scoreRows = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? AND (participant_name=? OR payload_json LIKE ?) ORDER BY id')
    .bind(code, name, `%${name}%`).all();
  const rounds = {};
  for (const r of scoreRows.results || []) {
    const rd = r.round || '-';
    if (!rounds[rd]) rounds[rd] = [];
    rounds[rd].push({ judgeName: r.judge_name || '', totalScore: r.total_score, comment: '', payload: parseJson(r.payload_json, {}) });
  }
  return { success: true, name, phone, competitionCode: code, rounds, scores: scoreRows.results || [] };
}
function _num(v) { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; }
function _avg(list) { const nums = (list || []).map(_num).filter(n => n > 0); return nums.length ? nums.reduce((a,b)=>a+b,0) / nums.length : 0; }
function _fmt(n) { n = _num(n); return n ? (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/,'') : '-'; }
function _tags(arr, max=3) { return Array.isArray(arr) ? arr.filter(Boolean).slice(0,max) : []; }
function _joinTags(arr, fallback='') { arr = _tags(arr, 3); return arr.length ? arr.join(', ') : fallback; }
function _tone5(v) { v=_num(v); if (v>=4.5) return '매우 선명한'; if (v>=4) return '뚜렷한'; if (v>=3.5) return '안정적인'; if (v>=3) return '기준을 충족하는'; if (v>=2) return '다소 약한'; return '보완이 필요한'; }
function _tone7(v) { v=_num(v); if (v>=5.5) return '완성도가 높은'; if (v>=5) return '매우 안정적인'; if (v>=4) return '안정적인'; if (v>=3) return '기준을 충족하는'; if (v>=2) return '보완이 필요한'; return '개선이 필요한'; }
function _result(comments) { return { success: true, comments: (comments || []).filter(Boolean).slice(0,3) }; }
function generateCuppingComment(payload) { payload = payload || {}; const fl=_num(payload.flavor), at=_num(payload.aftertaste), ac=_num(payload.acidity), bo=_num(payload.body), sw=_num(payload.sweetness), ov=_num(payload.overall); const tags=payload.tags||{}; const avg=_avg([fl,at,ac,bo,sw,ov]); return _result([`${_joinTags(tags.flavor,'향미')} 계열의 인상이 컵의 첫인상을 형성하고, Aftertaste는 ${_joinTags(tags.aftertaste,'여운')} 중심으로 이어진다. 산미는 ${_tone5(ac)} 수준으로 나타나며 전체 향미 구조 안에서 균형을 만든다.`, `Body는 ${_joinTags(tags.body,'질감')} 질감으로 컵을 지지하고, Sweetness는 ${_joinTags(tags.sweetness,'단맛')} 방향으로 감지된다. Flavor ${_fmt(fl)}, Aftertaste ${_fmt(at)}, Acidity ${_fmt(ac)}, Body ${_fmt(bo)}, Sweetness ${_fmt(sw)}의 흐름을 종합하면 ${_tone5(avg)} 커핑 결과로 볼 수 있다.`, `Overall ${_fmt(ov)} 기준에서 컵의 강점은 향미의 선명도와 구조감에 있으며, 낮게 기록된 항목은 로스팅 포인트와 클린컵, 단맛 지속성을 중심으로 보완하면 좋다.`]); }
function generateKbcComment(payload) { payload=payload||{}; const techCount=_num(payload.techCount), sensorAvg=_num(payload.sensorAvg), sigAvg=payload.sigAvg==null?0:_num(payload.sigAvg), total=_num(payload.totalScore), isMain=!!payload.isMain, practical=safeStr(payload.practical); const techStr=techCount>=5?'기술 항목 전반을 안정적으로 수행했다':techCount>=4?'대부분의 기술 항목을 무리 없이 수행했다':techCount>=3?'핵심 기술은 수행했으나 일부 안정성에서 보완 여지가 있었다':'기술 수행의 일관성에서 보완이 필요했다'; const sensorStr=sensorAvg>=5?'에스프레소의 향미 설계와 균형이 뚜렷하게 전달되었다':sensorAvg>=4?'에스프레소의 맛과 질감이 비교적 안정적으로 표현되었다':sensorAvg>=3?'에스프레소가 기준은 충족했으나 향미 선명도와 일관성에 보완 여지가 있었다':'에스프레소 추출 안정성과 향미 표현을 함께 보완할 필요가 있었다'; const sigStr=isMain?(sigAvg>=5?'창작음료는 에스프레소와 부재료의 연결성이 분명하고 설계 의도가 잘 드러났다':sigAvg>=4?'창작음료는 전체 균형이 안정적이나 향미 포인트를 더 선명하게 만들 수 있다':'창작음료는 의도 전달과 향미 균형을 추가로 다듬을 필요가 있다'):''; const practicalStr=practical==='Y'?'실무 수행성은 비교적 안정적으로 확인되었다':practical==='N'?'실무 수행성에서는 준비와 동선의 보완이 필요했다':'서비스 흐름과 준비 과정은 전체 완성도에 영향을 주는 요소로 확인되었다'; return _result([`${techStr}. ${sensorStr}.`, isMain?`${sigStr}. ${practicalStr}.`:`${practicalStr}. 프레젠테이션과 장비 운용의 안정성이 음료 평가와 함께 전체 인상을 구성했다.`, `총점 ${_fmt(total)}점 기준으로 강점은 유지하되, 낮게 기록된 세부 항목을 중심으로 추출 일관성, 향미 설명, 서비스 완성도를 보완하면 전체 경쟁력이 높아질 수 있다.`]); }
function generateKcacComment(payload) { payload=payload||{}; const total=_num(payload.subtotal||payload.totalScore||payload.total), round=safeStr(payload.round||payload.stage||''), pattern=safeStr(payload.patternType||payload.pattern||'패턴'), scores=payload.scores||{}, visualAvg=_avg(Object.values(scores)); return _result([`${round?round+' ':''}${pattern} 평가는 패턴의 위치, 균형, 표면 품질과 선명도를 중심으로 진행되었다. 전체적으로 ${_tone5(visualAvg||total)} 시각적 완성도를 보였다.`, `점수 흐름을 보면 중심축과 비율, 표면 정리감이 전체 인상을 결정했다. 패턴의 대비와 라인 선명도가 안정적으로 유지될수록 완성도가 더 높게 전달된다.`, `최종 ${_fmt(total)}점 기준으로 강점은 유지하되, 리프 간격·대칭·표면 질감처럼 낮게 기록된 항목을 중심으로 보완하면 컵의 표현력이 더 선명해질 수 있다.`]); }
function generateMobComment(payload) { payload=payload||{}; const menu=safeStr(payload.menu||'브루잉'), total=_num(payload.totalScore||payload.total), techAvg=_avg(payload.techVals||[]), sensAvg=_avg(payload.sensVals||[]), sigAvg=_avg(payload.sigVals||[]), attrComments=safeStr(payload.attributeComments||''); return _result([`${menu} 평가는 추출 설계와 서비스 흐름, 향미 표현이 함께 연결되는지를 중심으로 확인했다. 기술 수행은 ${_tone7(techAvg)} 수준이며, 준비와 시연 동선이 전체 인상에 직접적으로 영향을 주었다.`, `센서리 항목은 ${_tone7(sensAvg)} 흐름을 보였다${sigAvg?`, 창작 요소는 ${_tone7(sigAvg)} 완성도로 평가되었다`:''}. 향미 설명과 컵의 실제 인상이 자연스럽게 맞물릴수록 설계 의도가 더 분명하게 전달된다.`, `${attrComments?attrComments+' ':''}총점 ${_fmt(total)}점 기준으로 낮게 기록된 항목을 중심으로 추출 일관성, 향미 균형, 서비스 완성도를 함께 보완하면 좋다.`]); }
function generateIkrcComment(payload) { payload=payload||{}; const scores=payload.scores||{}, intensities=payload.intensities||{}, tags=payload.tags||{}; const fl=_num(scores.flavor), clean=_num(scores.cleanCup), sw=_num(scores.sweetness), ac=_num(scores.acidity), mf=_num(scores.mouthfeel), avg=_avg([fl,clean,sw,ac,mf]); return _result([`Sample ${payload.sampleNo||''}은 ${_joinTags(tags.flavor,'플레이버')} 계열의 향미가 중심이 되며, Clean Cup은 ${_tone5(clean)} 수준으로 평가되었다. 향미 강도 ${intensities.flavor||'-'} 기준에서 컵의 첫인상이 결정된다.`, `Sweetness ${_fmt(sw)}, Acidity ${_fmt(ac)}, Mouthfeel ${_fmt(mf)}의 흐름을 보면 단맛, 산미, 질감의 연결성이 전체 로스팅 완성도를 좌우했다. ${_joinTags(tags.mouthfeel,'질감')} 질감이 컵의 구조감을 만든다.`, `평균 ${_fmt(avg)}점 기준으로 강점은 유지하되, 낮은 항목은 로스팅 포인트와 후반부 클린함, 단맛 지속성을 중심으로 조정하면 더 안정적인 결과를 기대할 수 있다.`]); }

