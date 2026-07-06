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
const COMPETITION_ROUNDS = {
  KBC: ['예선','본선','결선'],
  MOC: ['예선','본선','결선'],
  MOB: ['예선','결선'],
  KTCC: ['예선','결선'],
  KCR: ['예선','결선'],
  IKRC: ['예선','결선'],
  KCAC: ['예선','결선']
};

let __schemaReadyPromise = null;
let __defaultDataReadyPromise = null;
function memoOnce_(keyName, factory) {
  if (keyName === 'schema') {
    if (!__schemaReadyPromise) __schemaReadyPromise = Promise.resolve().then(factory).catch(err => { __schemaReadyPromise = null; throw err; });
    return __schemaReadyPromise;
  }
  if (!__defaultDataReadyPromise) __defaultDataReadyPromise = Promise.resolve().then(factory).catch(err => { __defaultDataReadyPromise = null; throw err; });
  return __defaultDataReadyPromise;
}
async function ensureRuntimeReady_(env) {
  await memoOnce_('schema', () => ensureSchema(env.DB));
  await memoOnce_('defaultData', () => ensureDefaultData(env));
}

function normalizeRoundForCompetition_(code, round) {
  code = safeStr(code).toUpperCase();
  let r = safeStr(round || '예선');
  if (/qual|prelim|예선|온라인/i.test(r)) r = '예선';
  else if (/semi|main|본선/i.test(r)) r = '본선';
  else if (/final|결선/i.test(r)) r = '결선';
  const allowed = COMPETITION_ROUNDS[code] || ['예선','결선'];
  if (!allowed.includes(r)) r = allowed[0] || '예선';
  return r;
}
function participantRoundPolicy_(code, round) {
  code = safeStr(code).toUpperCase();
  const r = normalizeRoundForCompetition_(code, round || '예선');
  const base = { mode:'VISIBLE', numberLabel: r + '번호', identityHidden:false, directInput:false };
  if (code === 'KCR') return { mode:'BLIND', numberLabel: r === '결선' ? '결선출품번호' : '예선출품번호', identityHidden:true, directInput:false };
  if (code === 'KCAC') return r === '예선'
    ? { mode:'BLIND', numberLabel:'예선블라인드번호', identityHidden:true, directInput:false }
    : { mode:'VISIBLE', numberLabel:'결선참가번호', identityHidden:false, directInput:false };
  if (code === 'IKRC') return r === '예선'
    ? { mode:'BLIND_SAMPLE', numberLabel:'예선샘플번호', identityHidden:true, directInput:false }
    : { mode:'SAMPLE_VISIBLE', numberLabel:'결선샘플번호', identityHidden:false, directInput:false };
  if (code === 'KTCC') return { mode:'TEAM_VISIBLE', numberLabel:r === '결선' ? '결선팀번호' : '예선팀번호', identityHidden:false, directInput:true };
  if (code === 'MOC') return { mode:'DIRECT_VISIBLE', numberLabel:r + '참가자번호', identityHidden:false, directInput:true };
  if (code === 'MOB') return { mode:'STAGE_VISIBLE', numberLabel:r + '참가자번호', identityHidden:false, directInput:true };
  if (code === 'KBC') return { mode:'STAGE_VISIBLE', numberLabel:r + '참가자번호', identityHidden:false, directInput:true };
  return base;
}
function actorCanSeeParticipantIdentity_(actor) {
  return !!(hasAdmin(actor) || hasTeamLead(actor));
}


export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!isTrustedOrigin_(request)) {
      return json({ success: false, message: '허용되지 않은 요청 출처입니다.' }, 403, request);
    }
    const len = Number(request.headers.get('content-length') || 0);
    if (len && len > 8 * 1024 * 1024) {
      return json({ success: false, message: '요청 데이터가 너무 큽니다. 파일을 나누어 다시 시도해주세요.' }, 413, request);
    }
    await ensureRuntimeReady_(env);
    let body;
    try { body = await request.json(); }
    catch { return json({ success: false, message: '요청 형식이 올바르지 않습니다.' }, 400, request); }
    const action = String(body.action || body.method || '').trim();
    const args = Array.isArray(body.args) ? body.args : [];
    if (!action) return json({ success: false, message: 'action이 없습니다.' }, 400, request);

    const ip = clientIp_(request);
    const generalLimit = await rateLimit_(env, 'api:' + action + ':' + await sha256Hex_(ip || 'unknown'), 240, 60);
    if (!generalLimit.ok) return json({ success: false, message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, 429, request);

    const result = await dispatch(action, args, env, request);
    return json(result, 200, request);
  } catch (err) {
    try { console.error('KCL_RPC_ERROR', err && err.stack ? err.stack : err); } catch (_) {}
    return json({ success: false, message: '서버 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, 500, request);
  }
}

export async function onRequestOptions(context) {
  const request = context && context.request;
  if (request && !isTrustedOrigin_(request)) return new Response(null, { status: 403, headers: securityHeaders_() });
  return new Response(null, { status: 204, headers: corsHeaders_(request) });
}

function json(data, status = 200, request = null) {
  return new Response(JSON.stringify(data || {}), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders_(request), ...securityHeaders_() }
  });
}
function corsHeaders_(request) {
  const origin = request ? safeStr(request.headers.get('Origin')) : '';
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  };
  if (origin && isTrustedOrigin_(request)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
function securityHeaders_() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store'
  };
}
function isTrustedOrigin_(request) {
  if (!request) return true;
  const origin = safeStr(request.headers.get('Origin'));
  if (!origin) return true;
  try {
    const reqUrl = new URL(request.url);
    const originUrl = new URL(origin);
    if (originUrl.hostname === reqUrl.hostname) return true;
    if (['localhost','127.0.0.1'].includes(originUrl.hostname)) return true;
  } catch (_) {}
  return false;
}
function clientIp_(request) {
  return safeStr(request && (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || request.headers.get('X-Real-IP'))).split(',')[0].trim() || '0.0.0.0';
}
function safeStr(v) { return String(v ?? '').trim(); }
function normalizePhone(v) { return String(v ?? '').replace(/[^0-9]/g, ''); }
function nowIso() { return new Date().toISOString(); }
function uuid() { return crypto.randomUUID().replace(/-/g, ''); }
function boolInt(v) { return v ? 1 : 0; }
function parseJson(v, fallback = {}) { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function accessCodes_(access) {
  const raw = String(access || '').toUpperCase().trim();
  if (!raw) return [];
  if (raw === '*' || raw === 'ALL') return ['ALL'];
  return Array.from(new Set(raw.split(/[;,/|]+/).map(x => x.trim()).filter(Boolean)));
}
function normalizeAccess_(access) {
  const codes = accessCodes_(access);
  if (codes.includes('ALL')) return 'ALL';
  return codes.filter(c => COMPETITION_CODES.includes(c)).sort((a,b) => COMPETITION_CODES.indexOf(a) - COMPETITION_CODES.indexOf(b)).join(',');
}
function normalizeAccountType_(type, role='') {
  const raw = String(type || '').toUpperCase().replace(/\s+/g, '');
  const r = safeStr(role);
  if (raw === 'ADMIN' || raw === '관리자' || raw === '전체관리자' || raw === '총괄관리자' || /관리자|admin|총괄/i.test(r)) return 'ADMIN';
  if (raw === 'TEAMLEAD' || raw === 'LEADER' || raw === '대회팀장' || raw === '팀장' || /팀장|team\s*lead|leader/i.test(r)) return 'TEAMLEAD';
  if (raw === 'STAFF' || raw === 'OPERATOR' || raw === '운영진' || raw === '스텝' || /운영|스텝|staff|operator/i.test(r)) return 'STAFF';
  return 'JUDGE';
}

function normalizePersonName_(v) {
  return safeStr(v).replace(/\s+/g, '').toLowerCase();
}
function operatorIsAdminRow_(row) {
  if (!row) return false;
  return normalizeAccountType_(row.account_type || '', row.role || '') === 'ADMIN' || normalizeAccess_(row.access || '') === 'ALL';
}
function operatorRowsForLogin_(rows, name, phone) {
  const all = Array.isArray(rows) ? rows : [];
  const inputName = normalizePersonName_(name);
  // 같은 연락처의 여러 계정 중, 로그인 이름과 일치하는 행을 모두 병합합니다.
  // 예: KCR 대회팀장 + KCAC 대회팀장 + ALL 전체관리자
  // 개발용 기본 관리자(관리자 / 01000000000)처럼 다른 이름의 행이 섞여 권한을 오판하지 않도록 이름 일치 기준을 유지합니다.
  const exact = all.filter(r => normalizePersonName_(r.name) === inputName);
  const merged = new Map();
  exact.forEach(r => { if (r && r.id !== undefined) merged.set(String(r.id), r); });
  return Array.from(merged.values()).sort((a,b) => Number(a.id || 0) - Number(b.id || 0));
}

function typeRank_(type, role='') {
  const t = normalizeAccountType_(type, role);
  if (t === 'ADMIN') return 100;
  if (t === 'TEAMLEAD') return 80;
  if (t === 'STAFF') return 60;
  return 40;
}
function bestOperatorRow_(rows) {
  return (rows || []).slice().sort((a,b) => typeRank_(b.account_type, b.role) - typeRank_(a.account_type, a.role) || Number(a.id || 0) - Number(b.id || 0))[0] || null;
}
function hasTeamLead(actor) {
  if (!actor) return false;
  return String(actor.type || actor.accountType || '').toUpperCase() === 'TEAMLEAD' || /팀장|team\s*lead|leader/i.test(actor.role || '');
}
function actorAccessCodes_(actor) { return accessCodes_(actor && actor.access); }
function hasManageAccess(actor, code) {
  if (!actor) return false;
  if (hasAdmin(actor)) return true;
  return hasTeamLead(actor) && hasAccess(actor, code);
}
function strictCompetitionCode_(competitionCode, label='초기화') {
  const code = safeStr(competitionCode).toUpperCase();
  if (!code || code === 'ALL' || code === '*') {
    return { code, error: { success:false, message: label + '할 대회를 하나만 선택하세요. 전체 초기화는 안전상 지원하지 않습니다.' } };
  }
  if (!COMPETITION_CODES.includes(code)) {
    return { code, error: { success:false, message: '알 수 없는 대회코드입니다: ' + code } };
  }
  return { code, error:null };
}
function isStaffActorForCode_(actor, code) {
  if (!actor || !hasAccess(actor, code)) return false;
  const t = normalizeAccountType_(actor.type || actor.accountType || '', actor.role || '');
  if (t === 'STAFF') return true;
  const rows = Array.isArray(actor.operatorRows) ? actor.operatorRows : [];
  return rows.some(r => normalizeAccountType_(r.accountType || r.account_type || '', r.role || '') === 'STAFF' && hasAccess({ access: r.access || actor.access, role: r.role || '', type: r.accountType || r.account_type || '' }, code));
}
function operatorRowVisibleToActor_(actor, row) {
  if (hasAdmin(actor)) return true;
  const actorCodes = actorAccessCodes_(actor);
  if (!actorCodes.length) return false;
  if (actorCodes.includes('ALL')) return true;
  const rowCodes = accessCodes_(row && row.access);
  if (rowCodes.includes('ALL')) return false;
  return rowCodes.some(c => actorCodes.includes(c));
}


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
    `CREATE TABLE IF NOT EXISTS sms_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT,
      competition_code TEXT,
      recipient_name TEXT,
      phone TEXT,
      purpose TEXT,
      status TEXT,
      message TEXT,
      response_json TEXT,
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      reset_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT,
      actor_name TEXT,
      target TEXT,
      status TEXT,
      message TEXT,
      created_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_scores_comp ON scores(competition_code, round)`,
    `CREATE INDEX IF NOT EXISTS idx_participants_comp ON participants(competition_code)`,
    `CREATE INDEX IF NOT EXISTS idx_operators_phone ON operators(name, phone)`,
    `CREATE INDEX IF NOT EXISTS idx_participants_lookup ON participants(competition_code, name, phone)`,
    `CREATE INDEX IF NOT EXISTS idx_participants_unit ON participants(competition_code, unique_no, cup_no, sample_no, team_no)`,
    `CREATE INDEX IF NOT EXISTS idx_scores_unit ON scores(competition_code, unit, review_status)`,
    `CREATE INDEX IF NOT EXISTS idx_sms_logs_comp ON sms_logs(competition_code, phone, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_security_events_action ON security_events(action, created_at)`
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
  // 1.0ver-final: 이전 개발용 기본 관리자(관리자 / 01000000000)는 자동 생성하지 않습니다.
  // 이미 등록된 실제 관리자/대회팀장 계정이 있는 경우, 기존 개발용 계정은 자동 정리합니다.
  const legacyDefaultCount = await db.prepare(`SELECT COUNT(*) AS n FROM operators WHERE name='관리자' AND phone='01000000000' AND (account_type='ADMIN' OR role='관리자' OR access='ALL')`).first();
  if (legacyDefaultCount && Number(legacyDefaultCount.n || 0) > 0) {
    const otherCount = await db.prepare(`SELECT COUNT(*) AS n FROM operators WHERE NOT (name='관리자' AND phone='01000000000')`).first();
    if (otherCount && Number(otherCount.n || 0) > 0) {
      await db.prepare(`DELETE FROM operators WHERE name='관리자' AND phone='01000000000' AND (account_type='ADMIN' OR role='관리자' OR access='ALL')`).run();
    }
  }

  // 환경변수에 명시한 관리자만 선택적으로 생성합니다.
  // 1.0ver-env-fix: 이미 같은 이름/연락처의 대회팀장 행이 있어도 전체관리자 행을 별도로 보장합니다.
  // 기존 개발용 기본값(관리자 / 01000000000)은 완전히 무시합니다.
  const adminName = safeStr(env.KCL_ADMIN_NAME);
  const adminPhone = normalizePhone(env.KCL_ADMIN_PHONE);
  const adminAffiliation = safeStr(env.KCL_ADMIN_AFFILIATION) || 'KCL';
  const isLegacyDefaultAdmin = adminName === '관리자' && adminPhone === '01000000000';
  if (adminName && adminPhone && !isLegacyDefaultAdmin) {
    const foundAdmin = await db.prepare(`
      SELECT id FROM operators
      WHERE name=? AND phone=?
        AND (account_type='ADMIN' OR access='ALL' OR role LIKE '%관리자%' OR role LIKE '%총괄%')
      LIMIT 1
    `).bind(adminName, adminPhone).first();
    if (foundAdmin && foundAdmin.id) {
      await db.prepare(`
        UPDATE operators
        SET account_type='ADMIN', access='ALL', role='관리자', affiliation=?, updated_at=?
        WHERE id=?
      `).bind(adminAffiliation, nowIso(), foundAdmin.id).run();
    } else {
      await db.prepare(`INSERT INTO operators (account_type, name, affiliation, phone, access, team_group, role, created_at, updated_at)
        VALUES ('ADMIN', ?, ?, ?, 'ALL', '', '관리자', ?, ?)`)
        .bind(adminName, adminAffiliation, adminPhone, nowIso(), nowIso()).run();
    }
  }
}

async function dispatch(action, args, env, request) {
  const handlers = {
    ping: async () => ({ success: true, message: 'KCL Cloudflare API 연결 성공', now: nowIso() }),
    getConfig: () => getConfig(env),
    judgeLogin: () => judgeLogin(env, args[0], args[1], request),
    adminLogin: () => adminLogin(env, args[0], args[1], args[2], request),
    getAdminConsoleData: () => getAdminConsoleData(env, args[0]),
    updateCompetitionAdminSettings: () => updateCompetitionAdminSettings(env, args[0], args[1]),
    upsertOperatorAccount: () => upsertOperatorAccount(env, args[0], args[1]),
    deleteOperatorAccount: () => deleteOperatorAccount(env, args[0], args[1]),
    listOperators: () => listOperators(env, args[0], args[1]),
    clearOperators: () => clearOperators(env, args[0], args[1]),
    getRegistryData: () => getRegistryData(env, args[0], args[1]),
    listParticipants: () => listParticipants(env, args[0], args[1]),
    upsertParticipant: () => upsertParticipant(env, args[0], args[1]),
    deleteParticipant: () => deleteParticipant(env, args[0], args[1]),
    clearParticipants: () => clearParticipants(env, args[0], args[1]),
    clearScores: () => clearScores(env, args[0], args[1]),
    importParticipants: () => importParticipants(env, args[0], args[1]),
    importOperators: () => importOperators(env, args[0], args[1]),
    getRegistrationTemplates: () => getRegistrationTemplates(),
    getParticipantAssignments: () => getParticipantAssignments(env, args[0], args[1]),
    submitScores: () => submitScores(env, args[0], null, request),
    submitWithSignature: () => submitScores(env, args[0], args[1] || (args[0] && (args[0].signatureBase64 || args[0].signatureData || args[0].signature)), request),
    getReviewList: () => getReviewList(env, args[0], args[1]),
    updateReviewRow: () => updateReviewRow(env, args[0], args[1], args[2], args[3], args[4], args[5]),
    updateReviewStatus: () => updateReviewStatus(env, args[0], [args[1]], args[2], args[3], args[4]),
    updateReviewStatusBatch: () => updateReviewStatus(env, args[0], args[1], args[2], args[3], args[4]),
    deleteReviewRow: () => deleteReviewRow(env, args[0], args[1], args[3] || args[2]),
    getRanking: () => getRanking(env, args[0], args[1]),
    getRankingDetail: () => getRankingDetail(env, args[0], args[1], args[2], args[3]),
    getFinalReport: () => getFinalReport(env, args[0], args[1]),
    sendOTP: () => sendOTP(env, args[0], args[1], args[2], request),
    verifyOTP: () => verifyOTP(env, args[0], args[1], args[2], args[3], request),
    sendTestSMS: () => sendTestSMS(env, args[0], args[1], request),
    refreshAdminActor: () => refreshAdminActor(env, args[0]),
    getSystemStatus: () => getSystemStatus(env, args[0]),
    createDebriefPdfFromPayload: () => ({ success: false, message: '1.0ver에서는 브라우저 인쇄 기능으로 PDF 저장을 지원합니다. 화면의 PDF 저장 버튼을 다시 눌러 저장하세요.' }),
    createRankingDetailPdf: () => ({ success: false, message: '1.0ver에서는 브라우저 인쇄 기능으로 PDF 저장을 지원합니다. 화면의 PDF 저장 버튼을 다시 눌러 저장하세요.' }),
    generateCuppingComment: () => generateCuppingComment(args[0]),
    generateKbcComment: () => generateKbcComment(args[0]),
    generateKcacComment: () => generateKcacComment(args[0]),
    generateMobComment: () => generateMobComment(args[0]),
    generateIkrcComment: () => generateIkrcComment(args[0]),
    getMobCalibrationParticipantNumbers: () => getMobCalibrationParticipantNumbers(env, args[0], args[1], args[2]),
    getMobCalibrationResultsByParticipant: () => getMobCalibrationResultsByParticipant(env, args[0], args[1], args[2], args[3]),
    markMobCalibrationChecked: () => markMobCalibrationChecked(env, args[0], args[1], args[2], args[3], args[4]),
    getIkrcSeedToCupConsole: () => getIkrcSeedToCupConsole(env, args[0]),
    saveIkrcSeedToCupMatch: () => saveIkrcSeedToCupMatch(env, args[0], args[1]),
    updateIkrcSeedToCupResult: () => updateIkrcSeedToCupResult(env, args[0], args[1], args[2], args[3]),
    getIkrcCalibrationCupNumbers: () => getIkrcCalibrationCupNumbers(env, args[0], args[1]),
    getIkrcCalibrationResultsByCup: () => getIkrcCalibrationResultsByCup(env, args[0], args[1], args[2]),
    markIkrcCalibrationChecked: () => markIkrcCalibrationChecked(env, args[0], args[1], args[2], args[3], args[4]),
    cleanupCompetitionSheetTabs: async () => ({ success: true, message: 'Cloudflare D1 기준으로 관리 중입니다. 별도 정리 작업은 필요하지 않습니다.', hiddenSheets: [] })
  };
  if (!handlers[action]) return { success: false, message: '아직 1.0ver에 구현되지 않은 기능입니다: ' + action };
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


function timingSafeEqual_(a, b) {
  const aa = String(a ?? '');
  const bb = String(b ?? '');
  let diff = aa.length ^ bb.length;
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (aa.charCodeAt(i) || 0) ^ (bb.charCodeAt(i) || 0);
  }
  return diff === 0;
}

async function buildActorFromOperatorIdentity_(env, name, phone) {
  name = safeStr(name); phone = normalizePhone(phone);
  if (!name || !phone) return null;
  if (name === '관리자' && phone === '01000000000') return null;
  const rows = await env.DB.prepare('SELECT * FROM operators WHERE phone=? ORDER BY id').bind(phone).all();
  const list = operatorRowsForLogin_(rows.results || [], name, phone);
  if (!list.length || !list.some(row => operatorIsAdminRow_(row))) return null;
  const hydrated = await hydrateActorFromOperators_(env, { name, judgeName: name, phone });
  if (!hydrated || !hasAdmin(hydrated)) return null;
  hydrated.success = true;
  hydrated.judgeToken = await issueSession(env, 'judge', hydrated, 21600);
  return hydrated;
}

async function adminLogin(env, adminId, password, secretCode, request = null) {
  adminId = safeStr(adminId);
  password = safeStr(password);
  secretCode = safeStr(secretCode);
  if (!adminId) return { success: false, message: '아이디를 입력해주세요.' };
  if (!password) return { success: false, message: '비밀번호를 입력해주세요.' };
  if (!secretCode) return { success: false, message: '시크릿 코드를 입력해주세요.' };

  const requiredSecretCode = safeStr(env.KCL_ADMIN_SECRET_CODE || env.ADMIN_SECRET_CODE || '5061');
  if (!timingSafeEqual_(secretCode, requiredSecretCode)) {
    return { success: false, message: '시크릿 코드가 올바르지 않습니다.' };
  }

  const idKey = await sha256Hex_(adminId.toLowerCase());
  const idLimit = await rateLimit_(env, 'admin-login-id:' + idKey, 15, 10 * 60);
  const ipLimit = await rateLimit_(env, 'admin-login-ip:' + await sha256Hex_(clientIp_(request) || 'unknown'), 60, 10 * 60);
  if (!idLimit.ok || !ipLimit.ok) return { success: false, message: '관리자 로그인 시도가 많습니다. 잠시 후 다시 시도해주세요.' };

  const configuredPassword = safeStr(env.KCL_ADMIN_PASSWORD || env.KCL_ADMIN_PIN || env.ADMIN_PASSWORD || '');
  const idPhone = normalizePhone(adminId);
  const normId = normalizePersonName_(adminId);
  const q = await env.DB.prepare(`SELECT * FROM operators
    WHERE phone=? OR name=? OR REPLACE(LOWER(name), ' ', '')=?
    ORDER BY id`).bind(idPhone, adminId, normId).all();
  const candidates = q.results || [];
  const adminCandidates = [];
  const seen = new Set();
  for (const row of candidates) {
    if (!row || !row.phone || !row.name) continue;
    const key = normalizePersonName_(row.name) + '|' + normalizePhone(row.phone);
    if (seen.has(key)) continue;
    seen.add(key);
    const rows = await env.DB.prepare('SELECT * FROM operators WHERE phone=? ORDER BY id').bind(normalizePhone(row.phone)).all();
    const list = operatorRowsForLogin_(rows.results || [], row.name, row.phone);
    if (list.some(r => operatorIsAdminRow_(r))) adminCandidates.push({ name: row.name, phone: normalizePhone(row.phone) });
  }
  if (!adminCandidates.length) return { success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' };

  let matched = null;
  for (const c of adminCandidates) {
    if (c.name === '관리자' && c.phone === '01000000000') continue;
    if (configuredPassword) {
      if (timingSafeEqual_(password, configuredPassword)) { matched = c; break; }
    } else {
      // Compatibility mode: 기존 등록 정보만 있는 현장에서는 비밀번호 칸에 기존 연락처를 입력하면 로그인됩니다.
      // 더 강한 보안이 필요하면 Cloudflare Pages Secret에 KCL_ADMIN_PASSWORD를 설정하세요.
      if (normalizePhone(password) === c.phone) { matched = c; break; }
    }
  }
  if (!matched) return { success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' };
  const actor = await buildActorFromOperatorIdentity_(env, matched.name, matched.phone);
  if (!actor) return { success: false, message: '전체 관리자 권한이 확인되지 않았습니다.' };
  actor.authMode = configuredPassword ? 'admin-password+secret' : 'compat-phone-password+secret';
  return actor;
}

async function judgeLogin(env, name, phone, request = null) {
  name = safeStr(name); phone = normalizePhone(phone);
  if (!name) return { success: false, message: '이름을 입력해주세요.' };
  if (!phone) return { success: false, message: '연락처를 입력해주세요.' };
  const phoneLimit = await rateLimit_(env, 'login-phone:' + await sha256Hex_(phone), 20, 10 * 60);
  const ipLimit = await rateLimit_(env, 'login-ip:' + await sha256Hex_(clientIp_(request) || 'unknown'), 80, 10 * 60);
  if (!phoneLimit.ok || !ipLimit.ok) return { success: false, message: '로그인 시도가 많습니다. 잠시 후 다시 시도해주세요.' };
  if (name === '관리자' && phone === '01000000000') {
    return { success: false, message: '기본 관리자 계정은 비활성화되었습니다. 새로 등록한 관리자 계정으로 로그인해주세요.' };
  }
  const rows = await env.DB.prepare('SELECT * FROM operators WHERE phone=? ORDER BY id').bind(phone).all();
  const list = operatorRowsForLogin_(rows.results || [], name, phone);
  if (!list.length) return { success: false, message: '등록된 정보를 찾을 수 없습니다. 이름과 연락처를 확인해주세요.' };

  const admin = list.find(x => operatorIsAdminRow_(x));
  const primary = admin || bestOperatorRow_(list);
  const highest = bestOperatorRow_(list);
  const primaryType = admin ? 'ADMIN' : normalizeAccountType_(highest && highest.account_type, highest && highest.role);
  const primaryRole = admin ? '관리자' : safeStr((highest && highest.role) || primary.role || '센서리 심사위원');

  const accessSet = new Set();
  const teamMap = {}, roleMap = {}, accountTypeMap = {};
  for (const row of list) {
    const rowType = normalizeAccountType_(row.account_type || 'JUDGE', row.role || '');
    const role = safeStr(row.role || '');
    const team = safeStr(row.team_group || '');
    const codes = accessCodes_(row.access || '');
    if (codes.includes('ALL')) {
      accessSet.add('ALL');
      COMPETITION_CODES.forEach(code => {
        if (team) teamMap[code] = team;
        if (role) roleMap[code] = role;
        if (rowType) accountTypeMap[code] = rowType;
      });
      continue;
    }
    for (const code of codes) {
      accessSet.add(code);
      if (team) teamMap[code] = team;
      if (role) roleMap[code] = role;
      if (rowType) accountTypeMap[code] = rowType;
    }
  }
  const access = accessSet.has('ALL') ? 'ALL' : Array.from(accessSet).filter(c => COMPETITION_CODES.includes(c)).sort((a,b) => COMPETITION_CODES.indexOf(a) - COMPETITION_CODES.indexOf(b)).join(',');
  const result = {
    success: true,
    name: primary.name,
    affiliation: primary.affiliation || '',
    phone,
    type: primaryType,
    accountType: primaryType,
    role: primaryRole,
    access,
    accessCodes: access === 'ALL' ? ['ALL'] : access.split(',').filter(Boolean),
    teamGroup: primary.team_group || '',
    teamMap,
    roleMap,
    accountTypeMap,
    operatorRows: list.map(r => ({
      rowIndex: r.id,
      accountType: normalizeAccountType_(r.account_type || '', r.role || ''),
      access: normalizeAccess_(r.access),
      teamGroup: r.team_group || '',
      role: r.role || ''
    }))
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
async function hydrateActorFromOperators_(env, actor) {
  if (!actor) return null;
  const name = safeStr(actor.name || actor.judgeName || actor.operatorName || '');
  const phone = normalizePhone(actor.phone || '');
  if (!name || !phone) return actor;
  try {
    const rows = await env.DB.prepare('SELECT * FROM operators WHERE phone=? ORDER BY id').bind(phone).all();
    const list = operatorRowsForLogin_(rows.results || [], name, phone);
    if (!list.length) return actor;

    const admin = list.find(x => operatorIsAdminRow_(x));
    const highest = bestOperatorRow_(list);
    const primary = admin || highest || {};
    const primaryType = admin ? 'ADMIN' : normalizeAccountType_(highest && highest.account_type, highest && highest.role);
    const primaryRole = admin ? '관리자' : safeStr((highest && highest.role) || primary.role || actor.role || '');

    const accessSet = new Set();
    const teamMap = {}, roleMap = {}, accountTypeMap = {};
    for (const row of list) {
      const rowType = normalizeAccountType_(row.account_type || 'JUDGE', row.role || '');
      const role = safeStr(row.role || '');
      const team = safeStr(row.team_group || '');
      const codes = accessCodes_(row.access || '');
      if (codes.includes('ALL') || rowType === 'ADMIN') {
        accessSet.add('ALL');
        COMPETITION_CODES.forEach(code => {
          if (team) teamMap[code] = team;
          if (role) roleMap[code] = role;
          if (rowType) accountTypeMap[code] = rowType;
        });
        continue;
      }
      for (const code of codes) {
        accessSet.add(code);
        if (team) teamMap[code] = team;
        if (role) roleMap[code] = role;
        if (rowType) accountTypeMap[code] = rowType;
      }
    }
    const access = accessSet.has('ALL') ? 'ALL' : Array.from(accessSet).filter(c => COMPETITION_CODES.includes(c)).sort((a,b) => COMPETITION_CODES.indexOf(a) - COMPETITION_CODES.indexOf(b)).join(',');
    return {
      ...actor,
      name: primary.name || name,
      judgeName: primary.name || name,
      affiliation: primary.affiliation || actor.affiliation || '',
      phone,
      type: primaryType,
      accountType: primaryType,
      role: primaryRole,
      access,
      accessCodes: access === 'ALL' ? ['ALL'] : access.split(',').filter(Boolean),
      teamGroup: primary.team_group || actor.teamGroup || '',
      teamMap: { ...(actor.teamMap || {}), ...teamMap },
      roleMap: { ...(actor.roleMap || {}), ...roleMap },
      accountTypeMap: { ...(actor.accountTypeMap || {}), ...accountTypeMap },
      operatorRows: list.map(r => ({
        rowIndex: r.id,
        accountType: normalizeAccountType_(r.account_type || '', r.role || ''),
        access: normalizeAccess_(r.access),
        teamGroup: r.team_group || '',
        role: r.role || ''
      }))
    };
  } catch (e) {
    return actor;
  }
}

async function actorFromIdentityFallback_(env, actorArg) {
  const raw = actorArg && typeof actorArg === 'object' ? actorArg : {};
  const name = safeStr(raw.name || raw.judgeName || raw.operatorName || '');
  const phone = normalizePhone(raw.phone || '');
  if (!name || !phone) return null;
  if (name === '관리자' && phone === '01000000000') return null;
  const rows = await env.DB.prepare('SELECT * FROM operators WHERE phone=? ORDER BY id').bind(phone).all();
  const list = operatorRowsForLogin_(rows.results || [], name, phone);
  if (!list.length) return null;
  const base = { name, judgeName: name, phone };
  const hydrated = await hydrateActorFromOperators_(env, base);
  if (!hydrated) return null;
  hydrated.judgeToken = await issueSession(env, 'judge', hydrated, 21600);
  return hydrated;
}
async function getActor(env, actor) {
  if (!actor) return null;
  if (typeof actor === 'string') actor = { judgeToken: actor };

  // Stage7 auth fix:
  // 이전 버전의 브라우저 저장값에는 judgeToken이 없거나, 보안 강화 후 세션이 만료되어
  // 관리자/등록 권한이 끊기는 경우가 있었습니다.
  // 이 경우에도 이름+연락처가 포함되어 있으면 D1 operators 테이블을 다시 조회해
  // 최신 권한을 재발급합니다. 단, D1에 실제 등록된 계정만 통과합니다.
  const token = safeStr(actor.judgeToken || actor.actorToken || '');
  if (token) {
    const row = await env.DB.prepare('SELECT payload_json FROM sessions WHERE token=? AND expires_at > ?').bind(token, nowIso()).first();
    const payload = row ? parseJson(row.payload_json, null) : null;
    if (payload) {
      const hydrated = await hydrateActorFromOperators_(env, payload);
      if (hydrated) {
        // Keep the still-valid token attached. Older session payloads were saved
        // before judgeToken was added, so returning them without a token made
        // follow-up admin calls lose authorization.
        hydrated.judgeToken = token;
        return hydrated;
      }
    }
  }

  return actorFromIdentityFallback_(env, actor);
}
async function requireActorForCode_(env, actorArg, code, message) {
  const actor = await getActor(env, actorArg);
  if (!actor) return { ok: false, res: { success: false, message: message || '로그인이 만료되었습니다. 다시 로그인해주세요.' } };
  if (code && !hasAccess(actor, code)) return { ok: false, res: { success: false, message: code + ' 접근 권한이 없습니다.' } };
  return { ok: true, actor };
}
async function requireManageActorForCode_(env, actorArg, code, message) {
  const actor = await getActor(env, actorArg);
  if (!actor) return { ok: false, res: { success: false, message: message || '로그인이 만료되었습니다. 다시 로그인해주세요.' } };
  if (code && !hasManageAccess(actor, code)) return { ok: false, res: { success: false, message: code + ' 관리 권한이 없습니다.' } };
  return { ok: true, actor };
}
function payloadIdentityCandidates_(payload) {
  payload = payload && typeof payload === 'object' ? payload : {};
  const judge = payload.judge && typeof payload.judge === 'object' ? payload.judge : {};
  return {
    names: [payload.judgeName, payload.name, payload.operatorName, judge.name],
    phones: [payload.judgePhone, payload.phone, payload.operatorPhone, judge.phone]
  };
}
function scoreOwnedByActor_(scoreRow, actor) {
  if (!scoreRow || !actor) return false;
  const actorName = normalizePersonName_(actor.name || actor.judgeName || actor.operatorName || '');
  const actorPhone = normalizePhone(actor.phone || '');
  const payload = parseJson(scoreRow.payload_json, {});
  const ids = payloadIdentityCandidates_(payload);
  const names = [scoreRow.judge_name].concat(ids.names || []).map(v => normalizePersonName_(v)).filter(Boolean);
  const phones = (ids.phones || []).map(v => normalizePhone(v)).filter(Boolean);
  // 제출 payload에 연락처가 남아 있으면 연락처를 우선으로 확인합니다.
  if (actorPhone && phones.some(p => p === actorPhone)) return true;
  // 기존 제출 데이터에는 연락처가 저장되지 않는 경우가 있어 심사위원명으로도 소유권을 확인합니다.
  if (actorName && names.some(n => n === actorName)) return true;
  return false;
}
function canReviewScoreRow_(scoreRow, actor, code) {
  return hasManageAccess(actor, code) || scoreOwnedByActor_(scoreRow, actor);
}
function hasAdmin(actor) {
  if (!actor) return false;
  if (actor.type === 'ADMIN' || actor.accountType === 'ADMIN' || actor.role === '관리자' || /관리자|admin|총괄/i.test(actor.role || '') || normalizeAccess_(actor.access) === 'ALL') return true;
  const rows = Array.isArray(actor.operatorRows) ? actor.operatorRows : [];
  return rows.some(r => r.accountType === 'ADMIN' || normalizeAccess_(r.access) === 'ALL' || /관리자|admin|총괄/i.test(r.role || ''));
}
function hasAccess(actor, code) {
  if (!actor) return false;
  if (hasAdmin(actor)) return true;
  const access = actorAccessCodes_(actor);
  if (access.includes('ALL')) return true;
  return access.includes(String(code || '').toUpperCase());
}

function filterConfigsForActor_(configs, actor) {
  if (hasAdmin(actor)) return configs || [];
  const codes = actorAccessCodes_(actor);
  if (codes.includes('ALL')) return configs || [];
  return (configs || []).filter(c => codes.includes(String(c.code || '').toUpperCase()));
}
async function getAdminConsoleData(env, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!actor || (!hasAdmin(actor) && !hasTeamLead(actor))) return { success: false, message: '관리 권한이 없습니다.' };
  const cfg = await getConfig(env);
  const rows = await env.DB.prepare('SELECT * FROM operators ORDER BY id').all();
  const visibleConfigs = hasAdmin(actor) ? cfg.configs : filterConfigsForActor_(cfg.configs, actor);
  const visibleRows = hasAdmin(actor) ? (rows.results || []) : (rows.results || []).filter(r => operatorRowVisibleToActor_(actor, r));
  return {
    success: true,
    configs: visibleConfigs,
    accounts: visibleRows.map(r => ({
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
  const code = safeStr(payload && payload.code).toUpperCase();
  if (!code) return { success: false, message: '대회코드가 없습니다.' };
  if (!actor || !hasManageAccess(actor, code)) return { success: false, message: '대회 설정 권한이 없습니다.' };
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
  let id = Number(payload && (payload.rowIndex || payload.row));
  const data = {
    accountType: normalizeAccountType_(payload.accountType || payload.type || 'JUDGE', payload.role || ''),
    name: safeStr(payload.name),
    phone: normalizePhone(payload.phone),
    affiliation: safeStr(payload.affiliation || payload.affil),
    access: safeStr(payload.access || ''),
    teamGroup: safeStr(payload.teamGroup || payload.team || ''),
    role: safeStr(payload.role || '센서리 심사위원')
  };
  if (!data.name || !data.phone) return { success: false, message: '이름과 연락처를 입력해주세요.' };

  data.access = normalizeAccess_(data.access || '');
  if (!data.access) data.access = 'ALL';
  if (data.accountType === 'ADMIN') {
    data.access = 'ALL';
    data.role = '관리자';
    data.teamGroup = '';
  } else if (data.accountType === 'TEAMLEAD' && !data.role) {
    data.role = '팀장';
  } else if (data.accountType === 'STAFF' && !data.role) {
    data.role = '운영진';
  }

  // 같은 엑셀을 다시 업로드해도 중복 계정이 쌓이지 않도록 이름+연락처+권한대회 기준으로만 갱신합니다.
  // 같은 사람이 KCR 팀장과 KCAC 팀장을 병행하는 경우처럼 권한대회가 다르면 별도 행으로 유지해야 로그인 시 두 대회가 모두 노출됩니다.
  if (!id) {
    const existing = await env.DB.prepare(`SELECT id FROM operators WHERE name=? AND phone=? AND COALESCE(access,'')=? ORDER BY id LIMIT 1`)
      .bind(data.name, data.phone, data.access).first();
    if (existing && existing.id) id = Number(existing.id);
  }

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
  const id = Number(rowIndex);
  if (!id) return { success: false, message: '삭제할 계정을 찾을 수 없습니다.' };
  const target = await env.DB.prepare('SELECT * FROM operators WHERE id=?').bind(id).first();
  if (!target) return { success: false, message: '이미 삭제되었거나 존재하지 않는 계정입니다.' };
  if (operatorIsAdminRow_(target)) {
    const adminCount = await env.DB.prepare(`SELECT COUNT(*) AS n FROM operators WHERE account_type='ADMIN' OR access='ALL' OR role LIKE '%관리자%' OR role LIKE '%총괄%'`).first();
    if (Number(adminCount && adminCount.n || 0) <= 1) return { success: false, message: '마지막 관리자 계정은 삭제할 수 없습니다.' };
  }
  await env.DB.prepare('DELETE FROM operators WHERE id=?').bind(id).run();
  return { success: true, message: '삭제 완료' };
}
function operatorRowOut_(r) {
  return {
    rowIndex: r.id,
    accountType: r.account_type,
    type: r.account_type,
    name: r.name || '',
    affiliation: r.affiliation || '',
    phone: r.phone || '',
    access: r.access || '',
    teamGroup: r.team_group || '',
    role: r.role || ''
  };
}
async function listOperators(env, competitionCode, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor) && !hasTeamLead(actor)) return { success: false, message: '권한 목록 조회 권한이 없습니다.' };
  const code = safeStr(competitionCode).toUpperCase();
  const rs = await env.DB.prepare('SELECT * FROM operators ORDER BY account_type DESC, access, id').all();
  let rows = rs.results || [];
  if (!hasAdmin(actor)) rows = rows.filter(r => operatorRowVisibleToActor_(actor, r));
  if (code && code !== 'ALL') {
    rows = rows.filter(r => {
      if (operatorIsAdminRow_(r)) return true;
      const codes = accessCodes_(r.access || '');
      return codes.includes(code);
    });
  }
  return { success: true, operators: rows.map(operatorRowOut_) };
}
async function clearOperators(env, competitionCode, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success: false, message: '운영 초기화는 전체 관리자만 가능합니다.' };
  const checked = strictCompetitionCode_(competitionCode, '운영계정 초기화');
  if (checked.error) return checked.error;
  const code = checked.code;
  const rs = await env.DB.prepare('SELECT * FROM operators ORDER BY id').all();
  let deleted = 0, updated = 0, skippedAdmin = 0, skippedOther = 0;
  for (const row of (rs.results || [])) {
    if (operatorIsAdminRow_(row)) { skippedAdmin++; continue; }
    const codes = accessCodes_(row.access || '');
    if (!codes.includes(code)) { skippedOther++; continue; }
    const remaining = codes.filter(c => c !== code && c !== 'ALL');
    if (!remaining.length) {
      await env.DB.prepare('DELETE FROM operators WHERE id=?').bind(row.id).run();
      deleted++;
    } else {
      await env.DB.prepare('UPDATE operators SET access=?, updated_at=? WHERE id=?').bind(normalizeAccess_(remaining.join(',')), nowIso(), row.id).run();
      updated++;
    }
  }
  return { success: true, message: `${code} 운영계정 초기화 완료: 삭제 ${deleted}건, 권한 수정 ${updated}건. 다른 대회 권한과 관리자 계정은 유지했습니다.` };
}


// ══════════════════════════════════════════
// 1.0ver 등록/블라인드 매핑 관리
// ══════════════════════════════════════════
function normalizeHeaderKey_(h) {
  return safeStr(h).replace(/^\ufeff/, '').replace(/[\s_\-\/()\[\].]/g, '').toLowerCase();
}
function pickByAliases_(row, aliases, fallback='') {
  if (!row || typeof row !== 'object') return fallback;
  const norm = {};
  Object.keys(row).forEach(k => { norm[normalizeHeaderKey_(k)] = row[k]; });
  for (const a of aliases || []) {
    const key = normalizeHeaderKey_(a);
    if (Object.prototype.hasOwnProperty.call(norm, key) && safeStr(norm[key]) !== '') return norm[key];
  }
  return fallback;
}
function parseCsvText_(text) {
  text = String(text || '').replace(/^\ufeff/, '');
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i=0;i<text.length;i++) {
    const ch = text[i], next = text[i+1];
    if (inQ) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row=[]; cell=''; }
      else if (ch !== '\r') cell += ch;
    }
  }
  row.push(cell); rows.push(row);
  const header = (rows.shift() || []).map(x => safeStr(x));
  return rows.filter(r => r.some(c => safeStr(c))).map(r => {
    const obj = {};
    header.forEach((h,i) => { obj[h || ('col' + i)] = r[i] == null ? '' : r[i]; });
    return obj;
  });
}
function rowsFromPayload_(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  if (safeStr(payload.csv)) return parseCsvText_(payload.csv);
  return [];
}
function participantNumberFromRow_(row, code) {
  code = safeStr(code).toUpperCase();
  if (code === 'KTCC') return firstNonEmpty([pickByAliases_(row, ['팀번호','team_no','teamNo','team number','번호'])]);
  if (code === 'KCR') return firstNonEmpty([pickByAliases_(row, ['컵번호','cup_no','cupNo','출품번호','sample_no','sampleNo','unique_no','고유번호','번호'])]);
  if (code === 'IKRC') return firstNonEmpty([pickByAliases_(row, ['샘플번호','sample_no','sampleNo','참가자번호','participant_no','player_no','unique_no','번호'])]);
  return firstNonEmpty([pickByAliases_(row, ['참가자번호','participant_no','participantNo','player_no','playerNo','unique_no','고유번호','번호'])]);
}
function participantPayloadFromRow_(raw, defaultCode='') {
  const code = safeStr(pickByAliases_(raw, ['대회코드','competition_code','competitionCode','code'], defaultCode === 'ALL' ? '' : defaultCode)).toUpperCase();
  const name = safeStr(pickByAliases_(raw, ['선수명','참가자명','이름','name','playerName','participantName']));
  const affiliation = safeStr(pickByAliases_(raw, ['소속','affiliation','company','업체명']));
  const phone = normalizePhone(pickByAliases_(raw, ['연락처','전화번호','휴대폰','phone','mobile']));
  const teamName = safeStr(pickByAliases_(raw, ['팀명','team_name','teamName']));
  const teamNo = safeStr(pickByAliases_(raw, ['팀번호','team_no','teamNo','예선팀번호','결선팀번호']));
  const uniqueNo = safeStr(pickByAliases_(raw, ['고유번호','unique_no','uniqueNo','참가자번호','선수번호','번호']));
  const prelim = safeStr(pickByAliases_(raw, ['예선컵번호','prelim_cup_no','prelimCupNo','예선번호','예선출품번호','예선샘플번호','예선팀번호','예선블라인드번호']));
  const main = safeStr(pickByAliases_(raw, ['본선컵번호','main_cup_no','mainCupNo','본선번호','본선출품번호','본선샘플번호','본선팀번호']));
  const final = safeStr(pickByAliases_(raw, ['결선컵번호','final_cup_no','finalCupNo','결선번호','결선출품번호','결선샘플번호','결선팀번호','결선참가번호']));
  const cupNo = safeStr(pickByAliases_(raw, ['컵번호','cup_no','cupNo','출품번호','예선출품번호','결선출품번호','예선컵번호','결선컵번호']));
  const sampleNo = safeStr(pickByAliases_(raw, ['샘플번호','sample_no','sampleNo','예선샘플번호','결선샘플번호']));
  const number = participantNumberFromRow_(raw, code);
  const extra = {};
  Object.keys(raw || {}).forEach(k => { if (safeStr(raw[k]) !== '') extra[k] = raw[k]; });
  return {
    competitionCode: code,
    name: name || teamName,
    affiliation,
    phone,
    uniqueNo: uniqueNo || ((code === 'KCR' || code === 'KCAC') ? '' : number),
    prelimCupNo: prelim,
    mainCupNo: main,
    finalCupNo: final,
    cupNo: (code === 'KCR' || code === 'KCAC') ? '' : cupNo,
    sampleNo: sampleNo || (code === 'IKRC' ? number : ''),
    teamName,
    teamNo: teamNo || (code === 'KTCC' ? number : ''),
    extra
  };
}
function operatorPayloadFromRow_(raw, defaultCode='') {
  const access = safeStr(pickByAliases_(raw, ['권한대회','access','대회코드','competition_code','code'], defaultCode === 'ALL' ? '' : defaultCode)).toUpperCase();
  return {
    accountType: normalizeAccountType_(pickByAliases_(raw, ['계정유형','account_type','accountType','type'], 'JUDGE'), pickByAliases_(raw, ['역할','role','judgeRole'], '')), 
    name: safeStr(pickByAliases_(raw, ['심사위원명','이름','name','judgeName'])),
    affiliation: safeStr(pickByAliases_(raw, ['소속','affiliation','company'])),
    phone: normalizePhone(pickByAliases_(raw, ['연락처','전화번호','휴대폰','phone','mobile'])),
    access,
    teamGroup: safeStr(pickByAliases_(raw, ['팀','평가팀','team_group','teamGroup','group'])),
    role: safeStr(pickByAliases_(raw, ['역할','role','judgeRole'], '센서리 심사위원'))
  };
}

function normalizeParticipantImportRows_(rows, defaultCode='') {
  const plain = [];
  const teamGroups = new Map();
  (rows || []).forEach((raw, idx) => {
    const code = safeStr(pickByAliases_(raw, ['대회코드','competition_code','competitionCode','code'], defaultCode === 'ALL' ? '' : defaultCode)).toUpperCase();
    if (code !== 'KTCC') { plain.push(raw); return; }
    const teamNo = safeStr(pickByAliases_(raw, ['팀번호','team_no','teamNo','예선팀번호','결선팀번호']));
    const teamName = safeStr(pickByAliases_(raw, ['팀명','team_name','teamName']));
    const fallbackName = safeStr(pickByAliases_(raw, ['선수명','참가자명','이름','name','playerName','participantName']));
    const key = [code, teamNo || 'NO' + idx, teamName || fallbackName || 'TEAM' + idx].join('::');
    if (!teamGroups.has(key)) teamGroups.set(key, []);
    teamGroups.get(key).push(raw);
  });
  teamGroups.forEach(groupRows => {
    const first = groupRows[0] || {};
    const teamNo = safeStr(pickByAliases_(first, ['팀번호','team_no','teamNo','예선팀번호','결선팀번호']));
    const teamName = safeStr(pickByAliases_(first, ['팀명','team_name','teamName'])) || ('KTCC-' + (teamNo || '팀'));
    let members = [];
    groupRows.forEach(r => {
      const rowMember = {
        name: safeStr(pickByAliases_(r, ['선수명','참가자명','이름','name','playerName','participantName'])),
        affiliation: safeStr(pickByAliases_(r, ['소속','affiliation','company','업체명'])),
        phone: normalizePhone(pickByAliases_(r, ['연락처','전화번호','휴대폰','phone','mobile'])),
        note: safeStr(pickByAliases_(r, ['비고','메모','note','memo']))
      };
      if (rowMember.name || rowMember.affiliation || rowMember.phone || rowMember.note) members.push(rowMember);
      for (let n=1; n<=4; n++) {
        const m = {
          name: safeStr(pickByAliases_(r, ['팀원' + n + '명','팀원' + n + '이름','member' + n + 'Name'])),
          affiliation: safeStr(pickByAliases_(r, ['팀원' + n + '소속','member' + n + 'Affiliation'])),
          phone: normalizePhone(pickByAliases_(r, ['팀원' + n + '연락처','팀원' + n + '전화번호','member' + n + 'Phone'])),
          note: ''
        };
        if (m.name || m.affiliation || m.phone) members.push(m);
      }
    });
    members = members.filter((m, idx, arr) => (m.name || m.affiliation || m.phone || m.note) && arr.findIndex(x => x.name === m.name && x.phone === m.phone) === idx);
    const merged = { ...first };
    merged['대회코드'] = 'KTCC';
    merged['팀번호'] = teamNo;
    merged['팀명'] = teamName;
    merged['선수명'] = teamName;
    merged['소속'] = members[0] && members[0].affiliation || safeStr(pickByAliases_(first, ['소속','affiliation','company','업체명']));
    merged['연락처'] = members[0] && members[0].phone || normalizePhone(pickByAliases_(first, ['연락처','전화번호','휴대폰','phone','mobile']));
    merged['예선컵번호'] = safeStr(pickByAliases_(first, ['예선컵번호','예선번호','예선팀번호','컵번호','팀번호'])) || teamNo;
    merged['결선컵번호'] = safeStr(pickByAliases_(first, ['결선컵번호','결선번호','결선팀번호'])) || safeStr(pickByAliases_(first, ['결선참가번호']));
    members.slice(0, 4).forEach((m, i) => {
      const n = i + 1;
      merged['팀원' + n + '명'] = m.name;
      merged['팀원' + n + '소속'] = m.affiliation;
      merged['팀원' + n + '연락처'] = m.phone;
    });
    merged['비고'] = members.map((m, i) => {
      const parts = [m.name, m.affiliation, m.phone].filter(Boolean).join('/');
      return parts ? ('팀원' + (i + 1) + ':' + parts) : '';
    }).filter(Boolean).join(' | ') || safeStr(pickByAliases_(first, ['비고','메모','note','memo']));
    plain.push(merged);
  });
  return plain;
}
async function getRegistryData(env, competitionCode, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor) && !hasTeamLead(actor)) return { success: false, message: '등록 관리 권한이 없습니다.' };
  const code = safeStr(competitionCode).toUpperCase();
  const parts = await listParticipants(env, code || 'ALL', actorArg);
  const cfg = await getConfig(env);
  const ops = await env.DB.prepare('SELECT * FROM operators ORDER BY id').all();
  const visibleConfigs = hasAdmin(actor) ? cfg.configs : filterConfigsForActor_(cfg.configs, actor);
  const visibleOps = hasAdmin(actor) ? (ops.results || []) : (ops.results || []).filter(r => operatorRowVisibleToActor_(actor, r));
  return { success: true, configs: visibleConfigs, participants: parts.participants || [], operators: visibleOps.map(operatorRowOut_), templates: getRegistrationTemplates().templates };
}
async function listParticipants(env, competitionCode, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor) && !hasTeamLead(actor)) return { success: false, message: '선수 등록 조회 권한이 없습니다.' };
  const code = safeStr(competitionCode).toUpperCase();
  if (code && code !== 'ALL' && !hasManageAccess(actor, code)) return { success: false, message: '해당 대회 선수 등록 조회 권한이 없습니다.' };
  let rs;
  if (code && code !== 'ALL') rs = await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY id').bind(code).all();
  else if (hasAdmin(actor)) rs = await env.DB.prepare('SELECT * FROM participants ORDER BY competition_code, id').all();
  else {
    const codes = actorAccessCodes_(actor).filter(c => COMPETITION_CODES.includes(c));
    if (!codes.length) return { success: true, participants: [] };
    const placeholders = codes.map(() => '?').join(',');
    rs = await env.DB.prepare(`SELECT * FROM participants WHERE competition_code IN (${placeholders}) ORDER BY competition_code, id`).bind(...codes).all();
  }
  return { success: true, participants: (rs.results || []).map(participantRowOut_) };
}
function participantRowOut_(r) {
  const ex = parseJson(r.extra_json, {});
  return {
    rowIndex: r.id,
    competitionCode: r.competition_code,
    name: r.name || '', affiliation: r.affiliation || '', phone: r.phone || '',
    uniqueNo: r.unique_no || '', prelimCupNo: r.prelim_cup_no || '', mainCupNo: r.main_cup_no || '', finalCupNo: r.final_cup_no || '',
    cupNo: r.cup_no || '', sampleNo: r.sample_no || '', teamName: r.team_name || '', teamNo: r.team_no || '', extra: ex,
    displayNo: r.team_no || r.final_cup_no || r.main_cup_no || r.prelim_cup_no || r.cup_no || r.sample_no || r.unique_no || String(r.id)
  };
}
async function upsertParticipant(env, payload, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor) && !hasTeamLead(actor)) return { success: false, message: '선수 등록 권한이 없습니다.' };
  const data = participantPayloadFromRow_(payload || {}, payload && payload.competitionCode);
  const code = safeStr(data.competitionCode).toUpperCase();
  if (!code) return { success: false, message: '대회코드가 필요합니다.' };
  if (!hasManageAccess(actor, code)) return { success: false, message: code + ' 선수 등록 권한이 없습니다.' };
  let id = Number(payload && (payload.rowIndex || payload.id));
  const bind = [code, data.name, data.affiliation, data.phone, data.uniqueNo, data.prelimCupNo, data.mainCupNo, data.finalCupNo, data.cupNo, data.sampleNo, data.teamName, data.teamNo, JSON.stringify(data.extra || {}), nowIso()];

  // 같은 엑셀을 다시 업로드해도 중복 선수가 쌓이지 않도록 대회+연락처+이름 또는 대회+번호 기준으로 갱신합니다.
  if (!id && data.phone && (data.name || data.teamName)) {
    const existing = await env.DB.prepare(`SELECT id FROM participants WHERE competition_code=? AND phone=? AND COALESCE(name,'')=? ORDER BY id LIMIT 1`)
      .bind(code, data.phone, data.name || data.teamName || '').first();
    if (existing && existing.id) id = Number(existing.id);
  }
  if (!id) {
    const keys = [
      ['unique_no', data.uniqueNo],
      ['prelim_cup_no', data.prelimCupNo],
      ['main_cup_no', data.mainCupNo],
      ['final_cup_no', data.finalCupNo],
      ['cup_no', data.cupNo],
      ['sample_no', data.sampleNo],
      ['team_no', data.teamNo]
    ];
    for (const [col, val] of keys) {
      if (!safeStr(val)) continue;
      const existing = await env.DB.prepare(`SELECT id FROM participants WHERE competition_code=? AND ${col}=? ORDER BY id LIMIT 1`)
        .bind(code, safeStr(val)).first();
      if (existing && existing.id) { id = Number(existing.id); break; }
    }
  }

  if (id) {
    await env.DB.prepare(`UPDATE participants SET competition_code=?, name=?, affiliation=?, phone=?, unique_no=?, prelim_cup_no=?, main_cup_no=?, final_cup_no=?, cup_no=?, sample_no=?, team_name=?, team_no=?, extra_json=?, updated_at=? WHERE id=?`)
      .bind(...bind, id).run();
  } else {
    await env.DB.prepare(`INSERT INTO participants (competition_code, name, affiliation, phone, unique_no, prelim_cup_no, main_cup_no, final_cup_no, cup_no, sample_no, team_name, team_no, extra_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(code, data.name, data.affiliation, data.phone, data.uniqueNo, data.prelimCupNo, data.mainCupNo, data.finalCupNo, data.cupNo, data.sampleNo, data.teamName, data.teamNo, JSON.stringify(data.extra || {}), nowIso(), nowIso()).run();
  }
  return { success: true, message: '선수 등록 저장 완료' };
}
async function deleteParticipant(env, rowIndex, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor) && !hasTeamLead(actor)) return { success: false, message: '선수 삭제 권한이 없습니다.' };
  const row = await env.DB.prepare('SELECT competition_code FROM participants WHERE id=?').bind(Number(rowIndex)).first();
  if (row && !hasManageAccess(actor, row.competition_code)) return { success: false, message: '해당 대회 선수 삭제 권한이 없습니다.' };
  await env.DB.prepare('DELETE FROM participants WHERE id=?').bind(Number(rowIndex)).run();
  return { success: true, message: '선수 삭제 완료' };
}
async function clearParticipants(env, competitionCode, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor) && !hasTeamLead(actor)) return { success: false, message: '초기화 권한이 없습니다.' };
  const checked = strictCompetitionCode_(competitionCode, '선수 등록 데이터 초기화');
  if (checked.error) return checked.error;
  const code = checked.code;
  if (!hasManageAccess(actor, code)) return { success: false, message: code + ' 초기화 권한이 없습니다.' };
  const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM participants WHERE competition_code=?').bind(code).first();
  await env.DB.prepare('DELETE FROM participants WHERE competition_code=?').bind(code).run();
  return { success: true, message: code + ' 선수 등록 데이터 초기화 완료: ' + Number(before && before.n || 0) + '건 삭제. 다른 대회 선수·점수·운영계정은 유지했습니다.' };
}
async function deleteAuxSessionsForCompetition_(env, code) {
  code = safeStr(code).toUpperCase();
  let sessionDeleted = 0;
  if (code === 'MOB') {
    const rs = await env.DB.prepare("SELECT token FROM sessions WHERE kind='MOB_CALIBRATION_CHECK' AND (payload_json LIKE ? OR token LIKE 'MOB_CAL_CHECK:%')").bind('%"competitionCode":"MOB"%').all();
    for (const row of (rs.results || [])) { await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(row.token).run(); sessionDeleted++; }
  }
  if (code === 'IKRC') {
    // IKRC 보조 세션 kind는 IKRC 전용입니다. payload에 competitionCode가 없는 구버전 데이터도 IKRC 점수 초기화 때만 함께 삭제합니다.
    const rs = await env.DB.prepare("SELECT token FROM sessions WHERE kind IN ('IKRC_CALIBRATION_CHECK','IKRC_SEED_MATCH','IKRC_SEED_RESULT')").all();
    for (const row of (rs.results || [])) { await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(row.token).run(); sessionDeleted++; }
  }
  return sessionDeleted;
}
async function clearScores(env, competitionCode, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor) && !hasTeamLead(actor)) return { success: false, message: '점수 초기화 권한이 없습니다.' };
  const checked = strictCompetitionCode_(competitionCode, '점수 데이터 초기화');
  if (checked.error) return checked.error;
  const code = checked.code;
  if (!hasManageAccess(actor, code)) return { success: false, message: code + ' 점수 초기화 권한이 없습니다.' };
  const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE competition_code=?').bind(code).first();
  await env.DB.prepare('DELETE FROM scores WHERE competition_code=?').bind(code).run();
  const sessionDeleted = await deleteAuxSessionsForCompetition_(env, code);
  return { success: true, message: code + ' 점수/검수/순위 데이터 초기화 완료: 점수 ' + Number(before && before.n || 0) + '건 삭제' + (sessionDeleted ? ', 해당 대회 보조 데이터 ' + sessionDeleted + '건 삭제' : '') + '. 선수·운영계정과 다른 대회 데이터는 유지했습니다.' };
}
async function importParticipants(env, payload, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor) && !hasTeamLead(actor)) return { success: false, message: '선수 일괄 등록 권한이 없습니다.' };
  const defaultCode = safeStr(payload && payload.competitionCode).toUpperCase();
  const rows = normalizeParticipantImportRows_(rowsFromPayload_(payload), defaultCode);
  if (!rows.length) return { success: false, message: '업로드할 행이 없습니다.' };
  let ok = 0, skipped = 0, errors = [];
  for (let i=0;i<rows.length;i++) {
    const data = participantPayloadFromRow_(rows[i], defaultCode);
    if (!data.competitionCode) { skipped++; errors.push((i+2) + '행: 대회코드 없음'); continue; }
    if (!hasManageAccess(actor, data.competitionCode)) { skipped++; errors.push((i+2) + '행: ' + data.competitionCode + ' 등록 권한 없음'); continue; }
    if (!data.name && !data.teamName) { skipped++; errors.push((i+2) + '행: 이름/팀명 없음'); continue; }
    try { await upsertParticipant(env, data, actor); ok++; }
    catch(e) { skipped++; errors.push((i+2) + '행: ' + String(e && e.message || e)); }
  }
  return { success: true, message: `선수 ${ok}건 등록, ${skipped}건 제외`, imported: ok, skipped, errors: errors.slice(0,20) };
}
async function importOperators(env, payload, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success: false, message: '심사위원 일괄 등록 권한이 없습니다.' };
  const defaultCode = safeStr(payload && payload.competitionCode).toUpperCase();
  const rows = normalizeParticipantImportRows_(rowsFromPayload_(payload), defaultCode);
  if (!rows.length) return { success: false, message: '업로드할 행이 없습니다.' };
  let ok = 0, skipped = 0, errors = [];
  for (let i=0;i<rows.length;i++) {
    const data = operatorPayloadFromRow_(rows[i], defaultCode);
    if (!data.name || !data.phone) { skipped++; errors.push((i+2) + '행: 이름/연락처 없음'); continue; }
    try { await upsertOperatorAccount(env, data, actor); ok++; }
    catch(e) { skipped++; errors.push((i+2) + '행: ' + String(e && e.message || e)); }
  }
  return { success: true, message: `심사위원/운영자 ${ok}건 등록, ${skipped}건 제외`, imported: ok, skipped, errors: errors.slice(0,20) };
}
function getRegistrationTemplates() {
  // 웹 화면의 CSV 예시는 대회별 정리 양식을 기준으로 제공합니다.
  // 구버전 공통 양식도 alias로 계속 읽을 수 있습니다.
  const participantCsv = [
    '[KBC] 대회코드,참가자번호,선수명,소속,연락처,예선번호,본선번호,결선번호,비고',
    'KBC,1,KBC 선수1,카페A,01011112222,,,,현장 평가',
    '',
    '[KCR] 대회코드,예선출품번호,결선출품번호,선수명,소속,연락처,비고',
    'KCR,KCR-P001,KCR-F001,KCR 선수1,로스터리A,01044445555,블라인드 출품번호',
    '',
    '[KTCC] 대회코드,팀번호,팀명,팀원1명,팀원1소속,팀원1연락처,팀원2명,팀원2소속,팀원2연락처,예선팀번호,결선팀번호,비고',
    'KTCC,1,팀커핑A,KTCC 선수1,A카페,01077778888,KTCC 선수2,B카페,01077779999,1,F1,팀 단위 등록'
  ].join('\n');
  const operatorCsv = [
    '대회코드,계정유형,심사위원명,소속,연락처,역할,평가팀',
    'ALL,ADMIN,총괄관리자,KCL,01012345678,관리자,',
    'KCR,JUDGE,홍심사,로스터리,01011112222,센서리 심사위원,A',
    'MOB,JUDGE,김헤드,더컵,01022223333,센서리 헤드 심사위원,Head A',
    'KTCC,STAFF,운영진,KCL,01033334444,운영진,1번 테이블'
  ].join('\n');
  return { success: true, templates: { participants: participantCsv, operators: operatorCsv } };
}


function participantRoundNumber_(r, code, round) {
  const normalized = normalizeRoundForCompetition_(code, round || '예선');
  if (normalized === '예선') return r.prelim_cup_no || r.cup_no || r.sample_no || r.team_no || r.unique_no || String(r.id);
  if (normalized === '본선') return r.main_cup_no || r.prelim_cup_no || r.cup_no || r.sample_no || r.team_no || r.unique_no || String(r.id);
  return r.final_cup_no || r.main_cup_no || r.prelim_cup_no || r.cup_no || r.sample_no || r.team_no || r.unique_no || String(r.id);
}
function participantKey_(v) {
  return safeStr(v).trim().replace(/\s+/g, '').toUpperCase();
}
function participantIdentityFromRow_(r, code) {
  code = safeStr(code).toUpperCase();
  const extra = parseJson(r.extra_json, {});
  const teamName = firstNonEmpty([r.team_name, extra['팀명'], extra.teamName]);
  const name = code === 'KTCC'
    ? firstNonEmpty([teamName, r.name, extra['팀명'], extra['팀원1명']])
    : firstNonEmpty([r.name, extra['선수명'], extra['참가자명'], extra.name]);
  const affiliation = code === 'KTCC'
    ? firstNonEmpty([extra['팀원1소속'], extra['팀원2소속'], r.affiliation])
    : firstNonEmpty([r.affiliation, extra['소속'], extra.affiliation]);
  return {
    id: r.id,
    name,
    affiliation,
    teamName,
    teamNo: r.team_no || extra['팀번호'] || '',
    phone: r.phone || '',
    raw: r
  };
}
function indexParticipantIdentities_(participantRows, code) {
  code = safeStr(code).toUpperCase();
  const idx = new Map();
  const rounds = COMPETITION_ROUNDS[code] || ['예선','결선'];
  function put(round, number, identity) {
    const key = participantKey_(number);
    if (!key) return;
    if (round) idx.set(round + '::' + key, identity);
    if (!idx.has('ANY::' + key)) idx.set('ANY::' + key, identity);
  }
  (participantRows || []).forEach(r => {
    const identity = participantIdentityFromRow_(r, code);
    rounds.forEach(round => put(round, participantRoundNumber_(r, code, round), identity));
    [r.unique_no, r.cup_no, r.sample_no, r.team_no, r.prelim_cup_no, r.main_cup_no, r.final_cup_no, r.name, r.team_name].forEach(v => put('', v, identity));
    const extra = parseJson(r.extra_json, {});
    Object.keys(extra || {}).forEach(k => {
      if (/번호|No|no|팀명|선수명|참가자명/i.test(k)) put('', extra[k], identity);
    });
  });
  return idx;
}
function lookupParticipantIdentity_(idx, round, unit) {
  const key = participantKey_(unit);
  if (!idx || !key) return null;
  const r = normalizeRoundForCompetition_('', round || '예선');
  return idx.get(r + '::' + key) || idx.get(String(round || '').trim() + '::' + key) || idx.get('ANY::' + key) || null;
}
function enrichReviewItemWithParticipant_(item, identity, code) {
  if (!item || !identity) return item;
  const name = identity.name || '';
  const affiliation = identity.affiliation || '';
  const teamName = identity.teamName || '';
  if (name) {
    if (!item.participantName) item.participantName = name;
    if (!item['선수명']) item['선수명'] = name;
    if (!item['참가자명']) item['참가자명'] = name;
    if (safeStr(code).toUpperCase() === 'KTCC' && !item['팀명']) item['팀명'] = name;
  }
  if (affiliation) {
    item.participantAffiliation = affiliation;
    if (!item['소속']) item['소속'] = affiliation;
  }
  if (teamName) {
    item.participantTeamName = teamName;
    if (!item['팀명']) item['팀명'] = teamName;
  }
  if (identity.teamNo && !item['팀번호']) item['팀번호'] = identity.teamNo;
  return item;
}
async function getParticipantAssignments(env, competitionCode, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const actor = await getActor(env, actorArg);
  if (!hasAccess(actor, code)) return { success: false, message: '이 대회 참가자 목록 조회 권한이 없습니다.' };
  const cfg = await env.DB.prepare('SELECT current_round FROM competitions WHERE code=?').bind(code).first();
  const currentRound = normalizeRoundForCompetition_(code, cfg && cfg.current_round || '예선');
  const rows = await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY id').bind(code).all();
  const policy = participantRoundPolicy_(code, currentRound);
  const canSeeIdentity = actorCanSeeParticipantIdentity_(actor);
  const hideIdentity = !!(policy.identityHidden && !canSeeIdentity);
  const assignments = (rows.results || []).map(r => {
    const number = participantRoundNumber_(r, code, currentRound);
    const rawName = code === 'KTCC' ? (r.team_name || r.name || '') : (r.name || '');
    const displayName = hideIdentity ? '' : rawName;
    const displayAff = hideIdentity ? '' : (r.affiliation || '');
    const prefix = policy.numberLabel || (code === 'KTCC' ? '팀번호' : '참가자번호');
    return {
      rowIndex: r.id,
      competitionCode: code,
      currentRound,
      number,
      numberLabel: prefix,
      displayMode: policy.mode,
      identityHidden: hideIdentity,
      directInput: !!policy.directInput,
      name: displayName,
      affiliation: displayAff,
      teamName: hideIdentity ? '' : (r.team_name || ''),
      teamNo: r.team_no || '',
      uniqueNo: r.unique_no || '',
      prelimCupNo: r.prelim_cup_no || '',
      mainCupNo: r.main_cup_no || '',
      finalCupNo: r.final_cup_no || '',
      roundCupNo: number || '',
      sampleNo: r.sample_no || '',
      display: (number ? (prefix + ' ' + number) : (prefix + ' 미지정')) + (displayName ? ' · ' + displayName : '') + (displayAff ? ' · ' + displayAff : '') + (hideIdentity ? ' · 블라인드' : '')
    };
  });
  return { success: true, competitionCode: code, currentRound, policy, assignments };
}


function expectedHeadersForCompetition(code) {
  const meta = ['제출시간','대회코드','라운드','심사위원명','팀','역할','모드'];
  code = safeStr(code).toUpperCase();
  let data = [];
  if (code === 'KCR') data = ['컵번호','프로세스','Flavor(플레이버)','Flavor 강도','Aftertaste(애프터테이스트)','Aftertaste 지속성','Acidity(산미)','Acidity 강도','Body(바디)','Body 강도','Sweetness(스윗니스) ×2','Sweetness 강도','Overall(주관적 종합평가)','종합코멘트','총점','실격여부','실격사유','검수상태','Flavor 스마트태그','Aftertaste 스마트태그','Acidity 스마트태그','Body 스마트태그','Sweetness 스마트태그'];
  else if (code === 'KCAC') data = ['참가자번호','선수명','우유종류','잔용도','우유명','예선 Pattern Completion(패턴 완성도)','예선 Pattern Symmetry & Balance(대칭과 균형)','예선 Surface Quality(표면 품질)','예선 Position & Proportion(위치와 비율)','예선 Pattern Definition(패턴 선명도)','결선 Theme Expression(주제 표현력)','결선 Technical Execution(작업 수행 완성도)','결선 Cleanliness(청결)','결선 Taste Balance(맛의 균형)','결선 Mouthfeel(질감)','결선 Presentation(프레젠테이션)','결선 Surface Quality(표면 품질)','결선 Position & Symmetry(위치와 대칭)','결선 Design Completion(디자인 완성도)','소계','감점','최종점수','가이드URL','종합코멘트','실격여부','실격사유','검수상태','패턴종류','리프수','리프수감점','시간감점','예선 Pattern Completion 스마트태그','예선 Pattern Symmetry & Balance 스마트태그','예선 Surface Quality 스마트태그','예선 Position & Proportion 스마트태그','예선 Pattern Definition 스마트태그','결선 Theme Expression 스마트태그','결선 Technical Execution 스마트태그','결선 Cleanliness 스마트태그','결선 Taste Balance 스마트태그','결선 Mouthfeel 스마트태그','결선 Presentation 스마트태그','결선 Surface Quality 스마트태그','결선 Position & Symmetry 스마트태그','결선 Design Completion 스마트태그'];
  else if (code === 'KBC') data = ['참가자번호','Service Professionalism(서비스의 전문성)','Espresso Taste & Design(맛과 설계) ×2','Espresso Clean Cup(클린컵)','Espresso Mouthfeel(마우스필)','Espresso Flavor(플레이버)','Espresso Total','Signature Taste & Design(맛과 설계) ×2','Signature Clean Cup(클린컵)','Signature Mouthfeel(마우스필)','Signature Flavor(플레이버)','Signature Total','Machine & Equipment Professionalism(머신 및 기물 운용 전문성)','시간감점','총점','종합코멘트','실격여부','실격사유','검수상태','선수명','경기시간','Service Professionalism 코멘트','Espresso Taste & Design 코멘트','Espresso Clean Cup 코멘트','Espresso Mouthfeel 코멘트','Espresso Flavor 코멘트','Signature Taste & Design 코멘트','Signature Clean Cup 코멘트','Signature Mouthfeel 코멘트','Signature Flavor 코멘트','Machine & Equipment Professionalism 코멘트','Service Professionalism 스마트태그','Espresso Taste & Design 스마트태그','Espresso Clean Cup 스마트태그','Espresso Mouthfeel 스마트태그','Espresso Flavor 스마트태그','Signature Taste & Design 스마트태그','Signature Clean Cup 스마트태그','Signature Mouthfeel 스마트태그','Signature Flavor 스마트태그','Machine & Equipment Professionalism 스마트태그'];
  else if (code === 'MOB') data = ['참가자번호','메뉴','Pre-Service Station(시연 전 작업대)','Service Station(시연 중 작업대)','Post-Service Station(시연 후 작업대)','Sweetness(스윗니스)','Flavor(플레이버)','Balance(균형)','Clean Cup(클린컵)','Mouthfeel(질감)','Professionalism(시연 전문성)','Creative Form & Usability(형태와 용이성)','Creative Flavor(창작 향미)','Creative Balance(균형)','Creative Mouthfeel(질감)','Creative Professionalism(전문성과 독창성)','총점','종합코멘트','실격여부','실격사유','검수상태','Pre-Service Station 코멘트','Service Station 코멘트','Post-Service Station 코멘트','Sweetness 코멘트','Flavor 코멘트','Balance 코멘트','Clean Cup 코멘트','Mouthfeel 코멘트','Professionalism 코멘트','Creative Form & Usability 코멘트','Creative Flavor 코멘트','Creative Balance 코멘트','Creative Mouthfeel 코멘트','Creative Professionalism 코멘트','시간감점','경기시간','선수명','Pre-Service Station 스마트태그','Service Station 스마트태그','Post-Service Station 스마트태그','Sweetness 스마트태그','Flavor 스마트태그','Balance 스마트태그','Clean Cup 스마트태그','Mouthfeel 스마트태그','Professionalism 스마트태그','Creative Form & Usability 스마트태그','Creative Flavor 스마트태그','Creative Balance 스마트태그','Creative Mouthfeel 스마트태그','Creative Professionalism 스마트태그','Signature Technical Pre-Service Station(창작음료 시연 전 작업대)','Signature Technical Service Station(창작음료 시연 중 작업대)','Signature Technical Ingredient Use(부재료 사용의 적절함)','Signature Technical Post-Service Station(창작음료 시연 후 작업대)','Signature Technical Pre-Service Station 코멘트','Signature Technical Service Station 코멘트','Signature Technical Ingredient Use 코멘트','Signature Technical Post-Service Station 코멘트','Signature Technical Pre-Service Station 스마트태그','Signature Technical Service Station 스마트태그','Signature Technical Ingredient Use 스마트태그','Signature Technical Post-Service Station 스마트태그','테크니컬 총점','센서리 총점','창작메뉴 총점','감점 전 합산','총평가 반영점수'];
  else if (code === 'IKRC') data = ['샘플번호','Flavor(플레이버) ×3','Flavor 강도','Clean Cup(클린컵) ×2','Clean Cup 강도','Sweetness(스윗니스) ×2','Sweetness 강도','Acidity(산미)','Acidity 강도','Mouthfeel(마우스필) ×2','Mouthfeel 강도','종합코멘트','총점','실격여부','검수상태','참가자 번호','선수명','Seed to Cup 가산점','Seed to Cup 메모','최종점수','Flavor 스마트태그','Clean Cup 스마트태그','Sweetness 스마트태그','Acidity 스마트태그','Mouthfeel 스마트태그','실격사유'];
  else if (code === 'MOC') data = ['참가자번호','평가구분','정답수','가산점','총점','종료시간','서명','실격여부','실격사유','검수상태','Section1 지정국가','Section2 지정국가','Section1 농장','Section1 발효방식','Section2 농장','Section2 발효방식','선수명'];
  else if (code === 'KTCC') data = ['팀번호','팀명','Section1 주제','Section1 선택컵','Section1 정답수','Section2 주제','Section2 선택컵','Section2 정답수','Section3 주제','Section3 선택컵','Section3 정답수','Section3 가산점','총점','종료시간','서명','실격여부','실격사유','검수상태'];
  return meta.concat(data);
}
function firstNonEmpty(list) { for (const v of list || []) { const s = safeStr(v); if (s) return s; } return ''; }
function toNumber(v) { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; }
function numberFromKeys(obj, keys) { if (!obj || typeof obj !== 'object') return null; for (const k of keys || []) { if (Object.prototype.hasOwnProperty.call(obj, k)) { const n = toNumber(obj[k]); if (n !== null) return n; } } return null; }

function numberListFromValue_(v) {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) return v.flatMap(numberListFromValue_);
  const raw = String(v);
  const parts = raw.indexOf('\n') >= 0 ? raw.split(/\n+/) : [raw];
  const nums = [];
  parts.forEach(part => {
    const n = toNumber(part);
    if (n !== null) nums.push(n);
  });
  return nums;
}
function numbersFromKeys_(obj, keys) {
  const nums = [];
  if (!obj || typeof obj !== 'object') return nums;
  for (const k of keys || []) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) nums.push(...numberListFromValue_(obj[k]));
  }
  return nums;
}
function sumFromKeys_(obj, keys) {
  const nums = numbersFromKeys_(obj, keys);
  return nums.length ? Math.round(nums.reduce((a,b)=>a+b,0) * 1000) / 1000 : null;
}
function firstNumberFromKeys_(obj, keys) {
  const nums = numbersFromKeys_(obj, keys);
  return nums.length ? nums[0] : null;
}
function maxFromKeys_(obj, keys) {
  const nums = numbersFromKeys_(obj, keys);
  return nums.length ? Math.max(...nums) : null;
}
function roundScoreValue_(v, decimals=3) {
  const n = toNumber(v);
  if (n === null) return null;
  const m = Math.pow(10, decimals);
  return Math.round(n * m) / m;
}
function positivePenaltyValue_(v) {
  const n = toNumber(v);
  if (n === null || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.abs(n));
}
function isDisqualifiedValue_(v) {
  const s = safeStr(v).replace(/\s/g, '');
  return v === true || /^(Y|YES|TRUE|1|실격)$/i.test(s);
}

function isExplicitNonDisqualifiedValue_(v) {
  const s = safeStr(v).replace(/\s/g, '');
  return v === false || /^(N|NO|FALSE|0|정상|해제|비실격|없음|공란|-|)$/i.test(s);
}
function parseExplicitDisqualificationValue_(v) {
  if (isDisqualifiedValue_(v)) return true;
  if (isExplicitNonDisqualifiedValue_(v)) return false;
  return null;
}
function isDisqualificationHeader_(h) {
  const s = safeStr(h).replace(/\s/g, '').toLowerCase();
  return s === '실격여부' || s === 'dq' || s === 'disqualified' || s === '실격';
}
function normalizedReviewStatus_(v) {
  return safeStr(v).replace(/\s/g, '');
}
function rankingExcludedByReviewStatus_(v) {
  const s = normalizedReviewStatus_(v);
  if (!s) return false;
  return s === '미검수' || isCalibrationMode_(s);
}
function reviewCompletedStatus_(v) {
  const s = normalizedReviewStatus_(v);
  return s === '검수완료' || s === '수정완료';
}

function valueFromKeysAny_(obj, keys) {
  const n = firstNumberFromKeys_(obj, keys);
  return n === null ? null : n;
}
function valueOrZero_(obj, keys) {
  const n = valueFromKeysAny_(obj, keys);
  return n === null ? 0 : n;
}
function weightedSubtotalFromSpec_(obj, spec) {
  let total = 0, found = false;
  (spec || []).forEach(it => {
    const n = valueFromKeysAny_(obj, it.keys || []);
    if (n !== null) { total += n * (it.weight || 1); found = true; }
  });
  return found ? roundScoreValue_(total) : null;
}
const KBC_ESPRESSO_TOTAL_SPEC_ = [
  { keys:['Espresso Taste & Design(맛과 설계) ×2','Espresso Taste & Design(맛과 설계)','Espresso Taste & Design'], weight:2 },
  { keys:['Espresso Clean Cup(클린컵)','Espresso Clean Cup'], weight:1 },
  { keys:['Espresso Mouthfeel(마우스필)','Espresso Mouthfeel'], weight:1 },
  { keys:['Espresso Flavor(플레이버)','Espresso Flavor'], weight:1 }
];
const KBC_SIGNATURE_TOTAL_SPEC_ = [
  { keys:['Signature Taste & Design(맛과 설계) ×2','Signature Taste & Design(맛과 설계)','Signature Taste & Design'], weight:2 },
  { keys:['Signature Clean Cup(클린컵)','Signature Clean Cup'], weight:1 },
  { keys:['Signature Mouthfeel(마우스필)','Signature Mouthfeel'], weight:1 },
  { keys:['Signature Flavor(플레이버)','Signature Flavor'], weight:1 }
];
function kbcEspressoTotalFromItem_(item) {
  const direct = valueFromKeysAny_(item, ['Espresso Total','에스프레소 합산','에스프레소 총점']);
  if (direct !== null) return roundScoreValue_(direct);
  return weightedSubtotalFromSpec_(item, KBC_ESPRESSO_TOTAL_SPEC_) || 0;
}
function kbcSignatureTotalFromItem_(item) {
  const direct = valueFromKeysAny_(item, ['Signature Total','창작메뉴 합산','창작메뉴 총점']);
  if (direct !== null) return roundScoreValue_(direct);
  return weightedSubtotalFromSpec_(item, KBC_SIGNATURE_TOTAL_SPEC_) || 0;
}
function mobPenaltyValue_(v) {
  return positivePenaltyValue_(v);
}
function mobPenaltyFromExtra_(extra) {
  return mobPenaltyValue_(valueFromKeysAny_(extra, ['시간감점','Time Penalty']));
}
function mobOfficialTotalFromExtra_(extra) {
  const direct = valueFromKeysAny_(extra, ['총평가 반영점수','총평가반영점수','Official Total']);
  const dqText = safeStr(extra && (extra['실격여부'] || extra['DQ'] || extra.disqualified));
  const isDq = dqText === true || /^(Y|YES|TRUE|1|실격)$/i.test(dqText);
  if (isDq) return 0;
  const rawTech = sumFromKeys_(extra, ['Pre-Service Station(시연 전 작업대)','Service Station(시연 중 작업대)','Post-Service Station(시연 후 작업대)','Signature Technical Pre-Service Station(창작음료 시연 전 작업대)','Signature Technical Service Station(창작음료 시연 중 작업대)','Signature Technical Ingredient Use(부재료 사용의 적절함)','Signature Technical Post-Service Station(창작음료 시연 후 작업대)']);
  const rawSensory = sumFromKeys_(extra, ['Sweetness(스윗니스)','Flavor(플레이버)','Balance(균형)','Clean Cup(클린컵)','Mouthfeel(질감)','Professionalism(시연 전문성)']);
  const rawCreative = sumFromKeys_(extra, ['Creative Form & Usability(형태와 용이성)','Creative Flavor(창작 향미)','Creative Balance(균형)','Creative Mouthfeel(질감)','Creative Professionalism(전문성과 독창성)']);
  const tech = rawTech !== null ? rawTech : valueOrZero_(extra, ['테크니컬 총점','Technical Total']);
  const sensory = rawSensory !== null ? rawSensory : valueOrZero_(extra, ['센서리 총점','Sensory Total']);
  const creative = rawCreative !== null ? rawCreative : valueOrZero_(extra, ['창작메뉴 총점','Creative Total']);
  const penalty = mobPenaltyFromExtra_(extra);
  const hasRaw = rawTech !== null || rawSensory !== null || rawCreative !== null || valueFromKeysAny_(extra, ['테크니컬 총점','센서리 총점','창작메뉴 총점','시간감점']) !== null;
  if (hasRaw) return roundScoreValue_(Math.max(0, tech + sensory + creative - penalty));
  return direct === null ? null : roundScoreValue_(direct);
}
const KCAC_QUAL_TOTAL_SPEC_ = [
  { keys:['예선 Pattern Completion(패턴 완성도)','Pattern Completion(패턴 완성도)'], weight:4 },
  { keys:['예선 Pattern Symmetry & Balance(대칭과 균형)','Pattern Symmetry & Balance(대칭과 균형)','예선 Pattern Balance(패턴 균형)','Pattern Balance(패턴 균형)'], weight:2 },
  { keys:['예선 Surface Quality(표면 품질)','Surface Quality(표면 품질)'], weight:1 },
  { keys:['예선 Position & Proportion(위치와 비율)','Position & Proportion(위치와 비율)'], weight:1 },
  { keys:['예선 Pattern Definition(패턴 선명도)','Pattern Definition(패턴 선명도)'], weight:2 }
];
const KCAC_FINAL_PATTERN_SPEC_ = [
  { keys:['결선 Theme Expression(주제 표현력)','Theme Expression(주제 표현력)'], weight:2 },
  { keys:['결선 Design Completion(디자인 완성도)','Design Completion(디자인 완성도)'], weight:4 },
  { keys:['결선 Surface Quality(표면 품질)','Surface Quality(표면 품질)'], weight:1 },
  { keys:['결선 Position & Symmetry(위치와 대칭)','Position & Symmetry(위치와 대칭)'], weight:1 },
  { keys:['결선 Technical Execution(작업 수행 완성도)','Technical Execution(작업 수행 완성도)'], weight:2 },
  { keys:['결선 Cleanliness(청결)','Cleanliness(청결)'], weight:2 }
];
const KCAC_FINAL_SENSORY_SPEC_ = [
  { keys:['결선 Taste Balance(맛의 균형)','Taste Balance(맛의 균형)'], weight:2 },
  { keys:['결선 Mouthfeel(질감)','Mouthfeel(질감)','Mouthfeel(질감과 촉감)'], weight:1 },
  { keys:['결선 Presentation(프레젠테이션)','Presentation(프레젠테이션)'], weight:1 }
];
function kcacSubtotalFromRaw_(extra) {
  const purpose = safeStr(extra && (extra['잔용도'] || extra['컵용도'] || extra['평가용도'] || extra['우유종류'] || extra['우유명'] || extra.purpose || ''));
  const hasFinalPattern = itemHasAnyScore_(extra, ['결선 Theme Expression(주제 표현력)','결선 Design Completion(디자인 완성도)','결선 Technical Execution(작업 수행 완성도)','결선 Cleanliness(청결)']);
  const hasFinalSensory = itemHasAnyScore_(extra, ['결선 Taste Balance(맛의 균형)','결선 Mouthfeel(질감)','결선 Presentation(프레젠테이션)']);
  if (hasFinalPattern || /창작패턴|패턴평가|pattern/i.test(purpose)) return weightedSubtotalFromSpec_(extra, KCAC_FINAL_PATTERN_SPEC_);
  if (hasFinalSensory || /센서리|sensory/i.test(purpose)) return weightedSubtotalFromSpec_(extra, KCAC_FINAL_SENSORY_SPEC_);
  return weightedSubtotalFromSpec_(extra, KCAC_QUAL_TOTAL_SPEC_);
}
function singleRowExtra_(payload, code, rowIndex=0) {
  const rows = Array.isArray(payload && payload.rows) ? payload.rows : [];
  const row = rows[rowIndex] || rows[0] || {};
  return extractExtra(Object.assign({}, payload || {}, { rows: [row] }), code, 0);
}
function canonicalScoreForPayload_(code, payload, rowIndex=0) {
  code = safeStr(code || (payload && (payload.competitionCode || payload.code || payload.compCode || payload.competition))).toUpperCase();
  payload = payload || {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const extra = singleRowExtra_(payload, code, rowIndex);
  const payloadDq = isDisqualifiedValue_(payload.disqualified) || isDisqualifiedValue_(payload.dq) || isDisqualifiedValue_(payload.disqualifiedYn) || isDisqualifiedValue_(extra['실격여부']) || isDisqualifiedValue_(extra['DQ']) || isDisqualifiedValue_(extra.disqualified);
  if (payloadDq) return 0;
  const fallback = () => {
    const direct = toNumber(payload.totalScore ?? payload.total ?? payload.finalScore ?? payload.subtotalScore ?? payload.subtotal);
    if (direct !== null) return roundScoreValue_(direct);
    const n = firstNumberFromKeys_(extra, ['최종점수','총점','Total Score','Total','totalScore','finalScore','subtotalScore','subtotal']);
    return n === null ? null : roundScoreValue_(n);
  };

  if (code === 'KCR') {
    const flavor = firstNumberFromKeys_(extra, ['Flavor(플레이버)','Flavor']);
    const after = firstNumberFromKeys_(extra, ['Aftertaste(애프터테이스트)','Aftertaste']);
    const acidity = firstNumberFromKeys_(extra, ['Acidity(산미)','Acidity']);
    const body = firstNumberFromKeys_(extra, ['Body(바디)','Body']);
    const sweet = firstNumberFromKeys_(extra, ['Sweetness(스윗니스) ×2','Sweetness(단맛) ×2','Sweetness(스윗니스)','Sweetness']);
    const overall = firstNumberFromKeys_(extra, ['Overall(주관적 종합평가)','Overall']);
    if ([flavor, after, acidity, body, sweet, overall].every(v => v !== null)) return roundScoreValue_(flavor + after + acidity + body + (sweet * 2) + overall);
    return fallback();
  }
  if (code === 'IKRC') {
    const final = firstNumberFromKeys_(extra, ['최종점수','Final Score']);
    if (final !== null) return roundScoreValue_(final);
    const flavor = firstNumberFromKeys_(extra, ['Flavor(플레이버) ×3','Flavor(플레이버)','Flavor']);
    const clean = firstNumberFromKeys_(extra, ['Clean Cup(클린컵) ×2','Clean Cup(클린컵)','Clean Cup']);
    const sweet = firstNumberFromKeys_(extra, ['Sweetness(스윗니스) ×2','Sweetness(스윗니스)','Sweetness']);
    const acidity = firstNumberFromKeys_(extra, ['Acidity(산미)','Acidity']);
    const mouth = firstNumberFromKeys_(extra, ['Mouthfeel(마우스필) ×2','Mouthfeel(마우스필)','Mouthfeel']);
    if ([flavor, clean, sweet, acidity, mouth].every(v => v !== null)) {
      const seed = firstNumberFromKeys_(extra, ['Seed to Cup 가산점','SeedToCup Bonus','시드투컵 가산점']) || 0;
      return roundScoreValue_((flavor * 3) + (clean * 2) + (sweet * 2) + acidity + (mouth * 2) + seed);
    }
    return fallback();
  }
  if (code === 'KBC') {
    const p = firstNumberFromKeys_(extra, ['Service Professionalism(서비스의 전문성)','Presentation & Service(프레젠테이션과 서비스 전문성)','Presentation & Service','프레젠테이션과 서비스 전문성']) || 0;
    const et = firstNumberFromKeys_(extra, ['Espresso Taste & Design(맛과 설계) ×2']) || 0;
    const ec = firstNumberFromKeys_(extra, ['Espresso Clean Cup(클린컵)']) || 0;
    const em = firstNumberFromKeys_(extra, ['Espresso Mouthfeel(마우스필)']) || 0;
    const ef = firstNumberFromKeys_(extra, ['Espresso Flavor(플레이버)']) || 0;
    const st = firstNumberFromKeys_(extra, ['Signature Taste & Design(맛과 설계) ×2']) || 0;
    const sc = firstNumberFromKeys_(extra, ['Signature Clean Cup(클린컵)']) || 0;
    const sm = firstNumberFromKeys_(extra, ['Signature Mouthfeel(마우스필)']) || 0;
    const sf = firstNumberFromKeys_(extra, ['Signature Flavor(플레이버)']) || 0;
    const machine = firstNumberFromKeys_(extra, ['Machine & Equipment Professionalism(머신 및 기물 운용 전문성)']) || 0;
    const hasKbc = [p, et, ec, em, ef, st, sc, sm, sf, machine].some(v => v > 0) || firstNumberFromKeys_(extra, ['시간감점']) !== null;
    if (hasKbc) {
      const penalty = positivePenaltyValue_(firstNumberFromKeys_(extra, ['시간감점','Time Penalty']));
      return roundScoreValue_(Math.max(0, p + (et * 2) + ec + em + ef + (st * 2) + sc + sm + sf + machine - penalty));
    }
    return fallback();
  }
  if (code === 'MOB') {
    const mob = mobOfficialTotalFromExtra_(extra);
    return mob === null ? fallback() : mob;
  }
  if (code === 'KCAC') {
    const payloadRows = rows.length ? rows : [{}];
    let total = 0, found = false;
    payloadRows.forEach((row, idx) => {
      const e = singleRowExtra_(Object.assign({}, payload, { rows: [row] }), code, 0);
      const fin = kcacRowTotalFromExtra_(e);
      if (fin !== null && fin !== undefined) { total += fin; found = true; }
    });
    return found ? roundScoreValue_(total) : fallback();
  }
  if (code === 'MOC') {
    const correct = firstNumberFromKeys_(extra, ['정답수','Correct Count']);
    const bonus = firstNumberFromKeys_(extra, ['가산점','Bonus']) || 0;
    if (correct !== null) return roundScoreValue_(correct + bonus);
    return fallback();
  }
  if (code === 'KTCC') {
    const s1 = firstNumberFromKeys_(extra, ['Section1 정답수']) || 0;
    const s2 = firstNumberFromKeys_(extra, ['Section2 정답수']) || 0;
    const s3 = firstNumberFromKeys_(extra, ['Section3 정답수']) || 0;
    const bonus = firstNumberFromKeys_(extra, ['Section3 가산점']) || 0;
    const hasKtcc = [s1,s2,s3,bonus].some(v => v > 0) || firstNumberFromKeys_(extra, ['총점']) !== null;
    if (hasKtcc) return roundScoreValue_(s1 + s2 + s3 + bonus);
    return fallback();
  }
  return fallback();
}
function dataHeadersForCompetition_(code) { return expectedHeadersForCompetition(code).slice(7); }
function mergePublicValue_(oldVal, newVal) {
  const oldS = safeStr(oldVal), newS = safeStr(newVal);
  if (!newS) return oldVal;
  if (!oldS) return newVal;
  if (oldS === newS) return oldVal;
  return oldS + '\n' + newS;
}
function mapRowDataToHeaders_(payload, code, row) {
  const out = {};
  const data = Array.isArray(row && row.data) ? row.data : [];
  const headers = dataHeadersForCompetition_(code || (payload && (payload.competitionCode || payload.code || payload.compCode)) || '');
  data.forEach((v, i) => {
    const h = headers[i];
    if (!h || v === undefined || v === null || safeStr(v) === '') return;
    out[h] = v;
  });
  return out;
}
function extractExtra(payload, code='', rowIndex=0) {
  payload = payload || {};
  code = safeStr(code || payload.competitionCode || payload.code || payload.compCode || payload.competition).toUpperCase();
  const payloadRows = Array.isArray(payload.rows) ? payload.rows : [];
  const rowsToUse = (code === 'KCAC' && payloadRows.length > 1 && rowIndex === 0)
    ? payloadRows
    : [payloadRows[rowIndex] || payloadRows[0] || {}];
  const out = {};
  const putMerged = (k, v) => { if (safeStr(v) !== '') out[k] = mergePublicValue_(out[k], v); };
  const putOverride = (k, v) => { if (safeStr(v) !== '') out[k] = v; };
  rowsToUse.forEach(row => {
    const mapped = mapRowDataToHeaders_(payload, code, row);
    Object.keys(mapped).forEach(k => { putMerged(k, mapped[k]); });
    const rowExtra = row && row.extraFields && typeof row.extraFields === 'object' ? row.extraFields : {};
    // 검수/수정 화면에서 저장된 extraFields는 원본 data보다 최신값이다.
    // 같은 헤더를 원본값과 합쳐서 `기존\n수정` 형태로 만들면 총점 재계산이 기존값을 읽는 치명적 문제가 생기므로 최신값으로 덮어쓴다.
    Object.keys(rowExtra).forEach(k => { Object.prototype.hasOwnProperty.call(mapped, k) ? putOverride(k, rowExtra[k]) : putMerged(k, rowExtra[k]); });
  });
  const globalExtra = payload.extraFields && typeof payload.extraFields === 'object' ? payload.extraFields : {};
  // 전역 extraFields 역시 검수 수정값일 수 있으므로 기존값보다 우선한다.
  Object.keys(globalExtra).forEach(k => { putOverride(k, globalExtra[k]); });
  return out;
}

function parseReviewRowRef_(rowIndex) {
  const s = safeStr(rowIndex);
  const m = s.match(/^(\d+)(?::|#|\.)(\d+)$/);
  if (m) return { id: Number(m[1]), payloadRowIndex: Number(m[2]) || 0, isVirtual: true };
  return { id: Number(rowIndex), payloadRowIndex: 0, isVirtual: false };
}

function extractExtraSingleRow_(payload, code='', rowIndex=0) {
  payload = payload || {};
  code = safeStr(code || payload.competitionCode || payload.code || payload.compCode || payload.competition).toUpperCase();
  const payloadRows = Array.isArray(payload.rows) ? payload.rows : [];
  const row = payloadRows[rowIndex] || payloadRows[0] || {};
  const out = {};
  const put = (k, v) => { if (safeStr(v) !== '') out[k] = v; };
  const mapped = mapRowDataToHeaders_(payload, code, row);
  Object.keys(mapped).forEach(k => put(k, mapped[k]));
  const rowExtra = row && row.extraFields && typeof row.extraFields === 'object' ? row.extraFields : {};
  Object.keys(rowExtra).forEach(k => put(k, rowExtra[k]));
  const globalExtra = payload.extraFields && typeof payload.extraFields === 'object' ? payload.extraFields : {};
  // 기존 버전에서 전역 extraFields에 저장된 값은 호환 목적으로만 보충합니다.
  // KCAC처럼 여러 잔이 하나의 제출 payload에 들어간 경우, 전역값이 각 잔 값을 덮어쓰면
  // 검수 화면에서 한 잔의 평가값이 다른 잔에 섞이는 문제가 생기므로 비어 있을 때만 채웁니다.
  Object.keys(globalExtra).forEach(k => { if (!Object.prototype.hasOwnProperty.call(out, k) || safeStr(out[k]) === '') put(k, globalExtra[k]); });
  return out;
}

function kcacRowTotalFromExtra_(extra) {
  extra = extra || {};
  const subDirect = firstNumberFromKeys_(extra, ['소계','Subtotal']);
  const subRaw = subDirect !== null ? subDirect : kcacSubtotalFromRaw_(extra);
  const leaf = positivePenaltyValue_(firstNumberFromKeys_(extra, ['리프수감점','리프 수 감점','Leaf Penalty']));
  const rawTimePenalty = firstNumberFromKeys_(extra, ['시간감점','시간 초과 감점','Time Penalty']);
  const time = rawTimePenalty !== null && Math.abs(Number(rawTimePenalty)) >= 999 ? 999 : positivePenaltyValue_(rawTimePenalty);
  const genericPenaltyRaw = firstNumberFromKeys_(extra, ['감점','Penalty']);
  const genericPenalty = genericPenaltyRaw !== null && Math.abs(Number(genericPenaltyRaw)) >= 999 ? 999 : positivePenaltyValue_(genericPenaltyRaw);
  const hasSplitPenalty = firstNumberFromKeys_(extra, ['리프수감점','리프 수 감점','Leaf Penalty']) !== null || firstNumberFromKeys_(extra, ['시간감점','시간 초과 감점','Time Penalty']) !== null;
  const penalty = hasSplitPenalty ? (time >= 999 ? 999 : leaf + time) : (genericPenalty || 0);
  if (subRaw !== null && subRaw !== undefined) return penalty >= 999 ? 0 : roundScoreValue_(Math.max(0, subRaw - penalty));
  const fin = firstNumberFromKeys_(extra, ['최종점수','총점','Total Score','Total']);
  return fin === null ? null : roundScoreValue_(fin);
}

function mergeHeaders(code, rows) {
  const seen = new Set(); const out = [];
  function add(h){ h = safeStr(h); if (h && !seen.has(h)) { seen.add(h); out.push(h); } }
  expectedHeadersForCompetition(code).forEach(add);
  (rows || []).forEach(r => {
    const p = parseJson(r.payload_json, {});
    const payloadRows = Array.isArray(p.rows) ? p.rows : [{}];
    payloadRows.forEach((_, idx) => Object.keys(extractExtra(p, code, idx)).forEach(add));
  });
  return out;
}
function rowToReviewItem(r, code, headers, fallbackRound, payloadRowIndex=0) {
  const payload = parseJson(r.payload_json, {});
  const payloadRows = Array.isArray(payload.rows) ? payload.rows : [];
  const targetRow = payloadRows[payloadRowIndex] || payloadRows[0] || {};
  const data = Array.isArray(targetRow.data) ? targetRow.data : [];
  const isKcacMulti = safeStr(code).toUpperCase() === 'KCAC' && payloadRows.length > 1;
  const extra = isKcacMulti ? extractExtraSingleRow_(payload, code, payloadRowIndex) : extractExtra(payload, code, 0);
  const unit = firstNonEmpty([r.unit, extra['참가자번호'], extra['참가자 번호'], extra['선수번호'], extra['선수 번호'], extra['컵번호'], extra['Cup No'], extra['샘플번호'], extra['팀번호'], extra['팀 번호'], payload.unit, payload.cupNo, payload.participantNo, payload.teamNo, data[0]]);
  const round = firstNonEmpty([r.round, payload.round, payload.currentRound, extra['라운드'], fallbackRound]);
  const participantName = firstNonEmpty([r.participant_name, extra['선수명'], extra['참가자명'], extra['이름'], extra['팀명'], payload.participantName, payload.playerName, payload.teamName]);
  const computedTotal = isKcacMulti ? kcacRowTotalFromExtra_(extra) : canonicalScoreForPayload_(code, payload, 0);
  let totalScore = computedTotal !== null && computedTotal !== undefined ? computedTotal : (r.total_score === null || r.total_score === undefined ? firstNonEmpty([extra['총점'], extra['최종점수'], extra['Total'], extra['Total Score']]) : Number(r.total_score));
  if (r.disqualified || isDisqualifiedValue_(extra['실격여부']) || isDisqualifiedValue_(extra['DQ']) || isDisqualifiedValue_(extra.disqualified)) totalScore = 0;
  const item = Object.assign({}, extra);
  item.rowIndex = isKcacMulti ? (String(r.id) + ':' + String(payloadRowIndex)) : r.id;
  item.scoreRowId = r.id;
  item.payloadRowIndex = payloadRowIndex;
  item._scoreId = r.id;
  item._payloadRowIndex = payloadRowIndex;
  item['제출시간'] = r.submitted_at || ''; item['대회코드'] = r.competition_code || code; item['라운드'] = round; item['심사위원명'] = r.judge_name || payload.judgeName || ''; item['팀'] = r.team || payload.team || payload.teamGroup || ''; item['역할'] = r.role || payload.judgeRole || payload.role || ''; item['모드'] = r.mode || payload.mode || '';
  if (!item['참가자번호']) item['참가자번호'] = unit; if (!item['참가자 번호']) item['참가자 번호'] = unit; if (!item['컵번호']) item['컵번호'] = unit; if (!item['샘플번호']) item['샘플번호'] = unit; if (!item['팀번호']) item['팀번호'] = unit;
  if (!item['선수명']) item['선수명'] = participantName; if (!item['참가자명']) item['참가자명'] = participantName; if (!item['팀명'] && code === 'KTCC') item['팀명'] = participantName;
  item['총점'] = totalScore; item['최종점수'] = totalScore; item['실격여부'] = r.disqualified ? 'Y' : (item['실격여부'] || ''); item['실격사유'] = r.disqualification_reason || item['실격사유'] || ''; item['검수상태'] = r.review_status || item['검수상태'] || '미검수';
  // MOB 과거/검수 수정 데이터 호환: 시간감점은 화면·검수·최종정리에서 항상 양수 감점값으로 표시한다.
  // 예전 데이터에 -6처럼 저장된 경우에도 점수가 가산되는 것처럼 보이지 않게 6으로 정규화한다.
  if (safeStr(code).toUpperCase() === 'MOB' && item['시간감점'] !== undefined && item['시간감점'] !== null && safeStr(item['시간감점']) !== '') {
    item['시간감점'] = positivePenaltyValue_(item['시간감점']);
  }
  item.status = item['검수상태']; item.submittedAt = item['제출시간']; item.timestamp = item['제출시간']; item.competitionCode = item['대회코드']; item.round = item['라운드']; item.judgeName = item['심사위원명']; item.team = item['팀']; item.role = item['역할']; item.mode = item['모드']; item.unit = unit; item.participantName = participantName; item.totalScore = totalScore; item.disqualified = !!r.disqualified; item.disqualificationReason = item['실격사유']; item.payload = payload;
  const sigData = r.signature_data || payload.signatureBase64 || payload.signatureData || payload.signature || '';
  item.signatureData = sigData; item['서명저장'] = sigData ? 'Y' : '';
  const mediaSummary = mediaSummaryForPayload_(payload);
  item.mediaCount = mediaSummary.count; item['이미지저장'] = mediaSummary.count ? 'Y' : ''; item['이미지개수'] = mediaSummary.count || '';
  item.values = (headers || []).map((h, idx) => { const v = item[h] === undefined || item[h] === null ? '' : item[h]; item['_col' + idx] = v; return v; }); return item;
}

function rowToReviewItems_(r, code, headers, fallbackRound) {
  const payload = parseJson(r.payload_json, {});
  const payloadRows = Array.isArray(payload.rows) ? payload.rows : [];
  if (safeStr(code).toUpperCase() === 'KCAC' && payloadRows.length > 1) {
    return payloadRows.map((_, idx) => rowToReviewItem(r, code, headers, fallbackRound, idx));
  }
  return [rowToReviewItem(r, code, headers, fallbackRound, 0)];
}

function mediaSummaryForPayload_(payload) {
  const rows = Array.isArray(payload && payload.rows) ? payload.rows : [];
  let count = 0;
  rows.forEach(row => {
    const media = row && (row.media || row.kcacMedia || row.mediaSnapshots);
    const snaps = media && Array.isArray(media.snapshots) ? media.snapshots : (Array.isArray(media) ? media : []);
    count += snaps.length;
  });
  return { count };
}
function stripPayloadForReport_(payload) {
  const p = parseJson(JSON.stringify(payload || {}), {});
  if (Array.isArray(p.rows)) {
    p.rows.forEach(row => {
      if (row && row.media) {
        const snaps = Array.isArray(row.media.snapshots) ? row.media.snapshots : [];
        row.media = {
          type: row.media.type || '',
          jarLabel: row.media.jarLabel || '',
          count: snaps.length,
          labels: snaps.map(x => x && x.label || '').filter(Boolean)
        };
      }
      if (row && row.kcacMedia) delete row.kcacMedia;
      if (row && row.mediaSnapshots) delete row.mediaSnapshots;
    });
  }
  if (p.signatureBase64) p.signatureBase64 = '[서명 저장됨]';
  if (p.signatureData) p.signatureData = '[서명 저장됨]';
  if (p.signature) p.signature = '[서명 저장됨]';
  return p;
}
function reportRowOut_(item, headers) {
  const out = {
    '제출ID': item.rowIndex,
    '제출시간': item['제출시간'] || '',
    '라운드': item['라운드'] || item.round || '',
    '식별번호': item.unit || item['참가자번호'] || item['팀번호'] || item['컵번호'] || item['샘플번호'] || '',
    '선수/팀명': item.participantName || item['선수명'] || item['팀명'] || '',
    '소속/팀': item.participantAffiliation || item['소속'] || item.participantTeamName || item['팀명'] || '',
    '심사위원명': item['심사위원명'] || item.judgeName || '',
    '팀/테이블': item['팀'] || item.team || '',
    '역할': item['역할'] || item.role || '',
    '모드': item['모드'] || item.mode || '',
    '총점': item['총점'] ?? item.totalScore ?? '',
    '검수상태': item['검수상태'] || item.status || '',
    '실격여부': item['실격여부'] || (item.disqualified ? 'Y' : ''),
    '실격사유': item['실격사유'] || item.disqualificationReason || '',
    '서명저장': item.signatureData ? 'Y' : '',
    '이미지저장': item.mediaCount ? 'Y' : '',
    '이미지개수': item.mediaCount || ''
  };
  (headers || []).forEach(h => {
    if (!h || Object.prototype.hasOwnProperty.call(out, h)) return;
    const v = item[h];
    if (v !== undefined && v !== null && typeof v !== 'object') out[h] = v;
  });
  return out;
}
async function getFinalReport(env, competitionCode, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const auth = await requireManageActorForCode_(env, actorArg, code, '최종정리파일 다운로드 권한이 없습니다. 관리자 또는 대회팀장 권한으로 로그인해주세요.');
  if (!auth.ok) return auth.res;
  const data = await buildRankingData_(env, code);
  const allRows = data.rows.map(item => reportRowOut_(item, data.headers));
  const approvedRows = allRows.filter(r => safeStr(r['검수상태']).replace(/\s/g,'') === '검수완료');
  // 최종정리 파일은 실제 발표/보관용이므로 검수완료 데이터만 내려보냅니다.
  const rows = approvedRows.slice();
  const rawRows = data.rows.filter(item => safeStr(item['검수상태'] || item.status).replace(/\s/g,'') === '검수완료').map(item => ({
    id: item.rowIndex,
    submittedAt: item['제출시간'] || '',
    round: item['라운드'] || item.round || '',
    unit: item.unit || '',
    judgeName: item.judgeName || '',
    role: item.role || '',
    totalScore: item.totalScore ?? '',
    reviewStatus: item.status || '',
    disqualified: item.disqualified ? 'Y' : '',
    signatureSaved: item.signatureData ? 'Y' : '',
    mediaCount: item.mediaCount || 0,
    payload: stripPayloadForReport_(item.payload)
  }));
  const rounds = Array.from(new Set((data.ranking || []).map(r => r.round).concat(rows.map(r => r['라운드'])).filter(Boolean)));
  return {
    success: true,
    compCode: code,
    compName: data.cfg ? data.cfg.name : (COMPETITION_NAMES[code] || code),
    currentRound: data.cfg ? data.cfg.current_round : '',
    unitLabel: code === 'KTCC' ? '팀번호' : '참가자번호',
    generatedAt: nowIso(),
    tieBreakRule: tieRuleLabel_(code, rounds[0] || (data.cfg && data.cfg.current_round) || ''),
    headers: data.headers,
    rounds,
    ranking: data.ranking,
    rows,
    approvedRows,
    rawRows
  };
}

function inferScorePayload(payload) {
  const p = payload || {}; const rows = Array.isArray(p.rows) ? p.rows : []; const firstRow = rows[0] || {}; const data = Array.isArray(firstRow.data) ? firstRow.data : (Array.isArray(p.data) ? p.data : []);
  const code = safeStr(p.competitionCode || p.code || p.compCode || p.competition || '').toUpperCase();
  const extra = extractExtra(p, code, 0);
  const round = safeStr(p.round || p.currentRound || p.roundName || '');
  const judgeName = firstNonEmpty([p.judgeName, p.name, p.judge && p.judge.name]);
  const role = firstNonEmpty([p.judgeRole, p.role, p.judge && p.judge.role]);
  const team = firstNonEmpty([p.team, p.teamGroup, p.judge && p.judge.teamGroup]);
  const mode = safeStr(p.mode || p.evalMode || '');
  const unit = firstNonEmpty([p.unit, p.cupNo, p.cupNumber, p.participantNo, p.participantNumber, p.teamNo, p.targetNo, p.number, extra['참가자번호'], extra['참가자 번호'], extra['Cup No'], extra['컵번호'], extra['샘플번호'], extra['팀번호'], data[0]]);
  const participantName = firstNonEmpty([p.participantName, p.playerName, p.teamName, extra['선수명'], extra['참가자명'], extra['팀명'], extra['이름']]);
  let total = canonicalScoreForPayload_(code, p, 0);
  if (total === null) total = toNumber(p.totalScore ?? p.total ?? p.finalScore ?? p.subtotalScore ?? p.subtotal);
  if (total === null) total = numberFromKeys(extra, ['총점','최종점수','Total','Total Score','total','totalScore','finalScore','subtotalScore','subtotal']);
  if (total === null && rows.length) { const nums = []; rows.forEach(row => { if (row && row.extraFields) { const n = numberFromKeys(row.extraFields, ['총점','최종점수','Total','Total Score','total','totalScore','finalScore','subtotalScore','subtotal']); if (n !== null) nums.push(n); } }); if (nums.length) total = Math.max(...nums); }
  if (total === null) { const nums = []; JSON.stringify(p).replace(/"(?:총점|최종점수|Total|Total Score|totalScore|finalScore|subtotalScore|subtotal|score)"\s*:\s*"?(-?[0-9]+(?:\.[0-9]+)?)/gi, (_, n) => { nums.push(Number(n)); return _; }); if (nums.length) total = Math.max(...nums); }
  const dqValue = firstNonEmpty([p.disqualified, p.dq, extra['실격여부']]);
  const disqualified = dqValue === true || dqValue === 'true' || dqValue === 'Y' || dqValue === 'y' || dqValue === '1' || dqValue === '실격';
  const dqReason = firstNonEmpty([p.disqualificationReason, p.dqReason, extra['실격사유']]);
  return { code, round, judgeName, role, team, mode, unit, participantName, total, disqualified, dqReason };
}
async function submitScores(env, payload, signature, request = null) {
  const basePayload = payload || {};
  const initial = inferScorePayload(basePayload);
  if (!initial.code) return { success: false, message: '대회코드를 찾지 못했습니다.' };
  const auth = await requireActorForCode_(env, { judgeToken: basePayload.judgeToken || basePayload.actorToken || '' }, initial.code, '평가 제출 로그인이 만료되었습니다. 다시 로그인 후 제출해주세요.');
  if (!auth.ok) return auth.res;
  const submitKey = 'submit:' + initial.code + ':' + await sha256Hex_((auth.actor.phone || '') + ':' + (basePayload.judgeToken || '') + ':' + (clientIp_(request) || ''));
  const lim = await rateLimit_(env, submitKey, 60, 60);
  if (!lim.ok) return { success: false, message: '제출 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' };
  const rows = Array.isArray(basePayload.rows) ? basePayload.rows : [];
  const cfg = await env.DB.prepare('SELECT current_round FROM competitions WHERE code=?').bind(initial.code).first();
  const submitRound = safeStr(initial.round || (cfg && cfg.current_round) || '예선');
  // KCR/IKRC는 한 번에 여러 컵/샘플을 제출하므로, 디브리핑·순위 매칭을 위해 컵/샘플별로 분리 저장합니다.
  // KCAC는 여러 잔이 한 선수의 한 세트 점수라서 한 제출로 유지합니다.
  const shouldSplit = ['KCR','IKRC'].includes(initial.code) && rows.length > 1;
  const payloads = shouldSplit
    ? rows.map((row, idx) => Object.assign({}, basePayload, { rows: [row], originalRowCount: rows.length, originalRowIndex: idx + 1 }))
    : [basePayload];
  let inserted = 0, skipped = 0;
  const duplicateCutoff = new Date(Date.now() - 20 * 1000).toISOString();
  for (const rawPayload of payloads) {
    const onePayload = Object.assign({}, rawPayload || {});
    // 제출자 식별값을 payload에 반드시 남겨둡니다.
    // MOC/KTCC처럼 스텝이 직접 운영하는 대회에서도, 본인 제출 건만 수정·검수할 수 있게 하는 핵심 안전장치입니다.
    if (!onePayload.judgeName && auth.actor && auth.actor.name) onePayload.judgeName = auth.actor.name;
    if (!onePayload.judgePhone && auth.actor && auth.actor.phone) onePayload.judgePhone = auth.actor.phone;
    if (!onePayload.operatorName && auth.actor && auth.actor.name) onePayload.operatorName = auth.actor.name;
    if (!onePayload.operatorPhone && auth.actor && auth.actor.phone) onePayload.operatorPhone = auth.actor.phone;
    if (!onePayload.judgeRole && auth.actor && auth.actor.role) onePayload.judgeRole = auth.actor.role;
    if (!onePayload.role && auth.actor && auth.actor.role) onePayload.role = auth.actor.role;
    if (!onePayload.actorType && auth.actor && (auth.actor.type || auth.actor.accountType)) onePayload.actorType = auth.actor.type || auth.actor.accountType;
    if (!onePayload.team && auth.actor && auth.actor.teamGroup) onePayload.team = auth.actor.teamGroup;
    if (!onePayload.teamGroup && auth.actor && auth.actor.teamGroup) onePayload.teamGroup = auth.actor.teamGroup;
    if (!onePayload.round && !onePayload.currentRound && submitRound) onePayload.round = submitRound;
    const x0 = inferScorePayload(onePayload);
    if (!x0.code) continue;
    const total = canonicalScoreForPayload_(x0.code, onePayload, 0);
    const x = Object.assign({}, x0, { round: safeStr(x0.round || submitRound || '예선'), total: total !== null && total !== undefined ? total : x0.total });
    onePayload.totalScore = x.total;
    onePayload.computedTotalScore = x.total;
    onePayload.currentRound = x.round;
    if (!x.unit) return { success: false, message: '참가자번호/컵번호/샘플번호/팀번호를 찾지 못했습니다. 번호 입력을 확인해주세요.' };
    const payloadJson = JSON.stringify(onePayload || {});
    const dup = await env.DB.prepare(`SELECT id FROM scores WHERE competition_code=? AND round=? AND judge_name=? AND unit=? AND payload_json=? AND submitted_at>? LIMIT 1`)
      .bind(x.code, x.round, x.judgeName, x.unit, payloadJson, duplicateCutoff).first();
    if (dup && dup.id) { skipped++; continue; }
    const initialReviewStatus = (isCalibrationMode_(x.mode) || ((x.code === 'MOB' || x.code === 'IKRC') && isHeadRole_(x.role))) ? '켈리브레이션' : '미검수';
    await env.DB.prepare(`INSERT INTO scores (submitted_at, competition_code, round, judge_name, team, role, mode, unit, participant_name, total_score, disqualified, disqualification_reason, review_status, payload_json, signature_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(nowIso(), x.code, x.round, x.judgeName, x.team, x.role, x.mode, x.unit, x.participantName, x.total, boolInt(x.disqualified), x.dqReason, initialReviewStatus, payloadJson, signature || '').run();
    inserted++;
  }
  if (!inserted && skipped) return { success: true, message: '이미 저장된 동일 제출입니다.', inserted: 0, skipped };
  if (!inserted) return { success: false, message: '저장할 평가 데이터가 없습니다.' };
  return { success: true, message: inserted > 1 ? `${inserted}건 저장 완료` : '저장 완료', inserted, skipped };
}

async function getReviewList(env, competitionCode, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const auth = await requireActorForCode_(env, actorArg, code, '검수 조회 권한이 없습니다. 다시 로그인해주세요.');
  if (!auth.ok) return auth.res;
  const cfg = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind(code).first();
  const rowsRaw = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id DESC').bind(code).all();
  const rawAll = rowsRaw.results || [];
  const manager = hasManageAccess(auth.actor, code);
  const raw = manager ? rawAll : rawAll.filter(r => scoreOwnedByActor_(r, auth.actor));
  const headers = mergeHeaders(code, raw);
  let list = raw.flatMap(r => rowToReviewItems_(r, code, headers, cfg && cfg.current_round));
  if (manager && list.length) {
    const pRows = await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY id ASC').bind(code).all();
    const pIdx = indexParticipantIdentities_(pRows.results || [], code);
    list = list.map(item => enrichReviewItemWithParticipant_(item, lookupParticipantIdentity_(pIdx, item.round || item['라운드'] || (cfg && cfg.current_round), itemNumber_(item) || item.unit), code));
  }
  // MOB/IKRC 헤드 켈리브레이션은 별도 켈리브레이션 화면에서만 확인하고, 일반 검수 목록에는 섞지 않는다.
  if (code === 'MOB' || code === 'IKRC') {
    list = list.filter(item => !isCalibrationMode_(item['모드'] || item.mode) && !isHeadRole_(item['역할'] || item.role));
  }
  return { success: true, list, headers, ownOnly: !manager };
}

async function updateReviewRow(env, competitionCode, rowIndex, updates, newStatus, roleText, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const auth = await requireActorForCode_(env, actorArg, code, '검수 수정 권한이 없습니다. 다시 로그인해주세요.');
  if (!auth.ok) return auth.res;
  const actor = auth.actor;
  const ref = parseReviewRowRef_(rowIndex);
  const id = ref.id; if (!id) return { success: false, message: '수정할 행 번호가 없습니다.' };
  const payloadRowIndex = Math.max(0, Number(ref.payloadRowIndex) || 0);
  const current = await env.DB.prepare('SELECT * FROM scores WHERE id=? AND competition_code=?').bind(id, code).first();
  if (!current) return { success: false, message: '수정할 데이터를 찾지 못했습니다.' };
  if (!canReviewScoreRow_(current, actor, code)) return { success: false, message: '본인이 제출한 평가만 직접 검수할 수 있습니다. 전체 검수는 관리자 또는 대회팀장 권한이 필요합니다.' };
  const statusRequested = safeStr(newStatus) || current.review_status || '미검수';
  if (safeStr(current.review_status) === '검수완료' && statusRequested !== '검수완료' && !hasManageAccess(actor, code)) {
    return { success: false, message: '검수완료 항목을 미검수로 되돌리는 권한은 관리자 또는 대회팀장에게만 있습니다.' };
  }
  const rowsRaw = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id DESC').bind(code).all();
  const rawAll = rowsRaw.results || [];
  const manager = hasManageAccess(actor, code);
  // 검수 수정 컬럼은 getReviewList와 동일한 행 집합 기준으로 계산한다.
  // 심사위원별 payload 필드 차이로 전체 행 기준 헤더를 쓰면 열 번호가 밀릴 수 있다.
  const rawForHeaders = manager ? rawAll : rawAll.filter(r => scoreOwnedByActor_(r, actor));
  const headers = mergeHeaders(code, rawForHeaders.length ? rawForHeaders : [current]); const updateObj = updates || {};
  const payload = parseJson(current.payload_json, {});
  if (!Array.isArray(payload.rows)) payload.rows = [{}];
  if (!payload.rows.length) payload.rows.push({});
  const targetRowIndex = Math.min(payloadRowIndex, Math.max(0, payload.rows.length - 1));
  const row0 = payload.rows[targetRowIndex] || (payload.rows[targetRowIndex] = {});
  if (!Array.isArray(row0.data)) row0.data = [];
  if (!row0.extraFields || typeof row0.extraFields !== 'object') row0.extraFields = {};
  if (!payload.extraFields || typeof payload.extraFields !== 'object') payload.extraFields = {};
  const dataHeaders = dataHeadersForCompetition_(code);
  let explicitDq = null;
  let explicitDqTouched = false;
  Object.keys(updateObj).forEach(col => {
    const idx = Number(col); const header = headers[idx]; if (!header) return; const value = updateObj[col];
    if (isDisqualificationHeader_(header)) {
      explicitDqTouched = true;
      const parsedDq = parseExplicitDisqualificationValue_(value);
      if (parsedDq !== null) explicitDq = parsedDq;
    }
    // 1) 원본 row.data를 직접 갱신한다. 이 값이 총점 재계산의 기준이므로 반드시 바뀌어야 한다.
    const dataIdx = dataHeaders.indexOf(header);
    if (dataIdx >= 0) {
      while (row0.data.length <= dataIdx) row0.data.push('');
      row0.data[dataIdx] = value;
    }
    // 2) 동적/추가 컬럼 호환을 위해 extraFields에도 최신값을 남긴다.
    // KCAC는 한 제출 안에 여러 잔이 들어 있으므로 반드시 해당 잔(row)의 extraFields만 갱신한다.
    row0.extraFields[header] = value;
    if (code !== 'KCAC' || payload.rows.length <= 1) payload.extraFields[header] = value;
  });
  if (explicitDqTouched && explicitDq === null) explicitDq = false;
  if (explicitDq !== null) {
    if (explicitDq === false && !!current.disqualified && !hasManageAccess(actor, code)) {
      return { success:false, message:'실격 해제는 관리자 또는 대회팀장만 가능합니다.' };
    }
    const dqText = explicitDq ? 'Y' : 'N';
    payload.disqualified = !!explicitDq;
    payload.dq = dqText;
    payload.disqualifiedYn = dqText;
    row0.extraFields['실격여부'] = dqText;
    payload.extraFields['실격여부'] = dqText;
    if (!explicitDq) {
      payload.disqualificationReason = '';
      payload.dqReason = '';
      row0.extraFields['실격사유'] = '';
      payload.extraFields['실격사유'] = '';
    }
  }
  const tmpHeaders = mergeHeaders(code, [{...current, payload_json: JSON.stringify(payload)}]);
  const item = rowToReviewItem({...current, disqualified: explicitDq === null ? current.disqualified : boolInt(explicitDq), disqualification_reason: explicitDq === false ? '' : current.disqualification_reason, payload_json: JSON.stringify(payload)}, code, tmpHeaders, '', targetRowIndex); const inferred = inferScorePayload(payload);
  const unit = firstNonEmpty([item.unit, current.unit, inferred.unit]); const participantName = firstNonEmpty([item.participantName, current.participant_name, inferred.participantName]);
  const canonicalTotal = canonicalScoreForPayload_(code, payload, 0);
  const total = canonicalTotal !== null && canonicalTotal !== undefined ? canonicalTotal : (inferred.total !== null && inferred.total !== undefined ? inferred.total : current.total_score);
  payload.totalScore = total;
  payload.computedTotalScore = total;
  const dq = explicitDq !== null ? explicitDq : (isDisqualifiedValue_(item['실격여부']) || inferred.disqualified || !!current.disqualified);
  const dqReason = dq ? firstNonEmpty([item['실격사유'], inferred.dqReason, current.disqualification_reason]) : '';
  const status = statusRequested;
  await env.DB.prepare(`UPDATE scores SET unit=?, participant_name=?, total_score=?, disqualified=?, disqualification_reason=?, review_status=?, payload_json=? WHERE id=? AND competition_code=?`)
    .bind(unit, participantName, total === null || total === undefined || Number.isNaN(Number(total)) ? null : Number(total), boolInt(dq), dqReason, status, JSON.stringify(payload), id, code).run();
  return { success: true, message: '검수 수정 저장 완료', rowIndex: id, status };
}
async function updateReviewStatus(env, competitionCode, rowIndexes, newStatus, roleText, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const auth = await requireActorForCode_(env, actorArg, code, '검수 상태 변경 권한이 없습니다. 다시 로그인해주세요.');
  if (!auth.ok) return auth.res;
  const ids = Array.isArray(rowIndexes) ? rowIndexes : [rowIndexes];
  const status = safeStr(newStatus) || '미검수';
  const seenIds = new Set();
  for (const rawId of ids) {
    const ref = parseReviewRowRef_(rawId);
    const id = ref.id;
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    const cur = await env.DB.prepare('SELECT * FROM scores WHERE id=? AND competition_code=?').bind(id, code).first();
    if (!cur) continue;
    if (!canReviewScoreRow_(cur, auth.actor, code)) {
      return { success: false, message: '본인이 제출한 평가만 직접 검수할 수 있습니다. 전체 검수는 관리자 또는 대회팀장 권한이 필요합니다.' };
    }
    if (safeStr(cur.review_status) === '검수완료' && status !== '검수완료' && !hasManageAccess(auth.actor, code)) {
      return { success: false, message: '검수완료 항목을 되돌리는 권한은 관리자 또는 대회팀장에게만 있습니다.' };
    }
    await env.DB.prepare('UPDATE scores SET review_status=? WHERE id=? AND competition_code=?').bind(status, id, code).run();
  }
  return { success: true, message: '상태 변경 완료' };
}
async function deleteReviewRow(env, competitionCode, rowIndex, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success: false, message: '삭제는 전체 관리자만 가능합니다.' };
  const ref = parseReviewRowRef_(rowIndex);
  await env.DB.prepare('DELETE FROM scores WHERE id=? AND competition_code=?').bind(ref.id, code).run();
  return { success: true, message: '삭제 완료' };
}



function mobRoleCategoryServer_(roleText) {
  const r = safeStr(roleText).replace(/\s/g, '').toLowerCase();
  const hasTech = /테크|기술|technical|tech|^t\d*$|^tjudge\d*$|^technicaljudge\d*$/.test(r);
  const hasSens = /센서|감각|sensory|sensor|^s\d*$|^sjudge\d*$|^sensoryjudge\d*$/.test(r);
  if (hasTech && !hasSens) return 'technical';
  if (hasSens && !hasTech) return 'sensory';
  if (hasTech) return 'technical';
  if (hasSens) return 'sensory';
  return '';
}
function mobCategoryLabelServer_(category) {
  return category === 'technical' ? '테크니컬 헤드 심사위원 켈리브레이션' : (category === 'sensory' ? '센서리 헤드 심사위원 켈리브레이션' : 'MOB 켈리브레이션');
}
function mobCalCheckToken_(team, category, participantNo, round='') {
  return ['mobcal', safeStr(team).replace(/\s+/g,'_') || 'ALL', safeStr(category) || 'all', safeStr(round).replace(/\s+/g,'_') || 'round', safeStr(participantNo).replace(/\s+/g,'_')].join(':').slice(0, 180);
}
function mobTeamMatchesServer_(requestedTeam, rowTeam) {
  const req = safeStr(requestedTeam), row = safeStr(rowTeam);
  if (!req || !row) return true;
  if (req === row) return true;
  const reqNums = req.match(/\d+/g) || [];
  const rowNums = row.match(/\d+/g) || [];
  if (reqNums.length && rowNums.length && reqNums.some(n => rowNums.includes(n))) return true;
  // 헤드1팀 / 센서리1팀처럼 접두어가 달라도 같은 역할 그룹이면 운영 중 비교 가능해야 한다.
  const reqCore = req.replace(/헤드|심사위원|심사|팀|MOB|\s/g,'');
  const rowCore = row.replace(/헤드|심사위원|심사|팀|MOB|\s/g,'');
  return !!reqCore && !!rowCore && (reqCore === rowCore || reqCore.indexOf(rowCore) > -1 || rowCore.indexOf(reqCore) > -1);
}
function mobCalNumberFromItem_(item) {
  return safeStr(item.unit || item['참가자번호'] || item['참가자 번호'] || item['선수번호'] || item['번호'] || item['컵번호']);
}
function mobScoreObjectFromItem_(item) {
  function n(keys){ const v = firstNumberFromKeys_(item, keys); return v === null ? 0 : v; }
  const pre = n(['Pre-Service Station(시연 전 작업대)','Pre-Service Station']);
  const service = n(['Service Station(시연 중 작업대)','Service Station']);
  const post = n(['Post-Service Station(시연 후 작업대)','Post-Service Station']);
  const signatureTechPre = n(['Signature Technical Pre-Service Station(창작음료 시연 전 작업대)','Signature Technical Pre-Service Station']);
  const signatureTechService = n(['Signature Technical Service Station(창작음료 시연 중 작업대)','Signature Technical Service Station']);
  const signatureIngredientUse = n(['Signature Technical Ingredient Use(부재료 사용의 적절함)','Signature Technical Ingredient Use']);
  const signatureTechPost = n(['Signature Technical Post-Service Station(창작음료 시연 후 작업대)','Signature Technical Post-Service Station']);
  const sweetness = n(['Sweetness(스윗니스)','Sweetness']);
  const flavor = n(['Flavor(플레이버)','Flavor']);
  const balance = n(['Balance(균형)','Balance']);
  const cleanCup = n(['Clean Cup(클린컵)','Clean Cup']);
  const mouthfeel = n(['Mouthfeel(질감)','Mouthfeel']);
  const professionalism = n(['Professionalism(시연 전문성)','Professionalism']);
  const creativeForm = n(['Creative Form & Usability(형태와 용이성)','Form & Usability(형태와 용이성)','Creative Form']);
  const creativeFlavor = n(['Creative Flavor(창작 향미)','Creative Flavor']);
  const creativeBalance = n(['Creative Balance(균형)','Creative Balance']);
  const creativeMouthfeel = n(['Creative Mouthfeel(질감)','Creative Mouthfeel']);
  const creativeProfessionalism = n(['Creative Professionalism(전문성과 독창성)','Professionalism & Originality(전문성과 독창성)','Creative Professionalism']);
  const computedTechnicalTotal = Math.round((pre + service + post + signatureTechPre + signatureTechService + signatureIngredientUse + signatureTechPost) * 10) / 10;
  const computedSensoryTotal = Math.round((sweetness + flavor + balance + cleanCup + mouthfeel + professionalism) * 10) / 10;
  const computedCreativeTotal = Math.round((creativeForm + creativeFlavor + creativeBalance + creativeMouthfeel + creativeProfessionalism) * 10) / 10;
  const total = Number(item.totalScore ?? item['총점'] ?? item['최종점수'] ?? item['총평가 반영점수'] ?? 0) || 0;
  const technicalTotal = n(['테크니컬 총점','Technical Total','technicalTotal']) || computedTechnicalTotal;
  const sensoryTotal = n(['센서리 총점','Sensory Total','sensoryTotal']) || computedSensoryTotal;
  const creativeTotal = n(['창작메뉴 총점','창작 메뉴 총점','Signature Total','creativeTotal']) || computedCreativeTotal;
  const timePenalty = n(['시간감점','시간 감점','Time Penalty','timePenalty']);
  const grossTotal = n(['감점 전 합산','감점전 합산','Gross Total','grossTotal']) || Math.round((technicalTotal + sensoryTotal + creativeTotal) * 10) / 10;
  const officialTotal = n(['총평가 반영점수','총 평가 반영점수','Official Total','officialTotal']) || total;
  return {
    id: item.rowIndex || '',
    participantNo: mobCalNumberFromItem_(item),
    judgeName: item.judgeName || item['심사위원명'] || '',
    team: item.team || item['팀'] || '',
    role: item.role || item['역할'] || '',
    mode: item.mode || item['모드'] || '',
    menu: item['메뉴'] || item.menu || '브루잉',
    total,
    technicalTotal,
    sensoryTotal,
    creativeTotal,
    grossTotal,
    officialTotal,
    timePenalty,
    timeText: firstNonEmpty([item['경기시간'], item['경기 시간'], item.timeText, item['Time']]),
    comment: firstNonEmpty([item['종합코멘트'], item['전체 코멘트'], item['평가메모'], item['평가의견'], item['심사평'], item.comment, item['Comment']]),
    submittedAt: item.submittedAt || item['제출시간'] || '',
    reviewStatus: item.status || item['검수상태'] || '',
    isHeadCalibration: isCalibrationMode_(item['모드'] || item.mode) || isHeadRole_(item['역할'] || item.role),
    pre,
    service,
    post,
    signatureTechPre,
    signatureTechService,
    signatureIngredientUse,
    signatureTechPost,
    sweetness,
    flavor,
    balance,
    cleanCup,
    mouthfeel,
    professionalism,
    creativeForm,
    creativeFlavor,
    creativeBalance,
    creativeMouthfeel,
    creativeProfessionalism
  };
}
async function mobCalibrationRows_(env, requestedTeam, roleText, actorArg) {
  const auth = await requireActorForCode_(env, actorArg, 'MOB', 'MOB 켈리브레이션 확인 권한이 없습니다. 다시 로그인해주세요.');
  if (!auth.ok) return { error: auth.res };
  const actorRole = safeStr(auth.actor && auth.actor.role);
  if (!hasManageAccess(auth.actor, 'MOB') && !isHeadRole_(actorRole)) {
    return { error: { success:false, message:'MOB 켈리브레이션은 헤드 심사위원 또는 대회팀장/관리자만 확인할 수 있습니다.' } };
  }
  const category = mobRoleCategoryServer_(roleText || actorRole);
  if (!category) return { error: { success:false, message:'센서리/테크니컬 헤드 역할을 확인할 수 없습니다. 운영계정 역할명을 확인해주세요.' } };
  const cfg = await env.DB.prepare('SELECT current_round FROM competitions WHERE code=?').bind('MOB').first();
  const currentRound = safeStr(cfg && cfg.current_round);
  const rawRows = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id ASC').bind('MOB').all();
  const headers = mergeHeaders('MOB', rawRows.results || []);
  let rows = (rawRows.results || []).map(r => rowToReviewItem(r, 'MOB', headers, currentRound));
  rows = rows.filter(item => {
    const num = mobCalNumberFromItem_(item);
    if (!num) return false;
    if (currentRound && safeStr(item.round || item['라운드']) && safeStr(item.round || item['라운드']) !== currentRound) return false;
    const roleCat = mobRoleCategoryServer_(item['역할'] || item.role);
    if (roleCat !== category) return false;
    if (!mobTeamMatchesServer_(requestedTeam, item['팀'] || item.team)) return false;
    return true;
  });
  return { auth, category, currentRound, rows, label: mobCategoryLabelServer_(category) };
}
async function getMobCalibrationParticipantNumbers(env, requestedTeam, roleText, actorArg) {
  const data = await mobCalibrationRows_(env, requestedTeam, roleText, actorArg);
  if (data.error) return data.error;
  const normal = data.rows.filter(item => !isCalibrationMode_(item['모드'] || item.mode) && !isHeadRole_(item['역할'] || item.role));
  if (!normal.length) return [];
  const checksRaw = await env.DB.prepare('SELECT token, payload_json FROM sessions WHERE kind=?').bind('MOB_CALIBRATION_CHECK').all();
  const checks = new Map();
  (checksRaw.results || []).forEach(r => checks.set(r.token, parseJson(r.payload_json, {})));
  const by = new Map();
  normal.forEach(item => {
    const no = mobCalNumberFromItem_(item);
    const token = mobCalCheckToken_(requestedTeam, data.category, no, data.currentRound);
    const cur = by.get(no) || { participantNo:no, checked:false, judgeCount:0, latestSubmittedAt:'', checkedAt:'', checkerName:'', categoryLabel:data.label };
    cur.judgeCount += 1;
    const submittedAt = safeStr(item.submittedAt || item['제출시간']);
    if (submittedAt && (!cur.latestSubmittedAt || submittedAt > cur.latestSubmittedAt)) cur.latestSubmittedAt = submittedAt;
    const check = checks.get(token);
    if (check && check.checkedAt) { cur.checked = true; cur.checkedAt = check.checkedAt; cur.checkerName = check.checkerName || ''; }
    by.set(no, cur);
  });
  // MOB 켈리브레이션은 헤드가 '검수완료' 처리한 참가자를 목록에서 숨겨 현장 혼선을 줄인다.
  return Array.from(by.values()).filter(x => !x.checked).sort((a,b) => safeStr(a.participantNo).localeCompare(safeStr(b.participantNo), 'ko', {numeric:true}));
}
async function getMobCalibrationResultsByParticipant(env, participantNo, requestedTeam, roleText, actorArg) {
  const data = await mobCalibrationRows_(env, requestedTeam, roleText, actorArg);
  if (data.error) return data.error;
  const no = safeStr(participantNo);
  if (!no) return [];
  return data.rows.filter(item => mobCalNumberFromItem_(item) === no).map(mobScoreObjectFromItem_).sort((a,b) => Number(a.isHeadCalibration) - Number(b.isHeadCalibration) || safeStr(a.judgeName).localeCompare(safeStr(b.judgeName), 'ko'));
}
async function markMobCalibrationChecked(env, participantNo, requestedTeam, checkerName, roleText, actorArg) {
  const data = await mobCalibrationRows_(env, requestedTeam, roleText, actorArg);
  if (data.error) return data.error;
  const no = safeStr(participantNo);
  if (!no) return { success:false, message:'참가자 번호가 없습니다.' };
  const token = mobCalCheckToken_(requestedTeam, data.category, no, data.currentRound);
  const payload = { competitionCode:'MOB', participantNo:no, team:safeStr(requestedTeam), category:data.category, role:safeStr(roleText), checkerName:safeStr(checkerName), checkedAt:nowIso(), round:data.currentRound };
  await env.DB.prepare('INSERT OR REPLACE INTO sessions (token, kind, payload_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, 'MOB_CALIBRATION_CHECK', JSON.stringify(payload), '2035-12-31T23:59:59.000Z', nowIso()).run();
  return { success:true, message:'검수완료 처리되었습니다.', participantNo:no, checkedAt:payload.checkedAt };
}


function ikrcCalCheckToken_(team, sampleNo, round) {
  return 'IKRC_CAL_CHECK:' + [safeStr(team) || '-', safeStr(round) || '-', safeStr(sampleNo)].map(encodeURIComponent).join(':');
}
function ikrcSeedMatchToken_(matchNo) { return 'IKRC_SEED_MATCH:' + encodeURIComponent(safeStr(matchNo)); }
function ikrcSeedResultToken_(targetType, targetValue) { return 'IKRC_SEED_RESULT:' + encodeURIComponent(safeStr(targetType) || 'participant') + ':' + encodeURIComponent(safeStr(targetValue)); }
function ikrcSampleNoFromItem_(item) { return safeStr(item && (item['샘플번호'] || item.sampleNo || item.unit || item['컵번호'] || item['Cup No'])); }
function ikrcParticipantNoFromItem_(item) { return safeStr(item && (item['참가자 번호'] || item['참가자번호'] || item.participantNo || item.uniqueNo || item['선수번호'])); }
function ikrcScoreObjectFromItem_(item) {
  item = item || {};
  const extraComment = firstNonEmpty([item['종합코멘트'], item['전체 코멘트'], item['평가메모'], item['평가의견'], item['심사평'], item.comment, item.memo]);
  return {
    sampleNo: ikrcSampleNoFromItem_(item),
    participantNo: ikrcParticipantNoFromItem_(item),
    judgeName: item['심사위원명'] || item.judgeName || '',
    team: item['팀'] || item.team || '',
    role: item['역할'] || item.role || '',
    mode: item['모드'] || item.mode || '',
    total: toNumber(item['총점'] ?? item.totalScore) || 0,
    flavor: itemScore_(item, ['Flavor(플레이버) ×3','Flavor(플레이버)','Flavor']),
    cleanCup: itemScore_(item, ['Clean Cup(클린컵) ×2','Clean Cup(클린컵)','Clean Cup']),
    sweetness: itemScore_(item, ['Sweetness(스윗니스) ×2','Sweetness(스윗니스)','Sweetness']),
    acidity: itemScore_(item, ['Acidity(산미)','Acidity']),
    mouthfeel: itemScore_(item, ['Mouthfeel(마우스필) ×2','Mouthfeel(마우스필)','Mouthfeel']),
    comment: extraComment,
    submittedAt: item.submittedAt || item['제출시간'] || '',
    isHeadCalibration: isCalibrationMode_(item['모드'] || item.mode) || isHeadRole_(item['역할'] || item.role)
  };
}
async function ikrcCalibrationRows_(env, requestedTeam, actorArg) {
  const auth = await requireActorForCode_(env, actorArg, 'IKRC', 'IKRC 켈리브레이션 확인 권한이 없습니다. 다시 로그인해주세요.');
  if (!auth.ok) return { error: auth.res };
  const actorRole = safeStr(auth.actor && auth.actor.role);
  if (!hasManageAccess(auth.actor, 'IKRC') && !isHeadRole_(actorRole)) {
    return { error: { success:false, message:'IKRC 켈리브레이션은 헤드 심사위원 또는 대회팀장/관리자만 확인할 수 있습니다.' } };
  }
  const cfg = await env.DB.prepare('SELECT current_round FROM competitions WHERE code=?').bind('IKRC').first();
  const currentRound = safeStr(cfg && cfg.current_round);
  const rawRows = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id ASC').bind('IKRC').all();
  const headers = mergeHeaders('IKRC', rawRows.results || []);
  let rows = (rawRows.results || []).map(r => rowToReviewItem(r, 'IKRC', headers, currentRound));
  rows = rows.filter(item => {
    const no = ikrcSampleNoFromItem_(item);
    if (!no) return false;
    if (currentRound && safeStr(item.round || item['라운드']) && safeStr(item.round || item['라운드']) !== currentRound) return false;
    if (!mobTeamMatchesServer_(requestedTeam, item['팀'] || item.team)) return false;
    return true;
  });
  return { auth, currentRound, rows };
}
async function getIkrcCalibrationCupNumbers(env, requestedTeam, actorArg) {
  const data = await ikrcCalibrationRows_(env, requestedTeam, actorArg);
  if (data.error) return data.error;
  const normal = data.rows.filter(item => !isCalibrationMode_(item['모드'] || item.mode) && !isHeadRole_(item['역할'] || item.role));
  if (!normal.length) return [];
  const checksRaw = await env.DB.prepare('SELECT token, payload_json FROM sessions WHERE kind=?').bind('IKRC_CALIBRATION_CHECK').all();
  const checks = new Map();
  (checksRaw.results || []).forEach(r => checks.set(r.token, parseJson(r.payload_json, {})));
  const by = new Map();
  normal.forEach(item => {
    const sampleNo = ikrcSampleNoFromItem_(item);
    const token = ikrcCalCheckToken_(requestedTeam, sampleNo, data.currentRound);
    const cur = by.get(sampleNo) || { sampleNo, checked:false, judgeCount:0, latestSubmittedAt:'', checkedAt:'', checkerName:'' };
    cur.judgeCount += 1;
    const submittedAt = safeStr(item.submittedAt || item['제출시간']);
    if (submittedAt && (!cur.latestSubmittedAt || submittedAt > cur.latestSubmittedAt)) cur.latestSubmittedAt = submittedAt;
    const check = checks.get(token);
    if (check && check.checkedAt) { cur.checked = true; cur.checkedAt = check.checkedAt; cur.checkerName = check.checkerName || ''; }
    by.set(sampleNo, cur);
  });
  return Array.from(by.values()).sort((a,b) => Number(a.checked) - Number(b.checked) || safeStr(a.sampleNo).localeCompare(safeStr(b.sampleNo), 'ko', {numeric:true}));
}
async function getIkrcCalibrationResultsByCup(env, sampleNo, requestedTeam, actorArg) {
  const data = await ikrcCalibrationRows_(env, requestedTeam, actorArg);
  if (data.error) return data.error;
  const no = safeStr(sampleNo);
  if (!no) return [];
  return data.rows.filter(item => ikrcSampleNoFromItem_(item) === no).map(ikrcScoreObjectFromItem_).sort((a,b) => Number(a.isHeadCalibration) - Number(b.isHeadCalibration) || safeStr(a.judgeName).localeCompare(safeStr(b.judgeName), 'ko'));
}
async function markIkrcCalibrationChecked(env, sampleNo, requestedTeam, checkerName, roleText, actorArg) {
  const data = await ikrcCalibrationRows_(env, requestedTeam, actorArg);
  if (data.error) return data.error;
  const no = safeStr(sampleNo);
  if (!no) return { success:false, message:'컵/샘플 번호가 없습니다.' };
  const token = ikrcCalCheckToken_(requestedTeam, no, data.currentRound);
  const payload = { competitionCode:'IKRC', sampleNo:no, team:safeStr(requestedTeam), role:safeStr(roleText), checkerName:safeStr(checkerName), checkedAt:nowIso(), round:data.currentRound };
  await env.DB.prepare('INSERT OR REPLACE INTO sessions (token, kind, payload_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, 'IKRC_CALIBRATION_CHECK', JSON.stringify(payload), '2035-12-31T23:59:59.000Z', nowIso()).run();
  return { success:true, message:'확인 처리되었습니다.', sampleNo:no, checkedAt:payload.checkedAt };
}
function ikrcSeedTargetKeysForItem_(item) {
  const keys = [];
  const participantNo = ikrcParticipantNoFromItem_(item);
  const sampleNo = ikrcSampleNoFromItem_(item) || itemNumber_(item) || item.unit;
  if (participantNo) keys.push(ikrcSeedResultToken_('participant', participantNo));
  if (sampleNo) keys.push(ikrcSeedResultToken_('sample', sampleNo));
  return keys;
}
async function loadIkrcSeedResultMap_(env) {
  const raw = await env.DB.prepare('SELECT token, payload_json FROM sessions WHERE kind=?').bind('IKRC_SEED_RESULT').all();
  const map = new Map();
  (raw.results || []).forEach(r => map.set(r.token, parseJson(r.payload_json, {})));
  return map;
}
function applyIkrcSeedBonusToItem_(item, seedMap) {
  if (!item || !seedMap || !seedMap.size) return item;
  let best = null;
  for (const key of ikrcSeedTargetKeysForItem_(item)) {
    const p = seedMap.get(key);
    if (p && p.bonus !== undefined) { best = p; break; }
  }
  if (!best) return item;
  const bonus = Math.max(0, Math.min(3, Number(best.bonus) || 0));
  item['Seed to Cup 가산점'] = bonus;
  item['Seed to Cup 메모'] = safeStr(best.memo || '');
  const base = (() => {
    const extra = Object.assign({}, item);
    const flavor = firstNumberFromKeys_(extra, ['Flavor(플레이버) ×3','Flavor(플레이버)','Flavor']);
    const clean = firstNumberFromKeys_(extra, ['Clean Cup(클린컵) ×2','Clean Cup(클린컵)','Clean Cup']);
    const sweet = firstNumberFromKeys_(extra, ['Sweetness(스윗니스) ×2','Sweetness(스윗니스)','Sweetness']);
    const acidity = firstNumberFromKeys_(extra, ['Acidity(산미)','Acidity']);
    const mouth = firstNumberFromKeys_(extra, ['Mouthfeel(마우스필) ×2','Mouthfeel(마우스필)','Mouthfeel']);
    if ([flavor, clean, sweet, acidity, mouth].every(v => v !== null)) return (flavor * 3) + (clean * 2) + (sweet * 2) + acidity + (mouth * 2);
    return toNumber(item['총점'] ?? item.totalScore) || 0;
  })();
  const finalScore = roundScoreValue_(base + bonus);
  item['총점'] = finalScore;
  item['최종점수'] = finalScore;
  item.totalScore = finalScore;
  return item;
}
async function getIkrcSeedToCupConsole(env, actorArg) {
  const auth = await requireActorForCode_(env, actorArg, 'IKRC', 'IKRC Seed to Cup 조회 권한이 없습니다. 다시 로그인해주세요.');
  if (!auth.ok) return auth.res;
  if (!hasManageAccess(auth.actor, 'IKRC') && normalizeAccountType_(auth.actor.type || auth.actor.accountType || '', auth.actor.role || '') !== 'STAFF') {
    return { success:false, message:'IKRC Seed to Cup은 관리자, 대회팀장 또는 운영진만 사용할 수 있습니다.' };
  }
  const cfg = await env.DB.prepare('SELECT current_round FROM competitions WHERE code=?').bind('IKRC').first();
  const rawRows = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id ASC').bind('IKRC').all();
  const headers = mergeHeaders('IKRC', rawRows.results || []);
  let rows = (rawRows.results || []).map(r => rowToReviewItem(r, 'IKRC', headers, cfg && cfg.current_round));
  rows = rows.filter(item => !isCalibrationMode_(item['모드'] || item.mode) && !isHeadRole_(item['역할'] || item.role));
  const finalRows = rows.filter(item => roundName_(item.round || item['라운드']) === '결선');
  if (finalRows.length) rows = finalRows;
  const resultMap = await loadIkrcSeedResultMap_(env);
  const by = new Map();
  rows.forEach(item => {
    const participantNo = ikrcParticipantNoFromItem_(item) || itemNumber_(item) || item.unit;
    if (!participantNo) return;
    const cur = by.get(participantNo) || { targetType:'participant', targetValue:participantNo, participantNo, playerName:item.participantName || item['선수명'] || '', affiliation:item.participantAffiliation || item['소속'] || '', sampleNos:[], sensoryRowCount:0, seedBonus:0, seedMemo:'' };
    const sampleNo = ikrcSampleNoFromItem_(item);
    if (sampleNo && !cur.sampleNos.includes(sampleNo)) cur.sampleNos.push(sampleNo);
    cur.sensoryRowCount += 1;
    const direct = resultMap.get(ikrcSeedResultToken_('participant', participantNo)) || (sampleNo ? resultMap.get(ikrcSeedResultToken_('sample', sampleNo)) : null);
    if (direct) { cur.seedBonus = Number(direct.bonus) || 0; cur.seedMemo = safeStr(direct.memo || ''); }
    by.set(participantNo, cur);
  });
  const matchRows = await env.DB.prepare('SELECT token, payload_json FROM sessions WHERE kind=?').bind('IKRC_SEED_MATCH').all();
  const matches = (matchRows.results || []).map(r => parseJson(r.payload_json, {})).filter(Boolean).sort((a,b) => safeStr(a.matchNo).localeCompare(safeStr(b.matchNo), 'ko', {numeric:true}));
  const results = Array.from(resultMap.values()).sort((a,b) => safeStr(a.targetValue).localeCompare(safeStr(b.targetValue), 'ko', {numeric:true}));
  return { success:true, isManager:true, currentRound:safeStr(cfg && cfg.current_round), finalists:Array.from(by.values()).sort((a,b)=>safeStr(a.participantNo).localeCompare(safeStr(b.participantNo), 'ko', {numeric:true})), matches, results };
}
async function saveIkrcSeedToCupMatch(env, match, actorArg) {
  const auth = await requireActorForCode_(env, actorArg, 'IKRC', 'IKRC Seed to Cup 매치 저장 권한이 없습니다.');
  if (!auth.ok) return auth.res;
  if (!hasManageAccess(auth.actor, 'IKRC') && normalizeAccountType_(auth.actor.type || auth.actor.accountType || '', auth.actor.role || '') !== 'STAFF') return { success:false, message:'IKRC Seed to Cup 매치 저장은 관리자, 대회팀장 또는 운영진만 가능합니다.' };
  const m = match || {};
  const matchNo = safeStr(m.matchNo);
  if (!matchNo) return { success:false, message:'매치번호가 없습니다.' };
  const payload = { competitionCode:'IKRC', matchNo, participantA:m.participantA || {}, participantB:m.participantB || {}, memo:safeStr(m.memo), status:safeStr(m.status || '오픈'), savedAt:nowIso(), savedBy:safeStr(auth.actor && auth.actor.name) };
  await env.DB.prepare('INSERT OR REPLACE INTO sessions (token, kind, payload_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(ikrcSeedMatchToken_(matchNo), 'IKRC_SEED_MATCH', JSON.stringify(payload), '2035-12-31T23:59:59.000Z', nowIso()).run();
  return { success:true, message:'Seed to Cup 매치를 저장했습니다.', match:payload };
}
async function updateIkrcSeedToCupResult(env, target, bonus, memo, actorArg) {
  const auth = await requireActorForCode_(env, actorArg, 'IKRC', 'IKRC Seed to Cup 결과 저장 권한이 없습니다.');
  if (!auth.ok) return auth.res;
  if (!hasManageAccess(auth.actor, 'IKRC') && normalizeAccountType_(auth.actor.type || auth.actor.accountType || '', auth.actor.role || '') !== 'STAFF') return { success:false, message:'IKRC Seed to Cup 결과 저장은 관리자, 대회팀장 또는 운영진만 가능합니다.' };
  const targetType = safeStr(target && target.targetType) || 'participant';
  const targetValue = safeStr(target && target.targetValue);
  if (!targetValue) return { success:false, message:'저장할 참가자/샘플 번호가 없습니다.' };
  const payload = { competitionCode:'IKRC', targetType, targetValue, bonus:Math.max(0, Math.min(3, Math.round(Number(bonus) || 0))), memo:safeStr(memo), savedAt:nowIso(), savedBy:safeStr(auth.actor && auth.actor.name) };
  await env.DB.prepare('INSERT OR REPLACE INTO sessions (token, kind, payload_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(ikrcSeedResultToken_(targetType, targetValue), 'IKRC_SEED_RESULT', JSON.stringify(payload), '2035-12-31T23:59:59.000Z', nowIso()).run();
  return { success:true, message:'Seed to Cup 결과를 저장했습니다.', result:payload };
}

function isCalibrationMode_(v) { return /켈리브레이션|캘리브레이션|calibration|calib/i.test(safeStr(v)); }
function isHeadRole_(v) { return /헤드|head/i.test(safeStr(v)); }
function itemNumber_(item) { return safeStr(item.unit || item['참가자번호'] || item['참가자 번호'] || item['팀번호'] || item['컵번호'] || item['샘플번호']); }
function itemScore_(item, keys) { const n = firstNumberFromKeys_(item, keys || []); return n === null ? 0 : n; }
function itemScoreSum_(item, keys) {
  const n = sumFromKeys_(item, keys || []);
  return n === null ? 0 : n;
}
function itemBestScore_(item, keys) {
  const n = maxFromKeys_(item, keys || []);
  return n === null ? 0 : n;
}
function itemHasAnyScore_(item, keys) {
  return numbersFromKeys_(item, keys || []).length > 0;
}
function itemEndTimeSeconds_(item) {
  let s = safeStr(item['종료시간'] || item['경기시간'] || item['Time'] || item.endTime || '');
  if (!s) return 999999;
  s = s.replace(/[：]/g, ':').replace(/,/g, '.').trim();
  const korean = s.match(/(?:(\d+(?:\.\d+)?)\s*분)?\s*(\d+(?:\.\d+)?)?\s*초/);
  if (korean && (korean[1] != null || korean[2] != null)) {
    const sec = (Number(korean[1] || 0) * 60) + Number(korean[2] || 0);
    return Number.isFinite(sec) && sec > 0 ? sec : 999999;
  }
  const dotted = s.replace(/\s/g, '').match(/^(\d{1,3})\.(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (dotted) {
    const minutes = Number(dotted[1] || 0);
    const seconds = Number(dotted[2] || 0);
    const centiseconds = Number(dotted[3] || 0);
    if (Number.isFinite(minutes) && Number.isFinite(seconds) && Number.isFinite(centiseconds) && seconds < 60) {
      const sec = minutes * 60 + seconds + centiseconds / 100;
      return sec > 0 ? sec : 999999;
    }
  }
  const compact = s.replace(/\s/g,'').match(/^\d{3,6}$/);
  if (compact) {
    const raw = compact[0];
    let minutes = 0, seconds = 0, centiseconds = 0;
    if (raw.length >= 5) {
      minutes = Number(raw.slice(0, -4)); seconds = Number(raw.slice(-4, -2)); centiseconds = Number(raw.slice(-2));
    } else {
      minutes = Number(raw.slice(0, -2)); seconds = Number(raw.slice(-2));
    }
    if (Number.isFinite(minutes) && Number.isFinite(seconds) && Number.isFinite(centiseconds) && seconds < 60) {
      const sec = minutes * 60 + seconds + centiseconds / 100;
      return sec > 0 ? sec : 999999;
    }
  }
  const hms = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/);
  if (hms) return (Number(hms[1]||0)*3600) + Number(hms[2])*60 + Number(hms[3]) + Number('0.'+(hms[4]||0));
  const mmss = s.match(/^(\d+(?:\.\d+)?)\s*(?:min|m)\s*(\d+(?:\.\d+)?)?\s*(?:sec|s)?$/i);
  if (mmss) {
    const sec = (Number(mmss[1] || 0) * 60) + Number(mmss[2] || 0);
    return Number.isFinite(sec) && sec > 0 ? sec : 999999;
  }
  const n = Number(s.replace(/[^0-9.]/g,''));
  return Number.isFinite(n) && n > 0 ? n : 999999;
}
function roundName_(v, fallback='예선') { const s=safeStr(v); if (/final|결선/i.test(s)) return '결선'; if (/main|본선/i.test(s)) return '본선'; if (/qual|prelim|예선/i.test(s)) return '예선'; return s || fallback; }
function shouldCountItemInRanking_(code, item) {
  if (!item) return false;
  if (rankingExcludedByReviewStatus_(item['검수상태'] || item.status)) return false;
  if (isCalibrationMode_(item['모드'] || item.mode)) return false;
  if ((code === 'IKRC' || code === 'MOB') && isHeadRole_(item['역할'] || item.role)) return false;
  return true;
}
function tieInfoForItem_(code, item, round) {
  code = safeStr(code).toUpperCase();
  const r = roundName_(round, '');
  if (code === 'KCR') {
    return {
      sweetness: itemBestScore_(item, ['Sweetness(스윗니스) ×2','Sweetness(단맛) ×2','스윗니스','Sweetness','Sweetness(스윗니스)']),
      overall: itemBestScore_(item, ['Overall(주관적 종합평가)','Overall','오버롤'])
    };
  }
  if (code === 'IKRC') {
    return {
      flavor: itemBestScore_(item, ['Flavor(플레이버) ×3','Flavor(플레이버)','Flavor']),
      sweetness: itemBestScore_(item, ['Sweetness(스윗니스) ×2','Sweetness(스윗니스)','Sweetness']),
      mouthfeel: itemBestScore_(item, ['Mouthfeel(마우스필) ×2','Mouthfeel(마우스필)','Mouthfeel'])
    };
  }
  if (code === 'MOC' || code === 'KTCC') return { time:itemEndTimeSeconds_(item) };
  if (code === 'MOB') {
    const c = mobComponentsFromItem_(item);
    return { sensory: c.sensory, technical: c.tech, creative: c.creative, time: c.time };
  }
  if (code === 'KCAC') {
    if (r === '결선') {
      return {
        sensory:itemScoreSum_(item, ['결선 Taste Balance(맛의 균형)','결선 Mouthfeel(질감)','Taste Balance(맛의 균형)','Mouthfeel(질감)','Mouthfeel(질감과 촉감)']),
        presentation:itemScoreSum_(item, ['결선 Presentation(프레젠테이션)','Presentation(프레젠테이션)']),
        patternCompletion:itemBestScore_(item, ['결선 Design Completion(디자인 완성도)','Design Completion(디자인 완성도)','패턴완성도','Pattern Completion']),
        time:itemEndTimeSeconds_(item)
      };
    }
    return {
      completion:itemScoreSum_(item, ['예선 Pattern Completion(패턴 완성도)','Pattern Completion(패턴 완성도)']),
      balance:itemScoreSum_(item, ['예선 Pattern Symmetry & Balance(대칭과 균형)','Pattern Symmetry & Balance(대칭과 균형)','예선 Pattern Balance(패턴 균형)','Pattern Balance(패턴 균형)']),
      time:itemEndTimeSeconds_(item)
    };
  }
  if (code === 'KBC') {
    return {
      espresso:kbcEspressoTotalFromItem_(item),
      signature:kbcSignatureTotalFromItem_(item),
      presentation:itemBestScore_(item, ['Service Professionalism(서비스의 전문성)','Presentation & Service(프레젠테이션과 서비스 전문성)','Presentation & Service','프레젠테이션과 서비스 전문성']),
      machine:itemBestScore_(item, ['Machine & Equipment Professionalism(머신 및 기물 운용 전문성)'])
    };
  }
  return { time:itemEndTimeSeconds_(item) };
}
function compareTie_(code, a, b, round) {
  code = safeStr(code).toUpperCase();
  const r = roundName_(round);
  const order = {
    KCR:[['sweetness','desc'],['overall','desc']],
    IKRC:[['flavor','desc'],['sweetness','desc'],['mouthfeel','desc']],
    MOC:[['time','asc']], KTCC:[['time','asc']],
    MOB: r === '예선' ? [['sensory','desc'],['technical','desc'],['time','asc']] : [['sensory','desc'],['technical','desc'],['creative','desc'],['time','asc']],
    KCAC: r === '결선' ? [['sensory','desc'],['presentation','desc'],['patternCompletion','desc'],['time','asc']] : [['completion','desc'],['balance','desc'],['time','asc']],
    KBC:[['espresso','desc']]
  }[code] || [['time','asc']];
  for (const [key, dir] of order) {
    const av = Number(a.tie && a.tie[key] || 0), bv = Number(b.tie && b.tie[key] || 0);
    if (av === bv) continue;
    return dir === 'asc' ? av - bv : bv - av;
  }
  return 0;
}
function tieRuleLabel_(code, round) {
  code = safeStr(code).toUpperCase();
  const r = roundName_(round);
  if (code === 'KCR') return '총점 → Sweetness → Overall → 재심사';
  if (code === 'IKRC') return '총점 → Flavor → Sweetness → Mouthfeel';
  if (code === 'MOC' || code === 'KTCC') return '총점 → 종료시간 짧은 순';
  if (code === 'MOB') return r === '예선' ? '총점 → 센서리 → 테크니컬 → 경기시간' : '총점 → 센서리 → 테크니컬 → 창작메뉴 → 경기시간';
  if (code === 'KCAC') return r === '결선' ? '총점 → 센서리 합산 → 프레젠테이션 → 패턴 완성도 → 경기시간' : '총점 → 패턴 완성도 합산 → 패턴 균형 합산 → 경기시간';
  if (code === 'KBC') return '총점 → 에스프레소 합산 평균';
  return '';
}

function avgList_(list) {
  const nums = (list || []).map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((a,b)=>a+b,0) / nums.length : 0;
}

function kcacItemPurposeText_(item) {
  return safeStr((item && (item['잔용도'] || item['컵용도'] || item['평가용도'] || item.purpose || item['우유종류'] || item['우유명'] || '')) || '');
}
function kcacIsPatternItem_(item) {
  const t = kcacItemPurposeText_(item) + ' ' + safeStr(item && (item['패턴종류'] || item.patternType || ''));
  if (/창작패턴|패턴평가|final-pattern|pattern/i.test(t)) return true;
  return itemHasAnyScore_(item, ['결선 Theme Expression(주제 표현력)','결선 Design Completion(디자인 완성도)','결선 Technical Execution(작업 수행 완성도)','결선 Cleanliness(청결)']);
}
function kcacIsSensoryItem_(item) {
  const t = kcacItemPurposeText_(item);
  if (/센서리|sensory/i.test(t)) return true;
  return itemHasAnyScore_(item, ['결선 Taste Balance(맛의 균형)','결선 Mouthfeel(질감)','결선 Presentation(프레젠테이션)']);
}
function kcacSubmissionGroups_(rows) {
  const map = new Map();
  (rows || []).forEach(item => {
    const key = safeStr(item && (item.scoreRowId || item._scoreId || item.rowIndex)) || Math.random().toString(36).slice(2);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return Array.from(map.values());
}
function kcacAggregateSubmission_(items, round) {
  const r = roundName_(round);
  let total = 0, patternTotal = 0, sensoryTotal = 0;
  let completion = 0, balance = 0, sensory = 0, presentation = 0, patternCompletion = 0;
  let hasPattern = false, hasSensory = false;
  const times = [];
  (items || []).forEach(item => {
    const n = toNumber(item && (item['총점'] ?? item['최종점수'] ?? item.totalScore));
    if (n !== null) total += n;
    const t = itemEndTimeSeconds_(item); if (t !== 999999) times.push(t);
    if (r === '결선') {
      const isPattern = kcacIsPatternItem_(item);
      const isSensory = kcacIsSensoryItem_(item);
      if (isPattern) {
        hasPattern = true;
        if (n !== null) patternTotal += n;
        patternCompletion += itemBestScore_(item, ['결선 Design Completion(디자인 완성도)','Design Completion(디자인 완성도)','패턴완성도','Pattern Completion']);
      }
      if (isSensory) {
        hasSensory = true;
        if (n !== null) sensoryTotal += n;
        sensory += itemScoreSum_(item, ['결선 Taste Balance(맛의 균형)','결선 Mouthfeel(질감)','Taste Balance(맛의 균형)','Mouthfeel(질감)','Mouthfeel(질감과 촉감)']);
        presentation += itemScoreSum_(item, ['결선 Presentation(프레젠테이션)','Presentation(프레젠테이션)']);
      }
    } else {
      completion += itemScoreSum_(item, ['예선 Pattern Completion(패턴 완성도)','Pattern Completion(패턴 완성도)']);
      balance += itemScoreSum_(item, ['예선 Pattern Symmetry & Balance(대칭과 균형)','Pattern Symmetry & Balance(대칭과 균형)','예선 Pattern Balance(패턴 균형)','Pattern Balance(패턴 균형)']);
    }
  });
  return { total:roundScoreValue_(total), patternTotal:roundScoreValue_(patternTotal), sensoryTotal:roundScoreValue_(sensoryTotal), completion, balance, sensory, presentation, patternCompletion, hasPattern, hasSensory, time:times.length ? Math.min(...times) : 999999 };
}
function avgFinite_(values) {
  const nums = (values || []).map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((a,b)=>a+b,0) / nums.length : 0;
}

const MOB_TECH_KEYS_ = ['Pre-Service Station(시연 전 작업대)','Service Station(시연 중 작업대)','Post-Service Station(시연 후 작업대)','Signature Technical Pre-Service Station(창작음료 시연 전 작업대)','Signature Technical Service Station(창작음료 시연 중 작업대)','Signature Technical Ingredient Use(부재료 사용의 적절함)','Signature Technical Post-Service Station(창작음료 시연 후 작업대)'];
const MOB_SENS_KEYS_ = ['Sweetness(스윗니스)','Flavor(플레이버)','Balance(균형)','Clean Cup(클린컵)','Mouthfeel(질감)','Professionalism(시연 전문성)'];
const MOB_CREATIVE_KEYS_ = ['Creative Form & Usability(형태와 용이성)','Creative Flavor(창작 향미)','Creative Balance(균형)','Creative Mouthfeel(질감)','Creative Professionalism(전문성과 독창성)'];
function mobComponentsFromItem_(item) {
  const disqualified = !!(item && (item.disqualified || item['실격여부'] === 'Y'));
  const tech = disqualified ? 0 : itemScoreSum_(item, MOB_TECH_KEYS_);
  const sensory = disqualified ? 0 : itemScoreSum_(item, MOB_SENS_KEYS_);
  const creative = disqualified ? 0 : itemScoreSum_(item, MOB_CREATIVE_KEYS_);
  const penalty = disqualified ? 0 : mobPenaltyValue_(itemScore_(item, ['시간감점','Time Penalty']));
  const role = safeStr(item && (item['역할'] || item['Role'] || item['JudgeRole'] || item['심사역할'] || item['심사위원역할'] || item.role || item.judgeRole || item._col5));
  const techRole = /테크|기술|technical|tech\b|\btech|technical\s*judge|t\s*judge|\bT[0-9]?\b/i.test(role) && !/센서|감각|sensory|sensor|sens\b|\bsens|s\s*judge|\bS[0-9]?\b/i.test(role);
  const sensoryRole = /센서|감각|sensory|sensor|sens\b|\bsens|s\s*judge|\bS[0-9]?\b/i.test(role) && !/테크|기술|technical|tech\b|\btech|technical\s*judge|t\s*judge|\bT[0-9]?\b/i.test(role);
  const hasTech = disqualified ? false : (techRole ? true : (sensoryRole ? false : tech > 0));
  const hasSensory = disqualified ? false : (sensoryRole ? true : (techRole ? false : sensory > 0));
  const hasCreative = disqualified ? false : (sensoryRole ? creative > 0 : (techRole ? false : creative > 0));
  return { tech, sensory, creative, penalty, hasTech, hasSensory, hasCreative, time: itemEndTimeSeconds_(item), disqualified };
}
function aggregateRankingGroup_(code, g, round) {
  code = safeStr(code).toUpperCase();
  const rows = g.rows || [];
  if (code === 'KCAC') {
    const r = roundName_(round);
    const submissionAggs = kcacSubmissionGroups_(rows).map(items => kcacAggregateSubmission_(items, r));
    if (r === '결선') {
      const patternAggs = submissionAggs.filter(x => x.hasPattern);
      const sensoryAggs = submissionAggs.filter(x => x.hasSensory);
      const patternTotal = avgFinite_(patternAggs.map(x => x.patternTotal));
      const sensoryTotal = avgFinite_(sensoryAggs.map(x => x.sensoryTotal));
      const score = roundScoreValue_(patternTotal + sensoryTotal);
      return {
        score, total:score, basis:'결선 영역별 평균 합산',
        tie:{
          sensory: roundScoreValue_(avgFinite_(sensoryAggs.map(x => x.sensory))),
          presentation: roundScoreValue_(avgFinite_(sensoryAggs.map(x => x.presentation))),
          patternCompletion: roundScoreValue_(avgFinite_(patternAggs.map(x => x.patternCompletion))),
          time: submissionAggs.reduce((m,x)=>Math.min(m, x.time || 999999), 999999)
        }
      };
    }
    const score = roundScoreValue_(avgFinite_(submissionAggs.map(x => x.total)));
    return {
      score, total:score, basis: submissionAggs.length > 1 ? '심사위원별 2잔 합산 평균' : '2잔 합산점수',
      tie:{
        completion: roundScoreValue_(avgFinite_(submissionAggs.map(x => x.completion))),
        balance: roundScoreValue_(avgFinite_(submissionAggs.map(x => x.balance))),
        time: submissionAggs.reduce((m,x)=>Math.min(m, x.time || 999999), 999999)
      }
    };
  }
  if (code === 'MOB') {
    const tech = [], sensory = [], creative = [], penalties = [], times = [];
    rows.forEach(item => {
      const c = mobComponentsFromItem_(item);
      if (c.time !== 999999) times.push(c.time);
      if (c.disqualified) return;
      if (c.hasTech) tech.push(c.tech);
      if (c.hasSensory) sensory.push(c.sensory);
      if (c.hasCreative) creative.push(c.creative);
      if (c.penalty) penalties.push(c.penalty);
    });
    if (g.dq) {
      return {
        score: 0,
        total: 0,
        basis: '실격',
        tie: { sensory: avgList_(sensory), technical: avgList_(tech), creative: avgList_(creative), time: times.length ? Math.min(...times) : 999999 }
      };
    }
    if (tech.length || sensory.length || creative.length) {
      const score = Math.max(0, avgList_(tech) + avgList_(sensory) + avgList_(creative) - (penalties.length ? Math.max(...penalties) : 0));
      return {
        score: Math.round(score * 1000) / 1000,
        total: Math.round(score * 1000) / 1000,
        basis: '카테고리별 평균 합산',
        tie: { sensory: avgList_(sensory), technical: avgList_(tech), creative: avgList_(creative), time: times.length ? Math.min(...times) : 999999 }
      };
    }
  }
  const avg = g.totalCount ? Math.round((g.totalSum / g.totalCount) * 1000) / 1000 : 0;
  Object.keys(g.tieCounts || {}).forEach(k => {
    if (k !== 'time' && g.tieCounts[k]) g.tie[k] = Math.round((g.tie[k] / g.tieCounts[k]) * 1000) / 1000;
  });
  return { score: avg, total: Math.round(g.totalSum * 1000) / 1000, basis: g.totalCount > 1 ? '심사위원 평균점수' : '총점', tie: g.tie };
}
async function buildRankingData_(env, competitionCode) {
  const code = safeStr(competitionCode).toUpperCase();
  const cfg = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind(code).first();
  const rowsRaw = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id ASC').bind(code).all();
  const raw = rowsRaw.results || [];
  const headers = mergeHeaders(code, raw);
  const participantRowsRaw = await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY id ASC').bind(code).all();
  const participantIdx = indexParticipantIdentities_(participantRowsRaw.results || [], code);
  const ikrcSeedMap = code === 'IKRC' ? await loadIkrcSeedResultMap_(env) : null;
  const converted = raw.flatMap(r => rowToReviewItems_(r, code, headers, cfg && cfg.current_round).map(item => {
    const round = roundName_(item.round || item['라운드'] || (cfg && cfg.current_round));
    const identity = lookupParticipantIdentity_(participantIdx, round, itemNumber_(item) || item.unit);
    item = enrichReviewItemWithParticipant_(item, identity, code);
    if (code === 'IKRC') item = applyIkrcSeedBonusToItem_(item, ikrcSeedMap);
    return item;
  }));
  const groups = new Map();
  converted.forEach(item => {
    if (!shouldCountItemInRanking_(code, item)) return;
    const round = roundName_(item.round || item['라운드'] || (cfg && cfg.current_round));
    const unit = itemNumber_(item) || String(item.rowIndex);
    const key = round + '::' + unit;
    if (!groups.has(key)) groups.set(key, { round, unit, rows:[], totalSum:0, totalCount:0, reviewed:0, dq:false, reasons:[], tie:{}, tieCounts:{} });
    const g = groups.get(key);
    g.rows.push(item);
    const total = toNumber(item['총점'] ?? item['최종점수'] ?? item.totalScore);
    if (total !== null) { g.totalSum += total; g.totalCount++; }
    if (reviewCompletedStatus_(item['검수상태'])) g.reviewed++;
    if (item.disqualified || item['실격여부'] === 'Y') { g.dq = true; if (item['실격사유']) g.reasons.push(item['실격사유']); }
    const tie = tieInfoForItem_(code, item, round);
    Object.keys(tie).forEach(k => {
      const tv = Number(tie[k]);
      if (k === 'time') g.tie[k] = Math.min(g.tie[k] == null ? 999999 : g.tie[k], tv || 999999);
      else if (Number.isFinite(tv)) { g.tie[k] = (g.tie[k] || 0) + tv; g.tieCounts[k] = (g.tieCounts[k] || 0) + 1; }
    });
    if (!g.name) g.name = item.participantName || item['선수명'] || item['참가자명'] || item['팀명'] || '';
    if (!g.affiliation) g.affiliation = item.participantAffiliation || item['소속'] || '';
    if (!g.teamName) g.teamName = item.participantTeamName || item['팀명'] || '';
    if (!g.team) g.team = item.team || item['팀'] || '';
  });
  const byRound = {};
  Array.from(groups.values()).forEach(g => {
    const agg = aggregateRankingGroup_(code, g, g.round);
    g.avgScore = agg.score;
    g.totalScore = agg.total;
    g.scoreBasis = agg.basis;
    g.tie = agg.tie || g.tie;
    if (!byRound[g.round]) byRound[g.round] = [];
    byRound[g.round].push(g);
  });
  const ranking = [];
  Object.keys(byRound).forEach(round => {
    const list = byRound[round];
    list.sort((a,b) => {
      if (a.dq !== b.dq) return a.dq ? 1 : -1;
      const scoreA = a.avgScore, scoreB = b.avgScore;
      if (scoreA !== scoreB) return scoreB - scoreA;
      const t = compareTie_(code, a, b, round); if (t !== 0) return t;
      return String(a.unit).localeCompare(String(b.unit), 'ko');
    });
    list.forEach((g, idx) => ranking.push({
      rank: g.dq ? '실격' : idx + 1,
      totalInRound: list.length,
      unit: g.unit, unitDisplay: g.unit, round,
      playerNameSummary: g.name || '', nameSummary: g.name || '', playerAffiliationSummary: g.affiliation || '', teamNameSummary: g.teamName || '', teamSummary: g.team || '',
      totalScore: g.avgScore, avgScore: g.avgScore, score: g.avgScore, rankingScore: g.avgScore,
      scoreBasis: g.scoreBasis || (g.totalCount > 1 ? '심사위원 평균점수' : '총점'),
      reviewedCount: g.reviewed, totalCount: g.rows.length,
      disqualified: !!g.dq, disqualificationReason: Array.from(new Set(g.reasons)).join(' / '),
      tieBreakRule: tieRuleLabel_(code, round), tie: g.tie,
      judgeCount: g.rows.length
    }));
  });
  return { cfg, headers, rows: converted, ranking };
}
async function getRanking(env, competitionCode, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const auth = await requireManageActorForCode_(env, actorArg, code, '순위 조회 권한이 없습니다. 관리자 또는 대회팀장 권한으로 로그인해주세요.');
  if (!auth.ok) return auth.res;
  const data = await buildRankingData_(env, code);
  return { success: true, compCode: code, compName: data.cfg ? data.cfg.name : code, currentRound: data.cfg ? data.cfg.current_round : '', unitLabel: code === 'KTCC' ? '팀번호' : '참가자번호', ranking: data.ranking, tieBreakRule: tieRuleLabel_(code, data.cfg ? data.cfg.current_round : '') };
}
async function getRankingDetail(env, competitionCode, unit, round, actorArg) {
  const code = safeStr(competitionCode).toUpperCase(); const targetUnit = safeStr(unit); const targetRound = roundName_(round, '');
  if (!code || !targetUnit) return { success: false, message: '상세 조회할 대회코드 또는 참가자번호가 없습니다.' };
  const auth = await requireManageActorForCode_(env, actorArg, code, '순위 상세 조회 권한이 없습니다. 관리자 또는 대회팀장 권한으로 로그인해주세요.');
  if (!auth.ok) return auth.res;
  const data = await buildRankingData_(env, code);
  const rows = data.rows.filter(item => { const sameUnit = itemNumber_(item) === targetUnit; const itemRound = roundName_(item.round || item['라운드'], targetRound); const sameRound = !targetRound || !itemRound || itemRound === targetRound; return sameUnit && sameRound; });
  const rankInfo = data.ranking.find(r => safeStr(r.unit) === targetUnit && (!targetRound || roundName_(r.round) === targetRound)) || null;
  let totalScore = 0, count = 0, reviewedCount = 0, disqualified = false; const reasons = [];
  rows.forEach(item => { const n = toNumber(item['총점'] ?? item['최종점수'] ?? item.totalScore); if (n !== null) { totalScore += n; count++; } if (reviewCompletedStatus_(item['검수상태'])) reviewedCount++; if (item.disqualified || item['실격여부'] === 'Y') { disqualified = true; if (item['실격사유']) reasons.push(item['실격사유']); } });
  totalScore = Math.round(totalScore * 100) / 100;
  const rankingTotal = rankInfo && rankInfo.totalScore !== undefined && rankInfo.totalScore !== null ? Number(rankInfo.totalScore) : null;
  const displayTotal = Number.isFinite(rankingTotal) ? rankingTotal : totalScore;
  const displayAvg = Number.isFinite(rankingTotal) ? rankingTotal : (count ? Math.round((totalScore / count) * 100) / 100 : 0);
  return { success: true, compCode: code, compName: data.cfg ? data.cfg.name : (COMPETITION_NAMES[code] || code), unitLabel: code === 'KTCC' ? '팀번호' : '참가자번호', unit: targetUnit, unitDisplay: targetUnit, round: targetRound, headers: data.headers, rows, scores: rows, totalScore: displayTotal, avgScore: displayAvg, rankInfo, rankInfos: rankInfo ? [rankInfo] : [], disqualified: disqualified || (rankInfo && rankInfo.disqualified) || false, disqualificationReason: reasons.join(' / ') || (rankInfo && rankInfo.disqualificationReason) || '', reviewedCount, totalCount: rows.length, playerNameSummary: (rankInfo && (rankInfo.playerNameSummary || rankInfo.nameSummary)) || (rows[0] && rows[0].participantName) || '', playerAffiliationSummary: (rankInfo && rankInfo.playerAffiliationSummary) || (rows[0] && rows[0].participantAffiliation) || '' };
}


async function sendOTP(env, name, phone, competitionCode, request = null) {
  name = safeStr(name); phone = normalizePhone(phone); const code = safeStr(competitionCode).toUpperCase();
  if (!name || !phone || !code) return { success: false, message: '대회, 이름, 연락처를 입력해주세요.' };
  const phoneLimit = await rateLimit_(env, 'otp-send:' + code + ':' + await sha256Hex_(phone), 5, 10 * 60);
  if (!phoneLimit.ok) return { success: false, message: '인증 요청이 많습니다. 10분 후 다시 시도해주세요.' };
  const ipLimit = await rateLimit_(env, 'otp-send-ip:' + await sha256Hex_(clientIp_(request) || 'unknown'), 30, 10 * 60);
  if (!ipLimit.ok) return { success: false, message: '인증 요청이 많습니다. 잠시 후 다시 시도해주세요.' };
  const pRows = await env.DB.prepare(`SELECT * FROM participants WHERE competition_code=? AND phone=? AND (name=? OR team_name=? OR extra_json LIKE ?) ORDER BY id LIMIT 3`)
    .bind(code, phone, name, name, `%${name}%`).all();
  if (!(pRows.results || []).length) return { success: false, message: '등록된 선수 정보를 찾지 못했습니다. 이름과 연락처, 선택한 대회를 확인해주세요.' };

  // 최근 60초 내 과도한 재요청 방지
  const latest = await env.DB.prepare(`SELECT created_at FROM otps WHERE competition_code=? AND name=? AND phone=? ORDER BY id DESC LIMIT 1`)
    .bind(code, name, phone).first();
  if (latest && Date.now() - Date.parse(latest.created_at) < 60 * 1000 && safeStr(env.KCL_ALLOW_FAST_OTP).toLowerCase() !== 'true') {
    return { success: false, message: '인증번호는 1분 후 다시 요청할 수 있습니다.' };
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO otps (competition_code, name, phone, otp, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(code, name, phone, otp, expires, nowIso()).run();

  const text = smsTemplate_(env, code, otp);
  const smsRes = await sendSms_(env, phone, text, { competition_code: code, recipient_name: name, purpose: 'otp' });
  if (!smsRes.success && !smsRes.devMode) {
    return { success: false, message: '인증번호 문자 발송에 실패했습니다. 운영팀에 문의해주세요. (' + (smsRes.message || 'SMS_ERROR') + ')' };
  }

  return {
    success: true,
    message: smsRes.devMode ? '개발 모드 인증번호: ' + otp : '인증번호를 발송했습니다.',
    maskedPhone: maskPhone_(phone),
    provider: smsRes.provider || 'dev',
    devOtp: smsRes.devMode ? otp : undefined
  };
}

function smsProvider_(env) {
  return safeStr(env.SMS_PROVIDER || env.KCL_SMS_PROVIDER).toLowerCase();
}
function smsTemplate_(env, code, otp) {
  const tpl = safeStr(env.KCL_OTP_SMS_TEMPLATE);
  if (tpl) return tpl.replace(/\{code\}/g, code).replace(/\{otp\}/g, otp);
  return `[KCL] ${code} 디브리핑 인증번호는 ${otp}입니다. 5분 안에 입력해주세요.`;
}
async function sendTestSMS(env, phone, actorArg, request = null) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success: false, message: 'SMS 테스트는 전체 관리자 권한이 필요합니다.' };
  phone = normalizePhone(phone);
  if (!phone) return { success: false, message: '테스트 받을 휴대폰 번호를 입력해주세요.' };
  const lim = await rateLimit_(env, 'sms-test:' + await sha256Hex_((actor.phone || '') + ':' + phone + ':' + clientIp_(request)), 10, 10 * 60);
  if (!lim.ok) return { success: false, message: 'SMS 테스트 요청이 많습니다. 10분 후 다시 시도해주세요.' };
  const text = `[KCL] SMS 연동 테스트입니다. ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
  const res = await sendSms_(env, phone, text, { competition_code: 'ALL', recipient_name: actor.name || actor.judgeName || '관리자', purpose: 'test' });
  if (!res.success) return { success: false, message: res.devMode ? 'SMS 환경변수가 없어 개발 모드입니다. Cloudflare 환경변수를 설정해주세요.' : ('SMS 발송 실패: ' + (res.message || 'SMS_ERROR')), detail: res };
  return { success: true, message: '테스트 문자를 발송했습니다.', provider: res.provider, detail: res.safeDetail || null };
}

async function refreshAdminActor(env, actorArg) {
  let actor = await getActor(env, actorArg);
  if (!actor) actor = await actorFromIdentityFallback_(env, actorArg);
  if (!actor) return { success: false, message: '로그인 정보가 없습니다. 다시 로그인해주세요.' };
  // Always return a usable token to the browser after refresh. This prevents
  // /admin/ -> /assessment/?admin=1 transitions from losing admin authority
  // when the stored browser object was hydrated from an older session payload.
  if (!safeStr(actor.judgeToken || '')) {
    actor.judgeToken = await issueSession(env, 'judge', actor, 21600);
  }
  return { success: true, actor };
}

async function getSystemStatus(env, actorArg) {
  let actor = await getActor(env, actorArg);
  if (!actor) actor = await actorFromIdentityFallback_(env, actorArg);
  if (!hasManageAccess(actor, 'KBC') && !hasAdmin(actor)) return { success: false, message: '관리 권한이 필요합니다.' };
  const provider = smsProvider_(env) || 'dev';
  return {
    success: true,
    version: '1.0ver-security-stage29-option-a-report-final',
    pdfMode: 'browser-print',
    smsProvider: provider,
    smsReady: provider === 'solapi' ? !!(env.SOLAPI_API_KEY && env.SOLAPI_API_SECRET && env.SOLAPI_FROM) : false,
    smsFromMasked: env.SOLAPI_FROM ? maskPhone_(env.SOLAPI_FROM) : '',
    note: provider === 'solapi' ? 'SOLAPI 환경변수로 실발송 모드가 켜집니다.' : 'SMS_PROVIDER 미설정 시 인증번호는 개발 모드로 화면에 표시됩니다.'
  };
}
async function sendSms_(env, to, text, meta = {}) {
  const provider = smsProvider_(env);
  const phone = normalizePhone(to);
  if (!provider) {
    await logSms_(env, { provider: 'dev', phone, text, status: 'DEV', response: { devMode: true }, ...meta });
    return { success: true, devMode: true, provider: 'dev' };
  }
  if (provider !== 'solapi') {
    await logSms_(env, { provider, phone, text, status: 'UNSUPPORTED', response: { provider }, ...meta });
    return { success: false, provider, message: '지원하지 않는 SMS_PROVIDER입니다. 현재 지원: solapi' };
  }
  return sendSolapiSms_(env, phone, text, meta);
}
async function sendSolapiSms_(env, to, text, meta = {}) {
  const apiKey = safeStr(env.SOLAPI_API_KEY);
  const apiSecret = safeStr(env.SOLAPI_API_SECRET);
  const from = normalizePhone(env.SOLAPI_FROM || env.SMS_FROM);
  if (!apiKey || !apiSecret || !from) {
    await logSms_(env, { provider: 'solapi', phone: to, text, status: 'CONFIG_ERROR', response: { missing: true }, ...meta });
    return { success: false, provider: 'solapi', message: 'SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_FROM 환경변수를 확인해주세요.' };
  }
  const endpoint = 'https://api.solapi.com/messages/v4/send-many/detail';
  const body = {
    messages: [{ to, from, text, autoTypeDetect: true }]
  };
  const auth = await solapiAuthHeader_(apiKey, apiSecret);
  let payload = null;
  let ok = false;
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const raw = await resp.text();
    payload = parseJson(raw, { raw });
    ok = resp.ok;
    await logSms_(env, { provider: 'solapi', phone: to, text, status: ok ? 'SENT' : 'FAILED', response: payload, ...meta });
    if (!ok) return { success: false, provider: 'solapi', message: payload && (payload.message || payload.errorMessage || payload.errorCode) || ('HTTP ' + resp.status), safeDetail: payload };
    return { success: true, provider: 'solapi', safeDetail: payload };
  } catch (err) {
    await logSms_(env, { provider: 'solapi', phone: to, text, status: 'ERROR', response: { error: String(err && err.message ? err.message : err) }, ...meta });
    return { success: false, provider: 'solapi', message: String(err && err.message ? err.message : err) };
  }
}
async function solapiAuthHeader_(apiKey, apiSecret) {
  const dateTime = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const signature = await hmacSha256Hex_(apiSecret, dateTime + salt);
  return `HMAC-SHA256 apiKey=${apiKey}, date=${dateTime}, salt=${salt}, signature=${signature}`;
}
async function hmacSha256Hex_(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function logSms_(env, data) {
  try {
    await env.DB.prepare(`INSERT INTO sms_logs (provider, competition_code, recipient_name, phone, purpose, status, message, response_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        safeStr(data.provider), safeStr(data.competition_code), safeStr(data.recipient_name), normalizePhone(data.phone), safeStr(data.purpose || 'otp'),
        safeStr(data.status), safeStr(data.text), JSON.stringify(data.response || {}), nowIso()
      ).run();
  } catch (e) {}
}
async function sha256Hex_(text) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(String(text || '')));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function rateLimit_(env, key, limit, windowSeconds) {
  try {
    const now = Date.now();
    const nowText = new Date(now).toISOString();
    const resetAt = new Date(now + windowSeconds * 1000).toISOString();
    const row = await env.DB.prepare('SELECT key, count, reset_at FROM rate_limits WHERE key=?').bind(key).first();
    if (!row || Date.parse(row.reset_at) <= now) {
      await env.DB.prepare('INSERT OR REPLACE INTO rate_limits (key, count, reset_at, updated_at) VALUES (?, 1, ?, ?)').bind(key, resetAt, nowText).run();
      return { ok: true, remaining: Math.max(0, limit - 1) };
    }
    const count = Number(row.count || 0);
    if (count >= limit) return { ok: false, remaining: 0, resetAt: row.reset_at };
    await env.DB.prepare('UPDATE rate_limits SET count=?, updated_at=? WHERE key=?').bind(count + 1, nowText, key).run();
    return { ok: true, remaining: Math.max(0, limit - count - 1) };
  } catch (_) {
    return { ok: true, remaining: limit };
  }
}
function maskPhone_(phone) { phone = normalizePhone(phone); return phone.length >= 7 ? phone.slice(0,3) + '-****-' + phone.slice(-4) : phone; }
function participantIdentifiers_(p) {
  const list = [p.final_cup_no, p.main_cup_no, p.prelim_cup_no, p.cup_no, p.sample_no, p.team_no, p.unique_no, String(p.id || '')]
    .map(safeStr).filter(Boolean);
  return Array.from(new Set(list));
}
async function verifyOTP(env, name, phone, competitionCode, otp, request = null) {
  name = safeStr(name); phone = normalizePhone(phone); const code = safeStr(competitionCode).toUpperCase();
  const verifyLimit = await rateLimit_(env, 'otp-verify:' + code + ':' + await sha256Hex_(phone), 10, 10 * 60);
  if (!verifyLimit.ok) return { success: false, message: '인증번호 확인 시도가 많습니다. 10분 후 다시 시도해주세요.' };
  const row = await env.DB.prepare(`SELECT * FROM otps WHERE competition_code=? AND name=? AND phone=? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1`)
    .bind(code, name, phone, nowIso()).first();
  if (!row) return { success: false, message: '유효한 인증번호가 없습니다.' };
  if (safeStr(row.otp) !== safeStr(otp)) return { success: false, message: '인증번호가 일치하지 않습니다.' };
  await env.DB.prepare('UPDATE otps SET used_at=? WHERE id=?').bind(nowIso(), row.id).run();
  const cfg = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind(code).first();
  if (cfg && !cfg.debriefing && safeStr(env.KCL_BYPASS_DEBRIEF_LOCK).toLowerCase() !== 'true') {
    return { success: false, message: '아직 디브리핑 공개 전입니다. 운영팀의 공개 이후 다시 확인해주세요.' };
  }
  const pr = await env.DB.prepare(`SELECT * FROM participants WHERE competition_code=? AND phone=? AND (name=? OR team_name=? OR extra_json LIKE ?) ORDER BY id`)
    .bind(code, phone, name, name, `%${name}%`).all();
  const participants = pr.results || [];
  if (!participants.length) return { success: false, message: '등록된 선수 정보를 찾지 못했습니다.' };
  const ids = Array.from(new Set(participants.flatMap(participantIdentifiers_))).filter(Boolean);
  let scoreRows = [];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const rs = await env.DB.prepare(`SELECT * FROM scores WHERE competition_code=? AND REPLACE(review_status, ' ', '') IN ('검수완료','수정완료') AND unit IN (${placeholders}) ORDER BY id`).bind(code, ...ids).all();
    scoreRows = rs.results || [];
  }
  if (!scoreRows.length && ids.length) {
    const likeConds = ids.map(() => 'payload_json LIKE ?').join(' OR ');
    const rs = await env.DB.prepare(`SELECT * FROM scores WHERE competition_code=? AND REPLACE(review_status, ' ', '') IN ('검수완료','수정완료') AND (${likeConds}) ORDER BY id`)
      .bind(code, ...ids.map(id => `%${id}%`)).all();
    scoreRows = rs.results || [];
  }
  if (!scoreRows.length) {
    const rs = await env.DB.prepare(`SELECT * FROM scores WHERE competition_code=? AND REPLACE(review_status, ' ', '') IN ('검수완료','수정완료') AND (participant_name=? OR payload_json LIKE ?) ORDER BY id`)
      .bind(code, name, `%${name}%`).all();
    scoreRows = rs.results || [];
  }
  const headers = mergeHeaders(code, scoreRows);
  const scoreItems = scoreRows.flatMap(r => rowToReviewItems_(r, code, headers, cfg && cfg.current_round));
  const rankingData = await buildRankingData_(env, code);
  const rankInfos = rankingData.ranking.filter(r => ids.includes(safeStr(r.unit)) || scoreItems.some(s => itemNumber_(s) === safeStr(r.unit)));
  const p0 = participants[0];
  const info = {
    name: p0.name || name,
    teamName: p0.team_name || '',
    teamNo: p0.team_no || '',
    affiliation: p0.affiliation || '',
    phone, maskedPhone: maskPhone_(phone),
    identifiers: ids
  };
  const token = await issueSession(env, 'debrief', { competition: code, name, phone, identifiers: ids }, 3600);
  return { success: true, competition: code, competitionCode: code, playerInfo: info, name, phone, maskedPhone: maskPhone_(phone), scores: scoreItems, headers, rankInfos, rankInfo: rankInfos[0] || null, debriefToken: token };
}

function _num(v) {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function _avg(list) {
  const nums = (list || []).map(_num).filter(n => n > 0);
  return nums.length ? nums.reduce((a,b)=>a+b,0) / nums.length : 0;
}
function _fmt(n) {
  n = _num(n);
  return n ? (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/,'') : '-';
}
function _tags(arr, max=4) {
  return Array.isArray(arr) ? arr.map(safeStr).filter(Boolean).slice(0,max) : [];
}
function _joinTags(arr, fallback='') {
  const t = _tags(arr, 4);
  return t.length ? t.join(', ') : fallback;
}
function _tone5(v) {
  v=_num(v);
  if (v>=4.6) return '매우 선명하고 완성도 높은';
  if (v>=4.1) return '뚜렷하고 안정적인';
  if (v>=3.5) return '안정적인';
  if (v>=3.0) return '기준을 충족하는';
  if (v>=2.0) return '보완 여지가 있는';
  return '개선이 필요한';
}
function _tone7(v) {
  v=_num(v);
  if (v>=5.8) return '매우 완성도 높은';
  if (v>=5.0) return '완성도 높은';
  if (v>=4.0) return '안정적인';
  if (v>=3.0) return '기준을 충족하는';
  if (v>=2.0) return '보완 여지가 있는';
  return '개선이 필요한';
}

function _result(comments) {
  return { success: true, comments: (comments || []).filter(Boolean).slice(0,3) };
}
function _scoreItems(list) {
  return (list || []).filter(x => x && _num(x.score) > 0);
}
function _lowHighScore(items) {
  const valid = _scoreItems(items).slice().sort((a,b) => _num(b.score) - _num(a.score));
  return { high: valid[0] || null, low: valid[valid.length - 1] || null };
}
function _joinWithComma(list, fallback='') {
  const arr = (list || []).map(v => safeStr(v)).filter(Boolean);
  return arr.length ? arr.join(', ') : fallback;
}
function _cleanTagText_(v) {
  let s = safeStr(v);
  if (!s) return '';
  return s
    .replace(/채소같은/g, '채소 같은')
    .replace(/과일같은/g, '과일 같은')
    .replace(/꽃같은/g, '꽃 같은')
    .replace(/발효된/g, '발효 계열')
    .replace(/\bfermented\b/ig, '발효 계열')
    .replace(/\bvegetal\b/ig, '채소 같은')
    .replace(/\bfloral\b/ig, '플로럴')
    .replace(/\bcitrus\b/ig, '시트러스')
    .replace(/\bsyrupy\b/ig, '시러피한')
    .replace(/\bclean\b/ig, '클린')
    .replace(/\bbright\b/ig, '밝은')
    .replace(/\bheavy\b/ig, '무게감 있는')
    .replace(/\blight\b/ig, '가벼운')
    .replace(/\s+/g, ' ')
    .trim();
}
function _tagList_(tags, key, max=3) {
  const raw = tags && tags[key];
  const arr = Array.isArray(raw) ? raw : (raw ? String(raw).split(/[,;\n]/) : []);
  return arr.map(_cleanTagText_).filter(Boolean).slice(0, max);
}
function _tagPhrase_(tags, key, fallback) {
  return _joinWithComma(_tagList_(tags, key, 3), fallback);
}
function _flatTagList_(obj, max=6) {
  const out = [];
  function add(v) {
    const s = _cleanTagText_(v);
    if (s && !out.includes(s)) out.push(s);
  }
  function walk(x) {
    if (!x) return;
    if (Array.isArray(x)) return x.forEach(add);
    if (typeof x === 'object') return Object.keys(x).forEach(k => walk(x[k]));
    String(x).split(/[,;\n]/).forEach(add);
  }
  walk(obj);
  return out.slice(0, max);
}
function _tagSummary_(tags, fallback) {
  return _joinWithComma(_flatTagList_(tags, 5), fallback);
}
function _toneByScore_(v, max=5) {
  v = _num(v);
  const ratio = max ? v / max : 0;
  if (ratio >= .88) return '매우 선명하고 완성도 높은';
  if (ratio >= .76) return '뚜렷하고 안정적인';
  if (ratio >= .64) return '안정적인';
  if (ratio >= .52) return '기준을 충족하는';
  if (ratio >= .38) return '보완 여지가 있는';
  return '개선이 필요한';
}
function _briefComments(text, max=2) {
  return safeStr(text).split(/\s*\/\s*/).map(safeStr).filter(Boolean).slice(0, max);
}
function _areaKorean_(name) {
  const s = safeStr(name);
  if (/Aftertaste/i.test(s)) return '애프터테이스트';
  if (/Acidity/i.test(s)) return '산미';
  if (/Body|Mouthfeel/i.test(s)) return /Mouthfeel/i.test(s) ? '마우스필' : '바디';
  if (/Sweetness/i.test(s)) return '단맛';
  if (/Clean/i.test(s)) return '클린컵';
  if (/Overall/i.test(s)) return '오버롤';
  if (/Flavor/i.test(s)) return '플레이버';
  return s || '평가 항목';
}
function _subjectParticle_(word) {
  const s = safeStr(word);
  if (!s) return '은';
  const ch = s.charCodeAt(s.length - 1);
  if (ch < 0xAC00 || ch > 0xD7A3) return '는';
  return ((ch - 0xAC00) % 28) ? '이' : '가';
}
function _topicParticle_(word) {
  const s = safeStr(word);
  if (!s) return '은';
  const ch = s.charCodeAt(s.length - 1);
  if (ch < 0xAC00 || ch > 0xD7A3) return '는';
  return ((ch - 0xAC00) % 28) ? '은' : '는';
}
function _strengthSentence_(items, highWord='가장 안정적으로 드러났고', lowWord='추가 보완 여지가 있습니다') {
  const hl = _lowHighScore(items);
  if (!hl.high) return '';
  const high = _areaKorean_(hl.high.name);
  const low = hl.low && hl.low !== hl.high ? _areaKorean_(hl.low.name) : '';
  if (!low) return `${high}${_subjectParticle_(high)} ${highWord}.`;
  return `${high}${_subjectParticle_(high)} ${highWord}, ${low}${_topicParticle_(low)} ${lowWord}.`;
}
function _optionSet(lines) {
  const uniq = [];
  (lines || []).forEach(s => {
    const line = safeStr(s).replace(/\s+/g,' ').replace(/\.\./g,'.').replace(/\s+([,.])/g,'$1').trim();
    if (line && !uniq.includes(line)) uniq.push(line);
  });
  return _result(uniq);
}

function generateCuppingComment(payload) {
  payload = payload || {};
  const tags = payload.tags || {};
  const cupNo = safeStr(payload.cupNumber || payload.cupNo || '');
  const process = safeStr(payload.process || '');
  const items = [
    {name:'Flavor', score:payload.flavor},
    {name:'Aftertaste', score:payload.aftertaste},
    {name:'Acidity', score:payload.acidity},
    {name:'Body', score:payload.body},
    {name:'Sweetness', score:payload.sweetness},
    {name:'Overall', score:payload.overall}
  ];
  const flavor = _tagPhrase_(tags, 'flavor', '주요 향미');
  const after = _tagPhrase_(tags, 'aftertaste', '여운');
  const acidity = _tagPhrase_(tags, 'acidity', '산미');
  const body = _tagPhrase_(tags, 'body', '질감');
  const sweet = _tagPhrase_(tags, 'sweetness', '단맛');
  const avg = _avg(items.map(x=>x.score));
  const hl = _lowHighScore(items);
  const high = hl.high ? _areaKorean_(hl.high.name) : '';
  const low = hl.low && hl.low !== hl.high ? _areaKorean_(hl.low.name) : '';
  const tone = avg >= 4 ? '향미 표현이 선명하게 드러난 컵' : (avg >= 3 ? '기본 향미 구조가 확인되는 컵' : '향미 구조의 불안정성이 함께 확인된 컵');
  const prefix = cupNo ? `${cupNo}번 컵은 ` : '해당 컵은 ';
  const processText = process ? `${process} 프로세스의 특성이 반영되어 ` : '';
  const axis = high && low ? `${high}이 가장 두드러졌고, ${low}은 상대적으로 낮게 평가되었습니다.` : '항목 간 편차는 크지 않게 나타났습니다.';
  return _optionSet([
    `${prefix}${processText}${flavor} 인상을 중심으로 첫 향미가 형성됩니다. 이후 ${after}의 흐름, ${acidity}의 산미 구조, ${body}의 질감이 연결되며 ${sweet} 인상이 전체 균형에 반영되었습니다. 전체적으로 ${tone}으로 평가됩니다.`,
    `${prefix}${flavor} 계열의 향미가 주요 인상으로 기록되었고, 애프터테이스트는 ${after} 방향으로 이어졌습니다. 산미는 ${acidity}, 바디는 ${body}, 단맛은 ${sweet} 특성으로 나타나 전체 컵의 구조를 구성했습니다. ${axis}`,
    `${prefix}향미, 여운, 산미, 질감, 단맛의 연결성을 기준으로 평가되었습니다. 현재 기록된 감각 단서는 ${flavor}, ${after}, ${sweet}이며, 종합 평가는 각 항목의 균형과 오버롤 인상에 따라 형성되었습니다.`
  ]);
}

function generateKbcComment(payload) {
  payload = payload || {};
  const presentation = _num(payload.presentationVal);
  const espressoVals = Array.isArray(payload.espressoVals) ? payload.espressoVals.map(_num) : [];
  const sigVals = Array.isArray(payload.sigVals) ? payload.sigVals.map(_num) : [];
  const machine = _num(payload.machineVal);
  const isMain = !!payload.isMain;
  const espressoAvg = _avg(espressoVals);
  const sigAvg = _avg(sigVals);
  const comments = _briefComments(payload.attributeComments, 2);
  const tagSummary = _tagSummary_(payload.tags, '선택된 수행 특성');
  const serviceText = presentation >= 5 ? '서비스의 전문성과 운영 흐름이 안정적으로 구축되었습니다' : presentation >= 3.5 ? '서비스 흐름은 기준 범위 안에서 진행되었고 설명과 동선의 밀도 차이가 함께 확인되었습니다' : '서비스의 전문성과 운영 안정성에서 낮은 평가가 확인되었습니다';
  const espressoText = espressoAvg >= 5 ? '에스프레소는 맛의 설계, 클린컵, 질감, 플레이버가 자연스럽게 연결되었습니다' : espressoAvg >= 4 ? '에스프레소는 전반적으로 안정적인 구조를 보였으며 향미와 균형이 주요 평가 요소로 작용했습니다' : '에스프레소는 추출 안정성, 향미 표현, 질감의 일관성에서 낮은 평가가 반영되었습니다';
  const sigText = !isMain ? '' : (sigAvg >= 5 ? '창작음료는 에스프레소와 부재료의 연결성이 분명하고 메뉴 설계 의도가 잘 드러났습니다' : sigAvg >= 4 ? '창작음료는 구성의 안정성이 확인되며 핵심 향미 포인트의 표현 정도가 평가에 반영되었습니다' : '창작음료는 의도 전달, 향미 균형, 질감 연결성에서 낮은 평가가 확인되었습니다');
  const machineText = machine >= 5 ? '장비 운용과 작업대 관리는 전체 수행의 완성도를 뒷받침했습니다' : machine >= 3.5 ? '장비 운용은 기준 범위 안에서 진행되었고 세부 동작과 작업대 정리 상태가 평가에 반영되었습니다' : '장비 운용과 작업대 관리에서는 낮은 평가가 확인되었습니다';
  return _optionSet([
    `${serviceText}. ${espressoText}. ${isMain ? sigText + '. ' : ''}${machineText}. 전체 평가는 음료 완성도와 서비스 전달 흐름을 함께 반영합니다.`,
    `이번 수행은 서비스 전달, 에스프레소 완성도${isMain ? ', 창작음료 설계' : ''}, 장비 운용의 연결성을 중심으로 평가되었습니다. 스마트태그 기준으로는 ${tagSummary}이 확인됩니다${comments.length ? ', 세부 코멘트에서는 ' + comments.join(' / ') + '가 함께 기록되었습니다.' : '.'}`,
    `항목별 평가는 추출 결과, 향미 설명, 서비스 동선이 실제 수행에서 어떻게 연결되었는지를 기준으로 형성되었습니다. ${isMain ? '창작음료는 콘셉트와 실제 향미의 일치도가 종합 인상에 반영되었습니다.' : '에스프레소의 향미 표현과 서비스 흐름이 종합 인상에 반영되었습니다.'}`
  ]);
}

function generateKcacComment(payload) {
  payload = payload || {};
  const scores = payload.scores || {};
  const smartTags = payload.smartTags || {};
  const type = safeStr(payload.type || '');
  const label = safeStr(payload.label || '해당 잔');
  const pattern = safeStr(payload.patternType || payload.pattern || '패턴');
  const milk = [safeStr(payload.milkType), safeStr(payload.milkProduct)].filter(Boolean).join(' ');
  const scoreItems = Object.keys(scores).map(k => ({name:k, score:scores[k]}));
  const avg = _avg(scoreItems.map(x=>x.score));
  const tagText = _tagSummary_(smartTags, '패턴과 표면, 위치 관련 특성');
  const isSensory = /sensory|맛|질감/i.test(type);
  const hl = _lowHighScore(scoreItems);
  const high = hl.high ? _areaKorean_(hl.high.name) : '';
  const low = hl.low && hl.low !== hl.high ? _areaKorean_(hl.low.name) : '';
  const balance = high && low ? `${high}이 가장 두드러졌고, ${low}은 상대적으로 낮게 평가되었습니다.` : '항목 간 편차는 크지 않게 기록되었습니다.';
  if (isSensory) {
    return _optionSet([
      `${label}은 ${milk ? milk + ' 조건에서 ' : ''}맛의 균형, 질감, 프레젠테이션의 연결성을 중심으로 평가되었습니다. 음료의 인상이 하나의 경험으로 이어지는지 여부가 주요 판단 기준으로 작용했으며, ${tagText}이 기록되었습니다.`,
      `센서리 관점에서는 맛의 균형과 촉감, 전달 방식이 함께 읽혔습니다. 전체 인상은 ${_toneByScore_(avg, 5)} 수준으로 확인되며, ${balance}`,
      `종합 평가는 맛의 중심축, 질감의 지속성, 프레젠테이션 전달 방식이 실제 음용 인상과 어떻게 연결되었는지를 반영합니다.`
    ]);
  }
  return _optionSet([
    `${label}은 ${milk ? milk + ' 조건에서 ' : ''}${pattern}의 완성도, 표면 품질, 위치와 비율을 중심으로 평가되었습니다. ${tagText}을 기준으로 볼 때 전체적인 시각 완성도는 ${_toneByScore_(avg, 5)} 편입니다.`,
    `패턴 평가는 중심축, 대칭, 리프 간격, 라인의 선명도와 표면 정리감을 기준으로 진행되었습니다. ${balance}`,
    `종합 평가는 패턴 대비, 표면 질감, 중심 위치, 재현성이 실제 제출물에서 어떻게 드러났는지를 반영합니다.`
  ]);
}

function generateMobComment(payload) {
  payload = payload || {};
  const menu = safeStr(payload.menu || '브루잉');
  const techAvg = _avg(payload.techVals || []);
  const sensAvg = _avg(payload.sensVals || []);
  const sigAvg = _avg(payload.sigVals || []);
  const comments = _briefComments(payload.attributeComments, 2);
  const tagSummary = _tagSummary_(payload.tags, '추출과 향미 특성');
  const isCreative = /창작|creative|signature/i.test(menu) || sigAvg > 0;
  const techText = techAvg ? `기술 수행은 ${_toneByScore_(techAvg, 7)} 수준으로 기록되었고, 준비 과정과 서비스 동선이 추출 결과에 반영되었습니다` : '기술 수행보다 센서리와 메뉴 설계 항목이 중심으로 평가되었습니다';
  const sensText = sensAvg ? `센서리 항목은 ${_toneByScore_(sensAvg, 7)} 흐름을 보이며, 단맛·플레이버·균형·클린컵·질감의 연결성이 평가에 반영되었습니다` : '센서리 항목은 제출 데이터 기준으로 별도 점수 흐름이 확인되지 않았습니다';
  const sigText = isCreative ? (sigAvg ? `창작 요소는 ${_toneByScore_(sigAvg, 7)} 완성도로 기록되며, 형태와 용이성, 향미, 균형, 전문성의 연결성이 함께 평가되었습니다` : '창작 메뉴는 설계 의도와 실제 향미의 연결성이 평가 기준으로 작용했습니다') : '기본 브루잉 메뉴에서는 추출 설계와 서비스 설명의 일관성이 평가 기준으로 작용했습니다';
  return _optionSet([
    `${menu} 평가는 추출 설계, 서비스 흐름, 향미 표현의 연결성을 중심으로 진행되었습니다. ${techText}. ${sensText}.`,
    `스마트태그 기준으로는 ${tagSummary}이 확인됩니다. ${sigText}. ${comments.length ? '세부 코멘트에서는 ' + comments.join(' / ') + '가 함께 기록되었습니다.' : '컵의 의도와 실제 인상이 종합 평가에 반영되었습니다.'}`,
    `종합 평가는 추출 일관성, 향미 균형, 설명의 명확성이 실제 수행과 컵의 결과에서 어떻게 드러났는지를 기준으로 형성되었습니다.`
  ]);
}

function generateIkrcComment(payload) {
  payload = payload || {};
  const scores = payload.scores || {};
  const intensities = payload.intensities || {};
  const tags = payload.tags || {};
  const sample = safeStr(payload.sampleNo || '');
  const items = [
    {name:'Flavor', score:scores.flavor},
    {name:'Clean Cup', score:scores.cleanCup},
    {name:'Sweetness', score:scores.sweetness},
    {name:'Acidity', score:scores.acidity},
    {name:'Mouthfeel', score:scores.mouthfeel}
  ];
  const flavor = _tagPhrase_(tags, 'flavor', '플레이버');
  const clean = _tagPhrase_(tags, 'cleanCup', '클린컵');
  const sweet = _tagPhrase_(tags, 'sweetness', '단맛');
  const acidity = _tagPhrase_(tags, 'acidity', '산미 구조');
  const mouthfeel = _tagPhrase_(tags, 'mouthfeel', '질감');
  const hl = _lowHighScore(items);
  const high = hl.high ? _areaKorean_(hl.high.name) : '';
  const low = hl.low && hl.low !== hl.high ? _areaKorean_(hl.low.name) : '';
  const axis = high && low ? `${high}이 가장 두드러졌고, ${low}은 상대적으로 낮게 평가되었습니다.` : '항목 간 편차는 크지 않게 기록되었습니다.';
  const prefix = sample ? `Sample ${sample}은 ` : '해당 샘플은 ';
  return _optionSet([
    `${prefix}${flavor} 계열의 향미가 첫인상을 형성하고, ${clean}한 인상이 컵의 완성도에 반영되었습니다. 단맛은 ${sweet} 방향으로 나타났으며, 산미는 ${acidity}, 마우스필은 ${mouthfeel} 특성으로 기록되었습니다.`,
    `로스팅 결과는 향미의 선명도, 후반부 클린함, 단맛 지속성의 균형을 중심으로 평가되었습니다. 향미 강도는 ${intensities.flavor || '-'} 수준으로 기록되며, 전체적으로 ${_toneByScore_(_avg(items.map(x=>x.score)), 10)} 샘플로 평가됩니다.`,
    `${axis} 종합 평가는 단맛과 산미, 질감의 연결성이 로스팅 의도와 컵의 실제 인상에서 어떻게 드러났는지를 반영합니다.`
  ]);
}
