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
const LOGIN_SECURITY_SETTING_KEY = 'assessment_login_security_code';
const LOGIN_SECURITY_HMAC_ALGORITHM = 'HMAC-SHA256';
const REGISTRY_REVISION_SETTING_KEY = 'registry_live_revision';

let __schemaReadyPromise = null;
let __defaultDataReadyPromise = null;
const __readRateLimits = new Map();
const RUNTIME_SCHEMA_OBJECTS = [
  'competitions', 'operators', 'sessions', 'participants', 'scores', 'otps', 'sms_logs', 'rate_limits', 'security_events', 'system_settings',
  'idx_scores_comp', 'idx_scores_comp_id', 'idx_scores_submitter_unit', 'idx_participants_comp', 'idx_operators_phone',
  'idx_participants_lookup', 'idx_participants_unit', 'idx_scores_unit', 'idx_otps_lookup', 'idx_sessions_kind',
  'idx_sms_logs_comp', 'idx_security_events_action', 'idx_scores_client_submission_unit', 'idx_operators_effective_date',
  'trg_participants_registry_revision_insert', 'trg_participants_registry_revision_update', 'trg_participants_registry_revision_delete',
  'trg_operators_registry_revision_insert', 'trg_operators_registry_revision_update', 'trg_operators_registry_revision_delete'
];
function memoOnce_(keyName, factory) {
  if (keyName === 'schema') {
    if (!__schemaReadyPromise) __schemaReadyPromise = Promise.resolve().then(factory).catch(err => { __schemaReadyPromise = null; throw err; });
    return __schemaReadyPromise;
  }
  if (!__defaultDataReadyPromise) __defaultDataReadyPromise = Promise.resolve().then(factory).catch(err => { __defaultDataReadyPromise = null; throw err; });
  return __defaultDataReadyPromise;
}
async function runtimeSchemaReady_(db) {
  try {
    const placeholders = RUNTIME_SCHEMA_OBJECTS.map(() => '?').join(',');
    const found = await db.prepare(`SELECT name FROM sqlite_master WHERE name IN (${placeholders})`)
      .bind(...RUNTIME_SCHEMA_OBJECTS).all();
    const names = new Set((found.results || []).map(row => safeStr(row && row.name)));
    if (RUNTIME_SCHEMA_OBJECTS.some(name => !names.has(name))) return false;
    // sqlite_master에는 열 정보가 없으므로 현장 권한 날짜 필드까지 한 번 더 확인합니다.
    await db.prepare('SELECT effective_date FROM operators LIMIT 0').all();
    return true;
  } catch (_) {
    return false;
  }
}
async function runtimeDefaultDataReady_(env) {
  try {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM competitions').first();
    if (!count || Number(count.n || 0) < COMPETITION_CODES.length) return false;
    const adminName = safeStr(env.KCL_ADMIN_NAME);
    const adminPhone = normalizePhone(env.KCL_ADMIN_PHONE);
    const adminAffiliation = safeStr(env.KCL_ADMIN_AFFILIATION) || 'KCL';
    const isLegacyDefaultAdmin = adminName === '관리자' && adminPhone === '01000000000';
    if (!adminName || !adminPhone || isLegacyDefaultAdmin) return true;
    const admin = await env.DB.prepare(`SELECT id FROM operators
      WHERE name=? AND phone=? AND account_type='ADMIN' AND access='ALL' AND role='관리자' AND affiliation=? LIMIT 1`)
      .bind(adminName, adminPhone, adminAffiliation).first();
    return !!(admin && admin.id);
  } catch (_) {
    return false;
  }
}
async function ensureRuntimeReady_(env) {
  // Cloudflare의 새 Worker isolate마다 CREATE TABLE/INDEX를 반복하면 대회 동시 접속 시
  // D1 쓰기 잠금과 초기 응답 지연이 생길 수 있습니다. 완성된 스키마는 읽기 확인만 하고,
  // 실제 누락이 있을 때에만 안전한 IF NOT EXISTS 마이그레이션을 수행합니다.
  await memoOnce_('schema', async () => {
    if (!await runtimeSchemaReady_(env.DB)) await ensureSchema(env.DB);
  });
  await memoOnce_('defaultData', async () => {
    if (!await runtimeDefaultDataReady_(env)) await ensureDefaultData(env);
  });
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
  if (code === 'IKRC') return { mode:'BLIND_SAMPLE', numberLabel:r === '결선' ? '결선샘플번호' : '예선샘플번호', identityHidden:true, directInput:false };
  if (code === 'KTCC') return { mode:'TEAM_VISIBLE', numberLabel:r === '결선' ? '결선팀번호' : '예선팀번호', identityHidden:false, directInput:true };
  if (code === 'MOC') return { mode:'DIRECT_VISIBLE', numberLabel:r + '참가자번호', identityHidden:false, directInput:true };
  if (code === 'MOB') return { mode:'STAGE_VISIBLE', numberLabel:r + '참가자번호', identityHidden:false, directInput:true };
  if (code === 'KBC') return { mode:'STAGE_VISIBLE', numberLabel:r + '참가자번호', identityHidden:false, directInput:true };
  return base;
}
function actorCanSeeParticipantIdentity_(actor, code) {
  return !!(hasAdmin(actor) || hasManageAccess(actor, code));
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
    const generalKey = 'api:' + action + ':' + await sha256Hex_(ip || 'unknown');
    // Live review/ranking screens poll frequently. A D1 write for every safe read
    // creates avoidable database contention when many judges share the venue Wi-Fi.
    // Keep the same per-isolate abuse guard for reads; retain durable D1 limiting
    // for submissions and all state-changing actions.
    const generalLimit = isReadOnlyRpcAction_(action)
      ? memoryRateLimit_(generalKey, 2400, 60)
      : await rateLimit_(env, generalKey, 240, 60);
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
function isReadOnlyRpcAction_(action) {
  return /^(ping|get|list|load|fetch|search|validate|check|generate)/i.test(safeStr(action));
}
function memoryRateLimit_(key, limit, windowSeconds) {
  const now = Date.now();
  const current = __readRateLimits.get(key);
  if (!current || current.resetAt <= now) {
    __readRateLimits.set(key, { count:1, resetAt:now + windowSeconds * 1000 });
    if (__readRateLimits.size > 1000) {
      for (const [storedKey, value] of __readRateLimits) {
        if (!value || value.resetAt <= now) __readRateLimits.delete(storedKey);
      }
    }
    return { ok:true, remaining:Math.max(0, limit - 1) };
  }
  if (current.count >= limit) return { ok:false, remaining:0, resetAt:new Date(current.resetAt).toISOString() };
  current.count += 1;
  return { ok:true, remaining:Math.max(0, limit - current.count) };
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
function normalizeEffectiveDate_(v) {
  const raw = safeStr(v);
  if (!raw) return '';
  const match = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!match) return '';
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '';
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}
function koreaDateKey_(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
    const map = {};
    parts.forEach(part => { if (part.type !== 'literal') map[part.type] = part.value; });
    return normalizeEffectiveDate_([map.year, map.month, map.day].join('-'));
  } catch (_) {
    return normalizeEffectiveDate_(date.toISOString().slice(0, 10));
  }
}
function operatorRowsForEffectiveDate_(rows, dateKey = koreaDateKey_()) {
  const source = Array.isArray(rows) ? rows : [];
  const effectiveDate = normalizeEffectiveDate_(dateKey) || koreaDateKey_();
  const selected = [];
  source.filter(operatorIsAdminRow_).forEach(row => selected.push(row));
  for (const code of COMPETITION_CODES) {
    const candidates = source.filter(row => !operatorIsAdminRow_(row) && accessCodes_(row.access || '').some(value => value === 'ALL' || value === code));
    const dated = candidates.filter(row => normalizeEffectiveDate_(row.effective_date || row.effectiveDate) === effectiveDate);
    const fallback = candidates.filter(row => !normalizeEffectiveDate_(row.effective_date || row.effectiveDate));
    (dated.length ? dated : fallback).forEach(row => selected.push({ ...row, access:code, effective_date:normalizeEffectiveDate_(row.effective_date || row.effectiveDate) }));
  }
  const merged = new Map();
  selected.forEach(row => {
    const key = [row.id == null ? '' : row.id, normalizeAccess_(row.access), normalizeEffectiveDate_(row.effective_date || row.effectiveDate)].join('|');
    if (!merged.has(key)) merged.set(key, row);
  });
  return Array.from(merged.values()).sort((a,b) => Number(a.id || 0) - Number(b.id || 0));
}
function operatorIdentityKey_(name, phone) {
  const normalizedName = normalizePersonName_(name);
  const normalizedPhone = normalizePhone(phone);
  return normalizedName && normalizedPhone ? normalizedName + '|' + normalizedPhone : '';
}
function operatorIsAdminRow_(row) {
  if (!row) return false;
  // ALL is a competition-access scope, not an account-type promotion.
  return normalizeAccountType_(row.account_type || row.accountType || '', row.role || '') === 'ADMIN';
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
  return operatorRowsForEffectiveDate_(Array.from(merged.values()));
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
  if (String(actor.type || actor.accountType || '').toUpperCase() === 'TEAMLEAD' || /팀장|team\s*lead|leader/i.test(actor.role || '')) return true;
  const accountTypeMap = actor.accountTypeMap && typeof actor.accountTypeMap === 'object' ? actor.accountTypeMap : {};
  const roleMap = actor.roleMap && typeof actor.roleMap === 'object' ? actor.roleMap : {};
  return Object.keys(accountTypeMap).some(code => normalizeAccountType_(accountTypeMap[code], roleMap[code] || '') === 'TEAMLEAD')
    || Object.keys(roleMap).some(code => /팀장|team\s*lead|leader/i.test(safeStr(roleMap[code])));
}
function actorAccessCodes_(actor) { return accessCodes_(actor && actor.access); }
function actorAccountTypeForCode_(actor, code) {
  if (!actor) return '';
  const normalizedCode = safeStr(code).toUpperCase();
  const accountTypeMap = actor.accountTypeMap && typeof actor.accountTypeMap === 'object' ? actor.accountTypeMap : {};
  const roleMap = actor.roleMap && typeof actor.roleMap === 'object' ? actor.roleMap : {};
  if (normalizedCode && (accountTypeMap[normalizedCode] || roleMap[normalizedCode])) {
    return normalizeAccountType_(accountTypeMap[normalizedCode] || '', roleMap[normalizedCode] || '');
  }
  const rows = Array.isArray(actor.operatorRows) ? actor.operatorRows : [];
  const scoped = rows.find(row => accessCodes_(row && row.access).some(value => value === 'ALL' || value === normalizedCode));
  if (scoped) return normalizeAccountType_(scoped.accountType || scoped.account_type || '', scoped.role || '');
  return normalizeAccountType_(actor.type || actor.accountType || '', actor.role || '');
}
function hasManageAccess(actor, code) {
  if (!actor) return false;
  if (hasAdmin(actor)) return true;
  return hasAccess(actor, code) && actorAccountTypeForCode_(actor, code) === 'TEAMLEAD';
}
function actorManageCodes_(actor) {
  if (hasAdmin(actor)) return COMPETITION_CODES.slice();
  return COMPETITION_CODES.filter(code => hasManageAccess(actor, code));
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
  const t = actorAccountTypeForCode_(actor, code);
  if (t === 'STAFF') return true;
  const rows = Array.isArray(actor.operatorRows) ? actor.operatorRows : [];
  return rows.some(r => normalizeAccountType_(r.accountType || r.account_type || '', r.role || '') === 'STAFF' && hasAccess({ access: r.access || actor.access, role: r.role || '', type: r.accountType || r.account_type || '' }, code));
}
function operatorRowVisibleToActor_(actor, row) {
  if (hasAdmin(actor)) return true;
  const actorCodes = actorManageCodes_(actor);
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
      effective_date TEXT DEFAULT '',
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
    `CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_scores_comp ON scores(competition_code, round)`,
    `CREATE INDEX IF NOT EXISTS idx_scores_comp_id ON scores(competition_code, id)`,
    `CREATE INDEX IF NOT EXISTS idx_scores_submitter_unit ON scores(competition_code, round, judge_name, unit, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_participants_comp ON participants(competition_code)`,
    `CREATE INDEX IF NOT EXISTS idx_operators_phone ON operators(name, phone)`,
    `CREATE INDEX IF NOT EXISTS idx_participants_lookup ON participants(competition_code, name, phone)`,
    `CREATE INDEX IF NOT EXISTS idx_participants_unit ON participants(competition_code, unique_no, cup_no, sample_no, team_no)`,
    `CREATE INDEX IF NOT EXISTS idx_scores_unit ON scores(competition_code, unit, review_status)`,
    `CREATE INDEX IF NOT EXISTS idx_otps_lookup ON otps(competition_code, name, phone, id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_kind ON sessions(kind)`,
    `CREATE INDEX IF NOT EXISTS idx_sms_logs_comp ON sms_logs(competition_code, phone, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_security_events_action ON security_events(action, created_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_client_submission_unit
      ON scores(competition_code, judge_name, json_extract(payload_json, '$.clientSubmissionId'), unit)
      WHERE COALESCE(json_extract(payload_json, '$.clientSubmissionId'), '') <> ''`,
    ...['INSERT','UPDATE','DELETE'].flatMap(operation => ['participants','operators'].map(table => `
      CREATE TRIGGER IF NOT EXISTS trg_${table}_registry_revision_${operation.toLowerCase()}
      AFTER ${operation} ON ${table}
      BEGIN
        INSERT INTO system_settings (setting_key, setting_value, updated_at, updated_by)
        VALUES ('${REGISTRY_REVISION_SETTING_KEY}', '1', strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'database')
        ON CONFLICT(setting_key) DO UPDATE SET
          setting_value=CAST(COALESCE(setting_value,'0') AS INTEGER)+1,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
          updated_by='database';
      END`))
  ];
  for (const sql of statements) await db.prepare(sql).run();
  const operatorColumns = await db.prepare('PRAGMA table_info(operators)').all();
  const hasEffectiveDate = (operatorColumns.results || []).some(column => safeStr(column.name).toLowerCase() === 'effective_date');
  if (!hasEffectiveDate) await db.prepare("ALTER TABLE operators ADD COLUMN effective_date TEXT DEFAULT ''").run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_operators_effective_date ON operators(effective_date, access, name)').run();
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
    judgeLogin: () => judgeLogin(env, args[0], args[1], args[2], request),
    adminLogin: () => adminLogin(env, args[0], args[1], args[2], request),
    getLoginSecurityStatus: () => getLoginSecurityStatus(env, args[0]),
    setLoginSecurityCode: () => setLoginSecurityCode(env, args[0], args[1]),
    deleteLoginSecurityCode: () => deleteLoginSecurityCode(env, args[0]),
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
    getSelectiveResetOptions: () => getSelectiveResetOptions(env, args[0], args[1]),
    deleteSelectedParticipantData: () => deleteSelectedParticipantData(env, args[0], args[1]),
    deleteSelectedScoreData: () => deleteSelectedScoreData(env, args[0], args[1]),
    clearParticipants: () => clearParticipants(env, args[0], args[1]),
    clearScores: () => clearScores(env, args[0], args[1]),
    importParticipants: () => importParticipants(env, args[0], args[1]),
    importOperators: () => importOperators(env, args[0], args[1]),
    applyOperatorDateSchedule: () => applyOperatorDateSchedule(env, args[0], args[1]),
    bulkApplyOperatorEffectiveDate: () => bulkApplyOperatorEffectiveDate(env, args[0], args[1]),
    saveRegistrySchedule: () => saveRegistrySchedule(env, args[0], args[1]),
    deleteRegistrySchedule: () => deleteRegistrySchedule(env, args[0], args[1]),
    assignRegistrySchedule: () => assignRegistrySchedule(env, args[0], args[1]),
    getRegistrationTemplates: () => getRegistrationTemplates(),
    getParticipantAssignments: () => getParticipantAssignments(env, args[0], args[1]),
    getIkrcBlindAssignments: () => getIkrcBlindAssignments(env, args[0]),
    saveIkrcStationSettings: () => saveIkrcStationSettings(env, args[0], args[1]),
    saveIkrcBlindAssignments: () => saveIkrcBlindAssignments(env, args[0], args[1]),
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
    getScoreBackupReport: () => getScoreBackupReport(env, args[0], args[1]),
    sendOTP: () => sendOTP(env, args[0], args[1], args[2], request),
    verifyOTP: () => verifyOTP(env, args[0], args[1], args[2], args[3], request),
    sendTestSMS: () => sendTestSMS(env, args[0], args[1], request),
    refreshAdminActor: () => refreshAdminActor(env, args[0]),
    getRegistryLiveState: () => getRegistryLiveState(env, args[0], args[1], args[2]),
    getSystemStatus: () => getSystemStatus(env, args[0]),
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
    getIkrcCalibrationScopeOptions: () => getIkrcCalibrationScopeOptions(env, args[0]),
    getIkrcCalibrationCupNumbers: () => getIkrcCalibrationCupNumbers(env, args[0], args[1]),
    getIkrcCalibrationResultsByCup: () => getIkrcCalibrationResultsByCup(env, args[0], args[1], args[2]),
    markIkrcCalibrationChecked: () => markIkrcCalibrationChecked(env, args[0], args[1], args[2], args[3], args[4]),
    getIkrcOfficialCalibrationScopeOptions: () => getIkrcOfficialCalibrationScopeOptions(env, args[0]),
    getIkrcOfficialCalibrationCupNumbers: () => getIkrcOfficialCalibrationCupNumbers(env, args[0], args[1]),
    getIkrcOfficialCalibrationResultsByCup: () => getIkrcOfficialCalibrationResultsByCup(env, args[0], args[1], args[2]),
    finalizeIkrcStationEvaluation: () => finalizeIkrcStationEvaluation(env, args[0], args[1]),
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

function loginSecurityCodeValid_(code) {
  return /^\d{4,8}$/.test(safeStr(code));
}
function bytesHex_(value) {
  return Array.from(value instanceof Uint8Array ? value : new Uint8Array(value || [])).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function deriveLoginSecurityHash_(env, code, saltHex) {
  const pepper = safeStr(env && env.KCL_LOGIN_SECURITY_PEPPER);
  if (!pepper) throw new Error('LOGIN_SECURITY_PEPPER_NOT_CONFIGURED');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(pepper),
    { name:'HMAC', hash:'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(safeStr(saltHex) + ':' + safeStr(code)));
  return bytesHex_(signature);
}
async function loginSecuritySetting_(env) {
  const row = await env.DB.prepare('SELECT setting_value, updated_at, updated_by FROM system_settings WHERE setting_key=?').bind(LOGIN_SECURITY_SETTING_KEY).first();
  if (!row) return { enabled:false, valid:true, updatedAt:'', updatedBy:'' };
  const record = parseJson(row.setting_value, {});
  const valid = !!(record && record.algorithm === LOGIN_SECURITY_HMAC_ALGORITHM && record.salt && record.hash);
  return { enabled:true, valid, record, updatedAt:safeStr(row.updated_at), updatedBy:safeStr(row.updated_by) };
}
async function verifyLoginSecurityCode_(env, code) {
  const setting = await loginSecuritySetting_(env);
  if (!setting.enabled) return { success:true, required:false };
  if (!setting.valid) return { success:false, required:true, message:'로그인 보안번호 설정을 확인할 수 없습니다. 관리자에게 문의해주세요.' };
  const entered = safeStr(code);
  if (!entered) return { success:false, required:true, message:'보안번호를 입력해주세요.' };
  if (!loginSecurityCodeValid_(entered)) return { success:false, required:true, message:'보안번호가 올바르지 않습니다.' };
  if (!safeStr(env && env.KCL_LOGIN_SECURITY_PEPPER)) return { success:false, required:true, message:'로그인 보안 설정이 준비되지 않았습니다. 관리자에게 문의해주세요.' };
  const derived = await deriveLoginSecurityHash_(env, entered, setting.record.salt);
  if (!timingSafeEqual_(derived, setting.record.hash)) return { success:false, required:true, message:'보안번호가 올바르지 않습니다.' };
  return { success:true, required:true };
}
async function logSecurityEvent_(env, action, actorName, target, status, message) {
  try {
    await env.DB.prepare('INSERT INTO security_events (action, actor_name, target, status, message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(safeStr(action), safeStr(actorName), safeStr(target), safeStr(status), safeStr(message), nowIso()).run();
  } catch (_) {}
}
async function getLoginSecurityStatus(env, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success:false, message:'전체 관리자 권한이 필요합니다.' };
  const setting = await loginSecuritySetting_(env);
  return {
    success:true,
    enabled:!!setting.enabled,
    updatedAt:setting.updatedAt || '',
    updatedBy:setting.updatedBy || ''
  };
}
async function setLoginSecurityCode(env, payload, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success:false, message:'전체 관리자 권한이 필요합니다.' };
  const code = safeStr(payload && payload.code);
  const confirmCode = safeStr(payload && payload.confirmCode);
  if (!loginSecurityCodeValid_(code)) return { success:false, message:'보안번호는 숫자 4~8자리로 입력해주세요.' };
  if (code !== confirmCode) return { success:false, message:'보안번호 확인값이 일치하지 않습니다.' };
  if (!safeStr(env && env.KCL_LOGIN_SECURITY_PEPPER)) return { success:false, message:'로그인 보안 설정이 준비되지 않았습니다. 관리자에게 문의해주세요.' };
  const previous = await loginSecuritySetting_(env);
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltHex = bytesHex_(salt);
  const hash = await deriveLoginSecurityHash_(env, code, saltHex);
  const actorName = safeStr(actor.name || actor.judgeName || '관리자');
  const savedAt = nowIso();
  const record = JSON.stringify({ version:2, algorithm:LOGIN_SECURITY_HMAC_ALGORITHM, salt:saltHex, hash });
  await env.DB.prepare('INSERT OR REPLACE INTO system_settings (setting_key, setting_value, updated_at, updated_by) VALUES (?, ?, ?, ?)')
    .bind(LOGIN_SECURITY_SETTING_KEY, record, savedAt, actorName).run();
  await logSecurityEvent_(env, previous.enabled ? 'LOGIN_SECURITY_CODE_CHANGED' : 'LOGIN_SECURITY_CODE_CREATED', actorName, 'assessment-login', 'SUCCESS', previous.enabled ? '로그인 보안번호 변경' : '로그인 보안번호 생성');
  return { success:true, enabled:true, updatedAt:savedAt, updatedBy:actorName, message:previous.enabled ? '전체 로그인 보안번호를 변경했습니다.' : '전체 로그인 보안번호를 생성했습니다.' };
}
async function deleteLoginSecurityCode(env, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success:false, message:'전체 관리자 권한이 필요합니다.' };
  const actorName = safeStr(actor.name || actor.judgeName || '관리자');
  const previous = await loginSecuritySetting_(env);
  await env.DB.prepare('DELETE FROM system_settings WHERE setting_key=?').bind(LOGIN_SECURITY_SETTING_KEY).run();
  await logSecurityEvent_(env, 'LOGIN_SECURITY_CODE_DELETED', actorName, 'assessment-login', 'SUCCESS', '로그인 보안번호 삭제');
  return { success:true, enabled:false, message:previous.enabled ? '전체 로그인 보안번호를 삭제했습니다.' : '설정된 로그인 보안번호가 없습니다.' };
}

async function judgeLogin(env, name, phone, securityCode = '', request = null) {
  name = safeStr(name); phone = normalizePhone(phone);
  if (!name) return { success: false, message: '이름을 입력해주세요.' };
  if (!phone) return { success: false, message: '연락처를 입력해주세요.' };
  const phoneLimit = await rateLimit_(env, 'login-phone:' + await sha256Hex_(phone), 20, 10 * 60);
  const ipLimit = await rateLimit_(env, 'login-ip:' + await sha256Hex_(clientIp_(request) || 'unknown'), 80, 10 * 60);
  if (!phoneLimit.ok || !ipLimit.ok) return { success: false, message: '로그인 시도가 많습니다. 잠시 후 다시 시도해주세요.' };
  const securityCheck = await verifyLoginSecurityCode_(env, securityCode);
  if (!securityCheck.success) {
    await logSecurityEvent_(env, 'ASSESSMENT_LOGIN_SECURITY_FAILED', name, await sha256Hex_(phone), 'DENIED', securityCheck.message);
    return { success:false, message:securityCheck.message, securityCodeRequired:!!securityCheck.required };
  }
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
    permissionDate: koreaDateKey_(),
    securityCodeRequired: !!securityCheck.required,
    operatorRows: list.map(r => ({
      rowIndex: r.id,
      accountType: normalizeAccountType_(r.account_type || '', r.role || ''),
      access: normalizeAccess_(r.access),
      teamGroup: r.team_group || '',
      role: r.role || '',
      effectiveDate: normalizeEffectiveDate_(r.effective_date || r.effectiveDate)
    }))
  };
  result.judgeToken = await issueSession(env, 'judge', result, 21600);
  return result;
}
async function issueSession(env, kind, payload, seconds) {
  const token = uuid();
  const expires = new Date(Date.now() + seconds * 1000).toISOString();
  try {
    await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(nowIso()).run();
  } catch (e) {
    // 세션 발급 자체는 만료 데이터 정리 실패와 무관하게 계속 진행합니다.
  }
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
    // 계정이 삭제되었거나 오늘 유효한 날짜 권한이 없으면 세션에 남아 있던 이전 역할을 재사용하지 않습니다.
    if (!list.length) return null;

    const admin = list.find(x => operatorIsAdminRow_(x));
    const highest = bestOperatorRow_(list);
    const primary = admin || highest || {};
    const primaryType = admin ? 'ADMIN' : normalizeAccountType_(highest && highest.account_type, highest && highest.role);
    const primaryRole = admin ? '관리자' : safeStr((highest && highest.role) || primary.role || '');

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
      affiliation: primary.affiliation || '',
      phone,
      type: primaryType,
      accountType: primaryType,
      role: primaryRole,
      access,
      accessCodes: access === 'ALL' ? ['ALL'] : access.split(',').filter(Boolean),
      teamGroup: primary.team_group || '',
      // 관리자 등록값이 최종 기준입니다. 세션에 남아 있던 삭제 전 역할·팀을 합치면
      // 권한을 수정하거나 제거해도 오래된 메뉴가 계속 보일 수 있으므로 최신 DB 맵으로 교체합니다.
      teamMap,
      roleMap,
      accountTypeMap,
      permissionDate: koreaDateKey_(),
      operatorRows: list.map(r => ({
        rowIndex: r.id,
        accountType: normalizeAccountType_(r.account_type || '', r.role || ''),
        access: normalizeAccess_(r.access),
        teamGroup: r.team_group || '',
        role: r.role || '',
        effectiveDate: normalizeEffectiveDate_(r.effective_date || r.effectiveDate)
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
    phones: [payload.judgePhone, payload.phone, payload.operatorPhone, judge.phone],
    tokens: [payload.judgeToken, payload.actorToken, payload.operatorToken, payload.token, judge.judgeToken, judge.actorToken],
    identityKeys: [payload.operatorIdentityKey, payload.judgeIdentityKey, judge.operatorIdentityKey, judge.identityKey]
  };
}
function scoreOwnedByActor_(scoreRow, actor) {
  if (!scoreRow || !actor) return false;
  const actorName = normalizePersonName_(actor.name || actor.judgeName || actor.operatorName || '');
  const actorPhone = normalizePhone(actor.phone || '');
  const actorIdentityKey = operatorIdentityKey_(actor.name || actor.judgeName || actor.operatorName || '', actorPhone);
  const actorToken = safeStr(actor.judgeToken || actor.actorToken || actor.operatorToken || '');
  const payload = parseJson(scoreRow.payload_json, {});
  const ids = payloadIdentityCandidates_(payload);
  const names = [scoreRow.judge_name].concat(ids.names || []).map(v => normalizePersonName_(v)).filter(Boolean);
  const phones = (ids.phones || []).map(v => normalizePhone(v)).filter(Boolean);
  const tokens = (ids.tokens || []).map(v => safeStr(v)).filter(Boolean);
  const identityKeys = (ids.identityKeys || []).map(v => safeStr(v)).filter(Boolean);
  // Stage107 이후 제출은 인증된 이름+연락처 키를 최우선으로 사용합니다.
  // 같은 연락처를 공유하는 서로 다른 이름의 계정이 상대 기록을 소유한 것으로 오인하지 않게 합니다.
  if (identityKeys.length) return !!actorIdentityKey && identityKeys.some(key => key === actorIdentityKey);
  // 구버전 기록도 저장된 심사위원 이름이 있으면 이름을 먼저 확인합니다.
  // 이름이 명시된 다른 계정의 기록을 같은 연락처라는 이유만으로 소유 처리하지 않습니다.
  if (actorToken && tokens.some(t => t === actorToken)) return true;
  if (actorName && names.length) return names.some(n => n === actorName);
  if (actorPhone && phones.some(p => p === actorPhone)) return true;
  return false;
}
function reviewManageScopeRequested_(actorArg) {
  const scope = safeStr(actorArg && (actorArg.reviewScope || actorArg.scope || '')).toLowerCase();
  return scope === 'manage' || actorArg && actorArg.manageReview === true;
}
function reviewManageAllowed_(actor, code, actorArg) {
  return hasManageAccess(actor, code) && reviewManageScopeRequested_(actorArg);
}
function reviewRoleCategoryServer_(roleText) {
  const r = safeStr(roleText).replace(/\s/g, '').toLowerCase();
  const hasTech = /technical|tech|^t\d*$|^tjudge\d*$|^technicaljudge\d*$|\uD14C\uD06C|\uAE30\uC220/.test(r);
  const hasSensory = /sensory|sensor|^s\d*$|^sjudge\d*$|^sensoryjudge\d*$|\uC13C\uC11C|\uAC10\uAC01/.test(r);
  const hasHead = /head|\uD5E4\uB4DC/.test(r);
  if (hasHead) return 'head';
  if (hasTech && !hasSensory) return 'technical';
  if (hasSensory && !hasTech) return 'sensory';
  if (hasTech) return 'technical';
  if (hasSensory) return 'sensory';
  return '';
}
function actorReviewRoleCategory_(actor, code) {
  if (!actor) return '';
  const c = safeStr(code).toUpperCase();
  const roleMap = actor.roleMap && typeof actor.roleMap === 'object' ? actor.roleMap : {};
  return reviewRoleCategoryServer_(roleMap[c] || actor.role || actor.judgeRole || actor.operatorRole || actor.type || actor.accountType || '');
}
function scoreReviewRoleCategory_(scoreRow) {
  if (!scoreRow) return '';
  const payload = parseJson(scoreRow.payload_json, {});
  return reviewRoleCategoryServer_(scoreRow.role || payload.judgeRole || payload.role || payload.operatorRole || payload.actorRole || '');
}
function reviewRoleScopeMatches_(scoreRow, actor, code) {
  const actorCategory = actorReviewRoleCategory_(actor, code);
  if (!actorCategory || actorCategory === 'head') return true;
  const scoreCategory = scoreReviewRoleCategory_(scoreRow);
  if (!scoreCategory || scoreCategory === 'head') return true;
  return actorCategory === scoreCategory;
}
function reviewScoreVisibleToActor_(scoreRow, actor, code, canManage) {
  if (canManage) return true;
  return scoreOwnedByActor_(scoreRow, actor) && reviewRoleScopeMatches_(scoreRow, actor, code);
}
function canReviewScoreRow_(scoreRow, actor, code, canManage) {
  return reviewScoreVisibleToActor_(scoreRow, actor, code, canManage);
}
function hasAdmin(actor) {
  if (!actor) return false;
  if (normalizeAccountType_(actor.type || actor.accountType || '', actor.role || '') === 'ADMIN') return true;
  const rows = Array.isArray(actor.operatorRows) ? actor.operatorRows : [];
  return rows.some(r => normalizeAccountType_(r.accountType || r.account_type || '', r.role || '') === 'ADMIN');
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
  const visibleConfigs = hasAdmin(actor) ? cfg.configs : filterConfigsForActor_(cfg.configs, actor);
  return {
    success: true,
    configs: visibleConfigs
  };
}

async function updateCompetitionAdminSettings(env, payload, actorArg) {
  const actor = await getActor(env, actorArg);
  const code = safeStr(payload && payload.code).toUpperCase();
  if (!code) return { success: false, message: '대회코드가 없습니다.' };
  if (!actor || !hasManageAccess(actor, code)) return { success: false, message: '대회 설정 권한이 없습니다.' };
  const current = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind(code).first();
  if (!current) return { success: false, message: '대회를 찾을 수 없습니다: ' + code };
  const nextRound = safeStr(payload.currentRound) || current.current_round || '';
  const currentOptions = parseJson(current.option_settings, {});
  const nextOptions = Object.assign({}, currentOptions, payload.optionSettings && typeof payload.optionSettings === 'object' ? payload.optionSettings : {});
  let ikrcStationChanged = false;
  let preservedIkrcScoreCount = 0;
  let kcrStationChanged = false;
  let preservedKcrScoreCount = 0;
  if (code === 'IKRC') {
    const checked = validateIkrcStationOptionSettings_(nextOptions.ikrcStations, nextRound);
    if (!checked.ok) return { success:false, message:checked.message };
    const currentStations = ikrcStationSettingsServer_(current, nextRound);
    const nextStations = checked.list;
    if (ikrcStationFingerprintServer_(currentStations) !== ikrcStationFingerprintServer_(nextStations)) {
      ikrcStationChanged = true;
      const scoreCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE competition_code=? AND round=?').bind(code, nextRound).first();
      preservedIkrcScoreCount = Number(scoreCount && scoreCount.n || 0);
    }
    nextOptions.ikrcStations = checked.settings;
  }
  if (code === 'KCR') {
    const checked = validateKcrStationOptionSettings_(nextOptions.kcrStations, nextRound);
    if (!checked.ok) return { success:false, message:checked.message };
    const currentStations = kcrStationSettingsServer_(current, nextRound);
    const nextStations = checked.list;
    if (kcrStationFingerprintServer_(currentStations) !== kcrStationFingerprintServer_(nextStations)) {
      kcrStationChanged = true;
      const scoreCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE competition_code=? AND round=?').bind(code, nextRound).first();
      preservedKcrScoreCount = Number(scoreCount && scoreCount.n || 0);
    }
    nextOptions.kcrStations = checked.settings;
  }
  if (code === 'MOB' && Object.prototype.hasOwnProperty.call(nextOptions, 'mobParticipantDate')) {
    const rawMobParticipantDate = safeStr(nextOptions.mobParticipantDate);
    const mobParticipantDate = normalizeEffectiveDate_(rawMobParticipantDate);
    if (rawMobParticipantDate && !mobParticipantDate) return { success:false, message:'MOB 평가 참가자 표시일을 올바른 날짜로 선택해주세요.' };
    nextOptions.mobParticipantDate = mobParticipantDate;
  }
  await env.DB.prepare(`UPDATE competitions SET name=?, current_round=?, is_active=?, debriefing=?, option_settings=?, updated_at=? WHERE code=?`)
    .bind(
      safeStr(payload.name) || current.name,
      nextRound,
      boolInt(!!payload.isActive),
      boolInt(!!payload.debriefing),
      JSON.stringify(nextOptions),
      nowIso(), code
    ).run();
  return {
    success: true,
    message: ikrcStationChanged && preservedIkrcScoreCount
      ? `저장 완료. ${nextRound} 기존 IKRC 평가 ${preservedIkrcScoreCount}건은 삭제하지 않고 제출 당시 스테이션 정보와 함께 보존했습니다.`
      : (kcrStationChanged && preservedKcrScoreCount
        ? `저장 완료. ${nextRound} 기존 KCR 평가 ${preservedKcrScoreCount}건은 삭제하지 않고 제출 당시 스테이션 정보와 함께 보존했습니다.`
        : '저장 완료'),
    stationChanged: ikrcStationChanged || kcrStationChanged,
    preservedScoreCount: preservedIkrcScoreCount || preservedKcrScoreCount
  };
}

function registryScheduleText_(value, maxLength = 80) {
  return safeStr(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
function registrySchedulesFromOptions_(options, code) {
  const source = options && Array.isArray(options.registrySchedules) ? options.registrySchedules : [];
  const seen = new Set();
  return source.map((item, index) => {
    const rawId = registryScheduleText_(item && item.id, 80).replace(/[^a-zA-Z0-9_-]/g, '');
    const id = rawId || `schedule-${index + 1}`;
    if (seen.has(id)) return null;
    seen.add(id);
    const round = normalizeRoundForCompetition_(code, item && item.round);
    const date = normalizeEffectiveDate_(item && item.date);
    if (!date) return null;
    return {
      id,
      name: registryScheduleText_(item && item.name, 80) || `${round} ${date}`,
      round,
      date,
      operatingDay: registryScheduleText_(item && item.operatingDay, 30),
      station: registryScheduleText_(item && item.station, 40),
      waitingTime: normalizeParticipantScheduleRange_(item && item.waitingTime),
      preparationTime: normalizeParticipantScheduleRange_(item && item.preparationTime),
      performanceTime: normalizeParticipantScheduleRange_(item && item.performanceTime),
      cleanupTime: normalizeParticipantScheduleRange_(item && item.cleanupTime),
      updatedAt: registryScheduleText_(item && item.updatedAt, 40)
    };
  }).filter(Boolean).slice(0, 100);
}
async function registryScheduleContext_(env, payload, actorArg) {
  const actor = await getActor(env, actorArg);
  const checked = strictCompetitionCode_(payload && payload.competitionCode, '일정 관리');
  if (checked.error) return { error:checked.error };
  const code = checked.code;
  if (!actor || !hasManageAccess(actor, code)) return { error:{ success:false, message:code + ' 일정 관리 권한이 없습니다.' } };
  const competition = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind(code).first();
  if (!competition) return { error:{ success:false, message:'대회를 찾을 수 없습니다: ' + code } };
  const options = parseJson(competition.option_settings, {});
  const schedules = registrySchedulesFromOptions_(options, code);
  return { actor, code, competition, options, schedules };
}
async function saveRegistrySchedule(env, payload, actorArg) {
  const context = await registryScheduleContext_(env, payload, actorArg);
  if (context.error) return context.error;
  const rawDate = safeStr(payload && payload.date);
  const date = normalizeEffectiveDate_(rawDate);
  if (!date) return { success:false, message:'일정 날짜를 달력에서 선택해주세요.' };
  const round = normalizeRoundForCompetition_(context.code, payload && payload.round);
  const allowedRounds = COMPETITION_ROUNDS[context.code] || ['예선','결선'];
  if (!allowedRounds.includes(round)) return { success:false, message:'해당 대회에서 사용할 수 없는 라운드입니다.' };
  let id = registryScheduleText_(payload && payload.id, 80).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) id = `schedule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (!context.schedules.some(item => item.id === id) && context.schedules.length >= 100) {
    return { success:false, message:'대회별 일정은 최대 100개까지 만들 수 있습니다. 사용하지 않는 일정 정의를 먼저 정리해주세요.' };
  }
  const schedule = registrySchedulesFromOptions_({ registrySchedules:[{
    id,
    name:payload && payload.name,
    round,
    date,
    operatingDay:payload && payload.operatingDay,
    station:payload && payload.station,
    waitingTime:payload && payload.waitingTime,
    preparationTime:payload && payload.preparationTime,
    performanceTime:payload && payload.performanceTime,
    cleanupTime:payload && payload.cleanupTime,
    updatedAt:nowIso()
  }] }, context.code)[0];
  if (!schedule) return { success:false, message:'일정 정보를 확인해주세요.' };
  const next = context.schedules.filter(item => item.id !== id);
  next.push(schedule);
  next.sort((a, b) => a.date.localeCompare(b.date) || (COMPETITION_ROUNDS[context.code] || []).indexOf(a.round) - (COMPETITION_ROUNDS[context.code] || []).indexOf(b.round) || a.name.localeCompare(b.name, 'ko'));
  context.options.registrySchedules = next;
  await env.DB.prepare('UPDATE competitions SET option_settings=?, updated_at=? WHERE code=?')
    .bind(JSON.stringify(context.options), nowIso(), context.code).run();
  return { success:true, message:`${context.code} ${schedule.round} 일정 저장 완료`, schedule, schedules:next };
}
async function deleteRegistrySchedule(env, payload, actorArg) {
  const context = await registryScheduleContext_(env, payload, actorArg);
  if (context.error) return context.error;
  const id = registryScheduleText_(payload && payload.scheduleId, 80).replace(/[^a-zA-Z0-9_-]/g, '');
  const target = context.schedules.find(item => item.id === id);
  if (!target) return { success:false, message:'삭제할 일정을 찾을 수 없습니다. 목록을 새로고침해주세요.' };
  const next = context.schedules.filter(item => item.id !== id);
  context.options.registrySchedules = next;
  await env.DB.prepare('UPDATE competitions SET option_settings=?, updated_at=? WHERE code=?')
    .bind(JSON.stringify(context.options), nowIso(), context.code).run();
  return { success:true, message:'일정 정의를 삭제했습니다. 이미 배정된 선수 정보·심사 권한·점수는 유지됩니다.', schedules:next };
}
async function assignRegistrySchedule(env, payload, actorArg) {
  const context = await registryScheduleContext_(env, payload, actorArg);
  if (context.error) return context.error;
  const scheduleId = registryScheduleText_(payload && payload.scheduleId, 80).replace(/[^a-zA-Z0-9_-]/g, '');
  const schedule = context.schedules.find(item => item.id === scheduleId);
  if (!schedule) return { success:false, message:'배정할 일정을 찾을 수 없습니다. 일정 목록을 새로고침해주세요.' };
  const targetType = safeStr(payload && payload.targetType).toLowerCase();
  const rowIndexes = Array.from(new Set((Array.isArray(payload && payload.rowIndexes) ? payload.rowIndexes : [])
    .map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0))).slice(0, 500);
  if (!rowIndexes.length) return { success:false, message:'일정에 배정할 사람을 한 명 이상 선택해주세요.' };

  if (targetType === 'operators') {
    const result = await bulkApplyOperatorEffectiveDate(env, {
      competitionCode:context.code,
      effectiveDate:schedule.date,
      // IKRC 선수 일정의 위치는 로스팅 운영 정보다. 센서리 심사위원의
      // 담당 스테이션은 운영팀장이 별도로 정하므로 일정 배정으로 덮지 않는다.
      teamGroupOverride:context.code === 'IKRC' ? '' : (schedule.station || ''),
      rowIndexes
    }, actorArg);
    if (!result || !result.success) return result || { success:false, message:'심사위원 일정 배정에 실패했습니다.' };
    return Object.assign({}, result, {
      message:`${schedule.name}에 심사위원 ${Number(result.applied || 0)}명 배정 완료 · 기존 권한 유지`,
      schedule
    });
  }
  if (targetType !== 'participants') return { success:false, message:'일정 배정 대상을 확인해주세요.' };

  const placeholders = rowIndexes.map(() => '?').join(',');
  const rs = await env.DB.prepare(`SELECT * FROM participants WHERE id IN (${placeholders}) ORDER BY id`).bind(...rowIndexes).all();
  const rows = rs.results || [];
  if (rows.length !== rowIndexes.length || rows.some(row => safeStr(row.competition_code).toUpperCase() !== context.code)) {
    return { success:false, message:'선택한 선수 목록이 변경되었거나 다른 대회 선수가 포함되어 있습니다. 목록을 새로고침해주세요.' };
  }
  const updatedAt = nowIso();
  const statements = rows.map(row => {
    const extra = parseJson(row.extra_json, {});
    extra['일정ID'] = schedule.id;
    extra['일정명'] = schedule.name;
    extra['일정구분'] = schedule.round;
    extra['대회일'] = schedule.date;
    if (context.code === 'IKRC') extra['로스팅위치'] = schedule.station || '';
    else extra['스테이션번호'] = schedule.station || '';
    extra['준비시간'] = schedule.preparationTime || '';
    extra['시연시간'] = schedule.performanceTime || '';
    return env.DB.prepare('UPDATE participants SET extra_json=?, updated_at=? WHERE id=? AND competition_code=?')
      .bind(JSON.stringify(extra), updatedAt, row.id, context.code);
  });
  if (statements.length && typeof env.DB.batch === 'function') {
    for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));
  } else {
    for (const statement of statements) await statement.run();
  }
  return { success:true, message:`${schedule.name} 일정으로 선수 ${rows.length}명 변경 완료 · 기존 선수번호와 점수 유지`, schedule, applied:rows.length };
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
    role: safeStr(payload.role || '센서리 심사위원'),
    effectiveDate: normalizeEffectiveDate_(payload.effectiveDate || payload.activeDate || payload.permissionDate || '')
  };
  if (!data.name || !data.phone) return { success: false, message: '이름과 연락처를 입력해주세요.' };
  if (safeStr(payload.effectiveDate || payload.activeDate || payload.permissionDate || '') && !data.effectiveDate) return { success:false, message:'적용일은 YYYY-MM-DD 형식의 올바른 날짜로 입력해주세요.' };

  data.access = normalizeAccess_(data.access || '');
  if (data.accountType === 'ADMIN') {
    data.access = 'ALL';
    data.role = '관리자';
    data.teamGroup = '';
    data.effectiveDate = '';
  } else if (!data.access) {
    return { success: false, message: '관리자가 아닌 계정은 담당 대회코드가 필요합니다.' };
  } else if (data.accountType === 'TEAMLEAD' && !data.role) {
    data.role = '팀장';
  } else if (data.accountType === 'STAFF' && !data.role) {
    data.role = '운영진';
  }

  // 같은 엑셀을 다시 업로드해도 중복 계정이 쌓이지 않도록 이름+연락처+권한대회+적용일 기준으로 갱신합니다.
  // 같은 사람이 KCR 팀장과 KCAC 팀장을 병행하는 경우처럼 권한대회가 다르면 별도 행으로 유지해야 로그인 시 두 대회가 모두 노출됩니다.
  if (!id) {
    const existing = await env.DB.prepare(`SELECT id FROM operators WHERE name=? AND phone=? AND COALESCE(access,'')=? AND COALESCE(effective_date,'')=? ORDER BY id LIMIT 1`)
      .bind(data.name, data.phone, data.access, data.effectiveDate).first();
    if (existing && existing.id) id = Number(existing.id);
  }

  if (id) {
    await env.DB.prepare(`UPDATE operators SET account_type=?, name=?, affiliation=?, phone=?, access=?, team_group=?, role=?, effective_date=?, updated_at=? WHERE id=?`)
      .bind(data.accountType, data.name, data.affiliation, data.phone, data.access, data.teamGroup, data.role, data.effectiveDate, nowIso(), id).run();
  } else {
    await env.DB.prepare(`INSERT INTO operators (account_type, name, affiliation, phone, access, team_group, role, effective_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(data.accountType, data.name, data.affiliation, data.phone, data.access, data.teamGroup, data.role, data.effectiveDate, nowIso(), nowIso()).run();
  }
  return { success: true, message: data.effectiveDate ? (data.effectiveDate + ' 날짜 권한 저장 완료') : '상시 권한 저장 완료' };
}
async function deleteOperatorAccount(env, rowIndex, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success: false, message: '계정 삭제 권한이 없습니다.' };
  const id = Number(rowIndex);
  if (!id) return { success: false, message: '삭제할 계정을 찾을 수 없습니다.' };
  const target = await env.DB.prepare('SELECT * FROM operators WHERE id=?').bind(id).first();
  if (!target) return { success: false, message: '이미 삭제되었거나 존재하지 않는 계정입니다.' };
  if (operatorIsAdminRow_(target)) {
    const adminCount = await env.DB.prepare(`SELECT COUNT(*) AS n FROM operators WHERE account_type='ADMIN' OR role LIKE '%관리자%' OR role LIKE '%총괄%'`).first();
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
    role: r.role || '',
    effectiveDate: normalizeEffectiveDate_(r.effective_date || '')
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
function normalizeParticipantScheduleRange_(value) {
  const raw = safeStr(value).replace(/\s+/g, '').replace(/[–—-]/g, '~');
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2}):(\d{2})~(\d{1,2}):(\d{2})$/);
  if (!match) return safeStr(value);
  const startHour = Number(match[1]), startMinute = Number(match[2]), endHour = Number(match[3]), endMinute = Number(match[4]);
  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return safeStr(value);
  return `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}~${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
}
function participantPayloadFromRow_(raw, defaultCode='') {
  raw = raw && typeof raw === 'object' ? raw : {};
  const inheritedExtra = raw.extra && typeof raw.extra === 'object' && !Array.isArray(raw.extra) ? raw.extra : {};
  const source = Object.assign({}, inheritedExtra, raw);
  delete source.extra;
  // 관리자 수정 폼의 명시적인 소속 값은 기존 엑셀 extra 필드보다 우선해야 합니다.
  // 그렇지 않으면 extra['소속']의 과거 값이 raw.affiliation보다 먼저 선택되어
  // 화면에서는 저장 성공으로 보여도 기본 affiliation 컬럼이 되돌아갑니다.
  if (Object.prototype.hasOwnProperty.call(raw, 'affiliation')) {
    ['소속','affiliation','company','업체명'].forEach(alias => { source[alias] = raw.affiliation; });
  }
  const code = safeStr(pickByAliases_(source, ['대회코드','competition_code','competitionCode','code'], defaultCode === 'ALL' ? '' : defaultCode)).toUpperCase();
  const name = safeStr(pickByAliases_(source, ['선수명','참가자명','이름','name','playerName','participantName']));
  const affiliation = safeStr(pickByAliases_(source, ['소속','affiliation','company','업체명']));
  const phone = normalizePhone(pickByAliases_(source, ['연락처','전화번호','휴대폰','phone','mobile']));
  const teamName = safeStr(pickByAliases_(source, ['팀명','team_name','teamName']));
  const teamNo = safeStr(pickByAliases_(source, ['팀번호','team_no','teamNo','예선팀번호','결선팀번호']));
  const uniqueNo = safeStr(pickByAliases_(source, ['고유번호','unique_no','uniqueNo','참가자번호','선수번호','번호']));
  const prelim = safeStr(pickByAliases_(source, ['예선컵번호','prelim_cup_no','prelimCupNo','예선번호','예선출품번호','예선샘플번호','예선팀번호','예선블라인드번호']));
  const main = safeStr(pickByAliases_(source, ['본선컵번호','main_cup_no','mainCupNo','본선번호','본선출품번호','본선샘플번호','본선팀번호']));
  const final = safeStr(pickByAliases_(source, ['결선컵번호','final_cup_no','finalCupNo','결선번호','결선출품번호','결선샘플번호','결선팀번호','결선참가번호']));
  const cupNo = safeStr(pickByAliases_(source, ['컵번호','cup_no','cupNo','출품번호','예선출품번호','결선출품번호','예선컵번호','결선컵번호']));
  const sampleNo = safeStr(pickByAliases_(source, ['샘플번호','sample_no','sampleNo','예선샘플번호','결선샘플번호']));
  const number = participantNumberFromRow_(source, code);
  const competitionDate = normalizeEffectiveDate_(pickByAliases_(source, ['대회일','대회날짜','경연일','경연날짜','예선일','일자','competition_date','competitionDate','event_date','eventDate','date']));
  const operatingDay = safeStr(pickByAliases_(source, ['운영일차','운영 일차','대회일차','operating_day','operatingDay','schedule_day','scheduleDay']));
  const preparationTime = normalizeParticipantScheduleRange_(pickByAliases_(source, ['준비시간','준비 시간','preparation_time','preparationTime','prep_time','prepTime']));
  const performanceTime = normalizeParticipantScheduleRange_(pickByAliases_(source, ['시연시간','경연시간','로스팅시간','시연 시간','로스팅 시간','performance_time','performanceTime','presentation_time','presentationTime','roasting_time','roastingTime']));
  const cleanupTime = normalizeParticipantScheduleRange_(pickByAliases_(source, ['정리시간','정리 시간','클린업시간','cleanup_time','cleanupTime']));
  const waitingTime = normalizeParticipantScheduleRange_(pickByAliases_(source, ['대기시간','대기 시간','waiting_time','waitingTime']));
  const stationNo = safeStr(pickByAliases_(source, ['로스팅위치','로스팅 위치','로스팅스테이션','로스팅 스테이션','스테이션번호','스테이션 번호','Station No.','station_no','stationNo']));
  const performanceOrder = safeStr(pickByAliases_(source, ['경연순서','경연 순서','시연순서','순서','performance_order','performanceOrder']));
  const extra = {};
  Object.keys(source).forEach(k => { if (safeStr(source[k]) !== '') extra[k] = source[k]; });
  if (competitionDate) extra['대회일'] = competitionDate;
  if (operatingDay) extra['운영일차'] = operatingDay;
  if (preparationTime) extra['준비시간'] = preparationTime;
  if (performanceTime) extra['시연시간'] = performanceTime;
  if (cleanupTime) extra['정리시간'] = cleanupTime;
  if (waitingTime) extra['대기시간'] = waitingTime;
  if (stationNo) extra[code === 'IKRC' ? '로스팅위치' : '스테이션번호'] = stationNo;
  if (performanceOrder) extra['경연순서'] = performanceOrder;
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
    competitionDate,
    operatingDay,
    preparationTime,
    performanceTime,
    cleanupTime,
    waitingTime,
    stationNo,
    performanceOrder,
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
    role: safeStr(pickByAliases_(raw, ['역할','role','judgeRole'], '센서리 심사위원')),
    effectiveDate: normalizeEffectiveDate_(pickByAliases_(raw, ['적용일','권한적용일','심사일','대회일','effective_date','effectiveDate','activeDate','permissionDate'], ''))
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
  const manageCodes = actorManageCodes_(actor);
  const visibleConfigs = hasAdmin(actor) ? cfg.configs : (cfg.configs || []).filter(c => manageCodes.includes(safeStr(c && c.code).toUpperCase()));
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
    const codes = actorManageCodes_(actor);
    if (!codes.length) return { success: true, participants: [] };
    const placeholders = codes.map(() => '?').join(',');
    rs = await env.DB.prepare(`SELECT * FROM participants WHERE competition_code IN (${placeholders}) ORDER BY competition_code, id`).bind(...codes).all();
  }
  const rows = sortParticipantRowsForCompetition_(rs.results || [], code);
  return { success: true, participants: rows.map(participantRowOut_) };
}
function participantScheduleSortMeta_(row) {
  const extra = parseJson(row && row.extra_json, {});
  const date = normalizeEffectiveDate_(extra['대회일'] || extra.competitionDate || extra.competition_date);
  const orderText = safeStr(extra['경연순서'] || extra.performanceOrder || extra.performance_order);
  const order = Number(orderText);
  return {
    scheduled: !!(date && orderText && Number.isFinite(order)),
    date: date || '9999-12-31',
    order: Number.isFinite(order) ? order : 999999,
    waitingTime: safeStr(extra['대기시간'] || extra.waitingTime || extra.waiting_time),
  };
}
function mobActiveParticipantDateFromConfig_(cfg) {
  const options = cfg && cfg.optionSettings && typeof cfg.optionSettings === 'object'
    ? cfg.optionSettings
    : parseJson(cfg && cfg.option_settings, {});
  return normalizeEffectiveDate_(options && (options.mobParticipantDate || options.mobActiveParticipantDate));
}
function mobActiveParticipantUnitsFromRows_(cfg, participantRows, requestedDate = '') {
  const activeDate = normalizeEffectiveDate_(requestedDate) || mobActiveParticipantDateFromConfig_(cfg);
  if (!activeDate) return null;
  const round = normalizeRoundForCompetition_('MOB', cfg && (cfg.current_round || cfg.currentRound) || '예선');
  const units = new Set();
  (participantRows || []).forEach(row => {
    if (participantScheduleSortMeta_(row).date !== activeDate) return;
    const unit = safeStr(participantRoundNumber_(row, 'MOB', round));
    if (unit) units.add(unit);
  });
  return units;
}
function mobParticipantDatesFromRows_(participantRows) {
  return Array.from(new Set((participantRows || []).map(row => participantScheduleSortMeta_(row).date).filter(date => date && date !== '9999-12-31'))).sort();
}
function scopeMobScoreRowsToActiveDate_(code, cfg, participantRows, scoreRows, requestedDate = '') {
  if (safeStr(code).toUpperCase() !== 'MOB') return scoreRows || [];
  const officialRows = (scoreRows || []).filter(row => !isCalibrationMode_(row && row.mode));
  const activeUnits = mobActiveParticipantUnitsFromRows_(cfg, participantRows, requestedDate);
  if (!activeUnits) return officialRows;
  return officialRows.filter(row => activeUnits.has(safeStr(row && row.unit)));
}
function sortParticipantRowsForCompetition_(rows, competitionCode) {
  const requestedCode = safeStr(competitionCode).toUpperCase();
  return (rows || []).slice().sort((a, b) => {
    const aCode = safeStr(a && a.competition_code || requestedCode).toUpperCase();
    const bCode = safeStr(b && b.competition_code || requestedCode).toUpperCase();
    if (aCode !== bCode) return aCode.localeCompare(bCode);
    // MOB와 KBC 참가자 목록은 DB 등록 순서가 아니라 확정 타임테이블 순서로 표시합니다.
    // 특히 KBC는 참가자를 역순으로 일괄 등록해도 관리자 목록과 심사 화면이 경연순서 1번부터 보여야 합니다.
    if (aCode === 'MOB' || aCode === 'KBC') {
      const am = participantScheduleSortMeta_(a);
      const bm = participantScheduleSortMeta_(b);
      if (am.scheduled !== bm.scheduled) return am.scheduled ? -1 : 1;
      if (am.date !== bm.date) return am.date.localeCompare(bm.date);
      if (am.order !== bm.order) return am.order - bm.order;
      if (am.waitingTime !== bm.waitingTime) return am.waitingTime.localeCompare(bm.waitingTime);
    }
    if (aCode === 'IKRC') {
      const aNo = safeStr(a && (a.unique_no || a.prelim_cup_no || a.sample_no));
      const bNo = safeStr(b && (b.unique_no || b.prelim_cup_no || b.sample_no));
      if (aNo !== bNo) return aNo.localeCompare(bNo, 'ko', { numeric:true, sensitivity:'base' });
    }
    return Number(a && a.id || 0) - Number(b && b.id || 0);
  });
}
function participantRowOut_(r) {
  const ex = parseJson(r.extra_json, {});
  return {
    rowIndex: r.id,
    competitionCode: r.competition_code,
    name: r.name || '', affiliation: r.affiliation || '', phone: r.phone || '',
    uniqueNo: r.unique_no || '', prelimCupNo: r.prelim_cup_no || '', mainCupNo: r.main_cup_no || '', finalCupNo: r.final_cup_no || '',
    cupNo: r.cup_no || '', sampleNo: r.sample_no || '', teamName: r.team_name || '', teamNo: r.team_no || '', extra: ex,
    competitionDate: normalizeEffectiveDate_(ex['대회일'] || ex.competitionDate || ex.competition_date),
    operatingDay: safeStr(ex['운영일차'] || ex.operatingDay || ex.operating_day),
    preparationTime: normalizeParticipantScheduleRange_(ex['준비시간'] || ex.preparationTime || ex.preparation_time),
    performanceTime: normalizeParticipantScheduleRange_(ex['시연시간'] || ex['경연시간'] || ex['로스팅시간'] || ex.performanceTime || ex.performance_time || ex.roastingTime || ex.roasting_time),
    cleanupTime: normalizeParticipantScheduleRange_(ex['정리시간'] || ex.cleanupTime || ex.cleanup_time),
    waitingTime: normalizeParticipantScheduleRange_(ex['대기시간'] || ex.waitingTime || ex.waiting_time),
    stationNo: safeStr(r.competition_code === 'IKRC' ? (ex['로스팅위치'] || ex['로스팅스테이션'] || ex['스테이션번호'] || ex.stationNo || ex.station_no) : (ex['스테이션번호'] || ex.stationNo || ex.station_no)),
    performanceOrder: safeStr(ex['경연순서'] || ex.performanceOrder || ex.performance_order),
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
  const participantDateSource = Object.assign({}, payload && payload.extra && typeof payload.extra === 'object' ? payload.extra : {}, payload || {});
  const rawCompetitionDate = safeStr(pickByAliases_(participantDateSource, ['대회일','대회날짜','경연일','경연날짜','예선일','일자','competition_date','competitionDate','event_date','eventDate','date']));
  if (rawCompetitionDate && !data.competitionDate) return { success:false, message:'대회일은 YYYY-MM-DD 형식의 올바른 날짜로 입력해주세요.' };
  let id = Number(payload && (payload.rowIndex || payload.id));
  const bind = [code, data.name, data.affiliation, data.phone, data.uniqueNo, data.prelimCupNo, data.mainCupNo, data.finalCupNo, data.cupNo, data.sampleNo, data.teamName, data.teamNo, JSON.stringify(data.extra || {}), nowIso()];

  // 편집 중 대회 선택이 바뀌거나 오래된 화면의 행 번호가 전달되어도
  // 다른 대회 참가자를 현재 대회로 이동시키지 않습니다. 참가자 행은
  // 생성된 대회 안에서만 수정할 수 있고 대회 변경은 새 행 등록으로 처리합니다.
  if (id) {
    const current = await env.DB.prepare('SELECT competition_code FROM participants WHERE id=?').bind(id).first();
    if (!current) return { success:false, message:'수정할 선수를 찾을 수 없습니다. 목록을 새로고침해주세요.' };
    const currentCode = safeStr(current.competition_code).toUpperCase();
    if (currentCode !== code) {
      return { success:false, message:`${currentCode} 선수는 ${code} 선수로 변경할 수 없습니다. 각 대회에서 별도로 등록해주세요.` };
    }
  }

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
    await env.DB.prepare(`UPDATE participants SET competition_code=?, name=?, affiliation=?, phone=?, unique_no=?, prelim_cup_no=?, main_cup_no=?, final_cup_no=?, cup_no=?, sample_no=?, team_name=?, team_no=?, extra_json=?, updated_at=? WHERE id=? AND competition_code=?`)
      .bind(...bind, id, code).run();
  } else {
    await env.DB.prepare(`INSERT INTO participants (competition_code, name, affiliation, phone, unique_no, prelim_cup_no, main_cup_no, final_cup_no, cup_no, sample_no, team_name, team_no, extra_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(code, data.name, data.affiliation, data.phone, data.uniqueNo, data.prelimCupNo, data.mainCupNo, data.finalCupNo, data.cupNo, data.sampleNo, data.teamName, data.teamNo, JSON.stringify(data.extra || {}), nowIso(), nowIso()).run();
  }
  return { success: true, message: '선수 등록 저장 완료' + (data.competitionDate ? ` · 대회일 ${data.competitionDate}` : ''), competitionDate:data.competitionDate || '' };
}
async function deleteParticipant(env, rowIndex, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor) && !hasTeamLead(actor)) return { success: false, message: '선수 삭제 권한이 없습니다.' };
  const row = await env.DB.prepare('SELECT competition_code FROM participants WHERE id=?').bind(Number(rowIndex)).first();
  if (!row) return { success: false, message: '이미 삭제되었거나 존재하지 않는 선수입니다.' };
  if (row && !hasManageAccess(actor, row.competition_code)) return { success: false, message: '해당 대회 선수 삭제 권한이 없습니다.' };
  await env.DB.prepare('DELETE FROM participants WHERE id=? AND competition_code=?').bind(Number(rowIndex), row.competition_code).run();
  return { success: true, message: '선수 삭제 완료' };
}
function selectiveResetScoreCategory_(row) {
  const storedMode = safeStr(row && row.mode);
  if (storedMode) return isCalibrationMode_(storedMode) ? 'calibration' : 'competition';
  const payload = parseJson(row && row.payload_json, {});
  return isCalibrationMode_(firstNonEmpty([payload.mode, payload.evalMode])) ? 'calibration' : 'competition';
}
async function getSelectiveResetOptions(env, competitionCode, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success:false, message:'선택 삭제는 전체 관리자만 사용할 수 있습니다.' };
  const checked = strictCompetitionCode_(competitionCode, '선택 삭제 조회');
  if (checked.error) return checked.error;
  const code = checked.code;
  const cfg = await env.DB.prepare('SELECT current_round FROM competitions WHERE code=?').bind(code).first();
  const participantResult = await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY id').bind(code).all();
  const participantRows = participantResult.results || [];
  const participants = sortParticipantRowsForCompetition_(participantRows, code).map(row => {
    const out = participantRowOut_(row);
    return {
      participantId:Number(row.id),
      displayNo:safeStr(out.displayNo),
      name:safeStr(out.name || out.teamName),
      affiliation:safeStr(out.affiliation),
      phone:maskPhone_(out.phone)
    };
  });
  const scoreResult = await env.DB.prepare('SELECT id, round, unit, mode, participant_name, submitted_at FROM scores WHERE competition_code=? ORDER BY id DESC').bind(code).all();
  const participantIdx = indexParticipantIdentities_(participantRows, code);
  const groups = new Map();
  (scoreResult.results || []).forEach(row => {
    const round = roundName_(firstNonEmpty([row.round, cfg && cfg.current_round]), '예선');
    const unit = safeStr(row.unit);
    if (!unit) return;
    const category = selectiveResetScoreCategory_(row);
    const key = [round, unit, category].join('::');
    const identity = lookupParticipantIdentity_(participantIdx, round, unit) || {};
    const current = groups.get(key) || {
      round, unit, category, rowCount:0,
      participantName:safeStr(row.participant_name || identity.name || identity.teamName),
      affiliation:safeStr(identity.affiliation), latestSubmittedAt:''
    };
    current.rowCount += 1;
    const submittedAt = safeStr(row.submitted_at);
    if (submittedAt && (!current.latestSubmittedAt || submittedAt > current.latestSubmittedAt)) current.latestSubmittedAt = submittedAt;
    if (!current.participantName) current.participantName = safeStr(row.participant_name || identity.name || identity.teamName);
    if (!current.affiliation) current.affiliation = safeStr(identity.affiliation);
    groups.set(key, current);
  });
  const scoreTargets = Array.from(groups.values()).sort((a,b) => {
    const roundOrder = {결선:1, 본선:2, 예선:3};
    return (roundOrder[a.round] || 9) - (roundOrder[b.round] || 9)
      || safeStr(a.unit).localeCompare(safeStr(b.unit), 'ko', {numeric:true})
      || safeStr(a.category).localeCompare(safeStr(b.category));
  });
  return { success:true, competitionCode:code, participants, scoreTargets };
}
async function deleteSelectedParticipantData(env, payload, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success:false, message:'선수 선택 삭제는 전체 관리자만 사용할 수 있습니다.' };
  const checked = strictCompetitionCode_(payload && payload.competitionCode, '선수 선택 삭제');
  if (checked.error) return checked.error;
  const code = checked.code;
  const participantId = Number(payload && payload.participantId);
  if (!Number.isInteger(participantId) || participantId < 1) return { success:false, message:'삭제할 선수를 선택해주세요.' };
  const row = await env.DB.prepare('SELECT id, name, team_name FROM participants WHERE id=? AND competition_code=?').bind(participantId, code).first();
  if (!row) return { success:false, message:'선택한 대회의 선수를 찾을 수 없습니다. 목록을 새로고침해주세요.' };
  await env.DB.prepare('DELETE FROM participants WHERE id=? AND competition_code=?').bind(participantId, code).run();
  return { success:true, deleted:1, message:`${code} ${safeStr(row.name || row.team_name || '선수')} 등록 1건을 삭제했습니다. 점수와 다른 대회 데이터는 유지했습니다.` };
}
async function deleteSelectiveAuxSessionsForUnit_(env, code, unit) {
  const kinds = code === 'MOB'
    ? ['MOB_CALIBRATION_CHECK']
    : (code === 'IKRC' ? ['IKRC_CALIBRATION_CHECK','IKRC_OFFICIAL_CALIBRATION_CHECK'] : []);
  if (!kinds.length) return 0;
  const placeholders = kinds.map(() => '?').join(',');
  const result = await env.DB.prepare(`SELECT token, payload_json FROM sessions WHERE kind IN (${placeholders})`).bind(...kinds).all();
  let deleted = 0;
  for (const row of (result.results || [])) {
    const data = parseJson(row.payload_json, {});
    const target = safeStr(firstNonEmpty([data.participantNo, data.sampleNo, data.unit, data.cup]));
    if (target !== safeStr(unit)) continue;
    await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(row.token).run();
    deleted++;
  }
  return deleted;
}
async function deleteSelectedScoreData(env, payload, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success:false, message:'점수 선택 삭제는 전체 관리자만 사용할 수 있습니다.' };
  const checked = strictCompetitionCode_(payload && payload.competitionCode, '점수 선택 삭제');
  if (checked.error) return checked.error;
  const code = checked.code;
  const round = roundName_(payload && payload.round, '');
  const unit = safeStr(payload && payload.unit);
  const category = safeStr(payload && payload.category).toLowerCase();
  if (!round || !unit || !['competition','calibration'].includes(category)) return { success:false, message:'삭제할 라운드·참가자코드·평가구분을 다시 선택해주세요.' };
  const result = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? AND round=? AND unit=? ORDER BY id').bind(code, round, unit).all();
  const rows = (result.results || []).filter(row => selectiveResetScoreCategory_(row) === category);
  if (!rows.length) return { success:false, message:'선택한 점수 데이터가 이미 삭제되었거나 존재하지 않습니다.' };
  const receiptTokens = new Set();
  const cfg = code === 'IKRC' ? await env.DB.prepare('SELECT current_round, option_settings FROM competitions WHERE code=?').bind(code).first() : null;
  for (const row of rows) {
    const scorePayload = parseJson(row.payload_json, {});
    const clientSubmissionId = safeStr(scorePayload.clientSubmissionId);
    const identityKey = safeStr(scorePayload.operatorIdentityKey || scorePayload.judgeIdentityKey);
    if (clientSubmissionId && identityKey) {
      const digest = await sha256Hex_([code, clientSubmissionId, identityKey].join('|'));
      receiptTokens.add('SCORE_SUBMISSION_RECEIPT:' + code + ':' + digest);
    }
    if (code === 'IKRC' && category === 'competition') await invalidateIkrcStationFinalizationForScore_(env, row, cfg);
  }
  const ids = rows.map(row => Number(row.id)).filter(Boolean);
  const placeholders = ids.map(() => '?').join(',');
  await env.DB.prepare(`DELETE FROM scores WHERE competition_code=? AND id IN (${placeholders})`).bind(code, ...ids).run();
  for (const token of receiptTokens) await env.DB.prepare("DELETE FROM sessions WHERE token=? AND kind='SCORE_SUBMISSION_RECEIPT'").bind(token).run();
  const auxDeleted = await deleteSelectiveAuxSessionsForUnit_(env, code, unit);
  return {
    success:true, deleted:ids.length, receiptDeleted:receiptTokens.size, auxiliaryDeleted:auxDeleted,
    message:`${code} ${round} ${unit}의 ${category === 'calibration' ? '켈리브레이션' : '대회평가'} 점수 ${ids.length}건을 삭제했습니다. 선수등록과 다른 대회 데이터는 유지했습니다.`
  };
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
    const rs = await env.DB.prepare("SELECT token FROM sessions WHERE kind IN ('IKRC_CALIBRATION_CHECK','IKRC_OFFICIAL_CALIBRATION_CHECK','IKRC_STATION_FINALIZATION','IKRC_SEED_MATCH','IKRC_SEED_RESULT')").all();
    for (const row of (rs.results || [])) { await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(row.token).run(); sessionDeleted++; }
  }
  const receiptRows = await env.DB.prepare("SELECT token FROM sessions WHERE kind='SCORE_SUBMISSION_RECEIPT' AND token LIKE ?")
    .bind('SCORE_SUBMISSION_RECEIPT:' + code + ':%').all();
  for (const row of (receiptRows.results || [])) { await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(row.token).run(); sessionDeleted++; }
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
    try {
      const saved = await upsertParticipant(env, data, actor);
      if (saved && saved.success) ok++;
      else { skipped++; errors.push((i+2) + '행: ' + safeStr(saved && saved.message || '등록 실패')); }
    }
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
    try {
      const saved = await upsertOperatorAccount(env, data, actor);
      if (saved && saved.success) ok++;
      else { skipped++; errors.push((i+2) + '행: ' + safeStr(saved && saved.message || '등록 실패')); }
    }
    catch(e) { skipped++; errors.push((i+2) + '행: ' + String(e && e.message || e)); }
  }
  return { success: true, message: `심사위원/운영자 ${ok}건 등록, ${skipped}건 제외`, imported: ok, skipped, errors: errors.slice(0,20) };
}
async function applyOperatorDateSchedule(env, payload, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success:false, message:'날짜별 권한 일괄 적용은 전체 관리자만 가능합니다.' };
  const code = safeStr(payload && payload.competitionCode).toUpperCase();
  if (!COMPETITION_CODES.includes(code) || code === 'ALL') return { success:false, message:'날짜별 권한을 적용할 대회코드를 확인해주세요.' };
  const entries = Array.isArray(payload && payload.entries) ? payload.entries.slice(0, 100) : [];
  if (!entries.length) return { success:false, message:'적용할 날짜별 권한이 없습니다.' };
  const rs = await env.DB.prepare('SELECT * FROM operators ORDER BY id').all();
  const allRows = rs.results || [];
  let applied = 0;
  const missing = [], errors = [];
  for (const entry of entries) {
    const name = safeStr(entry && entry.name);
    const effectiveDate = normalizeEffectiveDate_(entry && entry.effectiveDate);
    const role = safeStr(entry && entry.role);
    const teamGroup = safeStr(entry && entry.teamGroup);
    if (!name || !effectiveDate || !role || !teamGroup) { errors.push((name || '이름 없음') + ': 날짜·역할·팀 정보 불완전'); continue; }
    const candidates = allRows.filter(row => normalizePersonName_(row.name) === normalizePersonName_(name) && !operatorIsAdminRow_(row) && accessCodes_(row.access || '').some(value => value === 'ALL' || value === code));
    const base = candidates.find(row => !normalizeEffectiveDate_(row.effective_date || '')) || candidates[0];
    if (!base || !normalizePhone(base.phone)) { missing.push(name); continue; }
    const phone = normalizePhone(base.phone);
    const existing = await env.DB.prepare(`SELECT id FROM operators WHERE name=? AND phone=? AND COALESCE(access,'')=? AND COALESCE(effective_date,'')=? ORDER BY id LIMIT 1`)
      .bind(base.name || name, phone, code, effectiveDate).first();
    if (existing && existing.id) {
      await env.DB.prepare(`UPDATE operators SET account_type='JUDGE', affiliation=?, team_group=?, role=?, effective_date=?, updated_at=? WHERE id=?`)
        .bind(base.affiliation || '', teamGroup, role, effectiveDate, nowIso(), existing.id).run();
    } else {
      await env.DB.prepare(`INSERT INTO operators (account_type, name, affiliation, phone, access, team_group, role, effective_date, created_at, updated_at) VALUES ('JUDGE', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(base.name || name, base.affiliation || '', phone, code, teamGroup, role, effectiveDate, nowIso(), nowIso()).run();
    }
    applied++;
  }
  return {
    success:true,
    message:`${code} 날짜별 권한 ${applied}건 적용 완료` + (missing.length ? ` · 기존 계정을 찾지 못한 심사위원 ${missing.length}명` : '') + (errors.length ? ` · 제외 ${errors.length}건` : ''),
    applied,
    missing:Array.from(new Set(missing)),
    errors:errors.slice(0, 20)
  };
}
async function bulkApplyOperatorEffectiveDate(env, payload, actorArg) {
  const actor = await getActor(env, actorArg);
  if (!actor || (!hasAdmin(actor) && !hasTeamLead(actor))) return { success:false, message:'날짜별 권한 저장 권한이 없습니다.' };
  const code = safeStr(payload && payload.competitionCode).toUpperCase();
  if (!COMPETITION_CODES.includes(code)) return { success:false, message:'심사 적용일을 저장할 대회를 확인해주세요.' };
  if (!hasManageAccess(actor, code)) return { success:false, message:code + ' 심사 적용일 관리 권한이 없습니다.' };
  const effectiveDate = normalizeEffectiveDate_(payload && payload.effectiveDate);
  if (!effectiveDate) return { success:false, message:'심사 적용일을 올바른 날짜로 선택해주세요.' };
  const teamGroupOverride = registryScheduleText_(payload && payload.teamGroupOverride, 40);
  const ids = Array.from(new Set((Array.isArray(payload && payload.rowIndexes) ? payload.rowIndexes : [])
    .map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0))).slice(0, 200);
  if (!ids.length) return { success:false, message:'날짜를 적용할 계정을 한 명 이상 선택해주세요.' };

  const placeholders = ids.map(() => '?').join(',');
  const rs = await env.DB.prepare(`SELECT * FROM operators WHERE id IN (${placeholders}) ORDER BY id`).bind(...ids).all();
  const sourceRows = rs.results || [];
  if (sourceRows.length !== ids.length) return { success:false, message:'선택한 계정 목록이 변경되었습니다. 목록을 새로고침한 뒤 다시 시도해주세요.' };
  const selectedIdentityKeys = new Set();
  for (const row of sourceRows) {
    if (operatorIsAdminRow_(row)) return { success:false, message:'관리자 계정에는 심사 적용일을 지정할 수 없습니다.' };
    const rowCodes = accessCodes_(row.access || '');
    if (!rowCodes.includes(code)) return { success:false, message:'선택한 계정 중 현재 대회와 다른 권한이 포함되어 있습니다.' };
    const identityKey = operatorIdentityKey_(row.name, row.phone);
    if (identityKey && selectedIdentityKeys.has(identityKey)) return { success:false, message:`${row.name || '동일 계정'}의 서로 다른 날짜 역할이 동시에 선택되었습니다. 적용할 역할 한 행만 체크해주세요.` };
    if (identityKey) selectedIdentityKeys.add(identityKey);
  }

  const timestamp = nowIso();
  let created = 0, updated = 0;
  for (const source of sourceRows) {
    const assignedTeamGroup = teamGroupOverride || source.team_group || '';
    const existing = await env.DB.prepare(`SELECT id FROM operators WHERE name=? AND phone=? AND COALESCE(access,'')=? AND COALESCE(effective_date,'')=? ORDER BY id LIMIT 1`)
      .bind(source.name || '', normalizePhone(source.phone), code, effectiveDate).first();
    if (existing && Number(existing.id) === Number(source.id)) {
      await env.DB.prepare('UPDATE operators SET team_group=?, updated_at=? WHERE id=?').bind(assignedTeamGroup, timestamp, source.id).run();
      updated++;
    } else if (existing && existing.id) {
      await env.DB.prepare(`UPDATE operators SET account_type=?, affiliation=?, team_group=?, role=?, updated_at=? WHERE id=?`)
        .bind(source.account_type || 'JUDGE', source.affiliation || '', assignedTeamGroup, source.role || '', timestamp, existing.id).run();
      updated++;
    } else {
      await env.DB.prepare(`INSERT INTO operators (account_type, name, affiliation, phone, access, team_group, role, effective_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(source.account_type || 'JUDGE', source.name || '', source.affiliation || '', normalizePhone(source.phone), code, assignedTeamGroup, source.role || '', effectiveDate, timestamp, timestamp).run();
      created++;
    }
  }
  return {
    success:true,
    message:`${code} ${effectiveDate} 심사 적용일 저장 완료 · 새 날짜 권한 ${created}건 / 갱신 ${updated}건`,
    effectiveDate,
    applied:sourceRows.length,
    created,
    updated
  };
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
    '대회코드,계정유형,심사위원명,소속,연락처,역할,평가팀,적용일',
    'ALL,ADMIN,총괄관리자,KCL,01012345678,관리자,,',
    'KCR,JUDGE,홍심사,로스터리,01011112222,센서리 심사위원,A,',
    'MOB,JUDGE,김헤드,더컵,01022223333,센서리 헤드 심사위원,A조,2026-08-06',
    'KTCC,STAFF,운영진,KCL,01033334444,운영진,1번 테이블,'
  ].join('\n');
  return { success: true, templates: { participants: participantCsv, operators: operatorCsv } };
}


function participantRoundNumber_(r, code, round) {
  const normalized = normalizeRoundForCompetition_(code, round || '예선');
  if (normalized === '예선') return r.prelim_cup_no || r.cup_no || r.sample_no || r.team_no || r.unique_no || String(r.id);
  if (normalized === '본선') return r.main_cup_no || r.prelim_cup_no || r.cup_no || r.sample_no || r.team_no || r.unique_no || String(r.id);
  // 블라인드 출품/샘플 대회는 결선 코드가 없을 때 예선 코드를 재사용하면 다른 선수에게
  // 점수가 연결될 수 있으므로 결선 배정을 명시적으로 완료해야 합니다.
  if (code === 'KCR' || code === 'IKRC') return r.final_cup_no || '';
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
    if (code === 'IKRC') {
      const blindAssignments = extra && extra.ikrcBlindAssignments;
      if (blindAssignments && typeof blindAssignments === 'object' && !Array.isArray(blindAssignments)) {
        Object.keys(blindAssignments).forEach(round => put(normalizeRoundForCompetition_('IKRC', round), blindAssignments[round], identity));
      }
    }
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
  const cfg = await env.DB.prepare('SELECT current_round, option_settings FROM competitions WHERE code=?').bind(code).first();
  const currentRound = normalizeRoundForCompetition_(code, cfg && cfg.current_round || '예선');
  const rows = await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY id').bind(code).all();
  const policy = participantRoundPolicy_(code, currentRound);
  const canSeeIdentity = actorCanSeeParticipantIdentity_(actor, code);
  const hideIdentity = !!(policy.identityHidden && !canSeeIdentity);
  const sourceRows = sortParticipantRowsForCompetition_(rows.results || [], code);
  const mobManager = code === 'MOB' && hasManageAccess(actor, code);
  const mobPermissionRows = code === 'MOB' && Array.isArray(actor && actor.operatorRows)
    ? actor.operatorRows.filter(row => accessCodes_(row && row.access).some(value => value === 'ALL' || value === 'MOB'))
    : [];
  const mobDatedPermission = !mobManager && mobPermissionRows.some(row => !!normalizeEffectiveDate_(row && (row.effectiveDate || row.effective_date)));
  const mobPermissionDate = normalizeEffectiveDate_(actor && actor.permissionDate) || koreaDateKey_();
  const mobActiveParticipantDate = code === 'MOB' ? mobActiveParticipantDateFromConfig_(cfg) : '';
  const mobParticipantScopeDate = mobActiveParticipantDate || (mobDatedPermission ? mobPermissionDate : '');
  const mobActorTeam = safeStr(actor && actor.teamMap && actor.teamMap.MOB || actor && (actor.teamGroup || actor.team));
  const scopedRows = code !== 'MOB' || mobManager ? sourceRows : sourceRows.filter(r => {
    const extra = parseJson(r.extra_json, {});
    const participantDate = normalizeEffectiveDate_(extra['대회일'] || extra.competitionDate || extra.competition_date || extra['예선일'] || extra['날짜']);
    const participantTeam = safeStr(extra['심사조'] || extra.judgeTeam || extra.teamGroup || extra['평가조']);
    if (mobParticipantScopeDate && participantDate !== mobParticipantScopeDate) return false;
    if (mobActorTeam && participantTeam && !mobTeamMatchesServer_(mobActorTeam, participantTeam)) return false;
    return true;
  });
  const assignments = scopedRows.map(r => {
    const extra = parseJson(r.extra_json, {});
    const competitionDate = normalizeEffectiveDate_(extra['대회일'] || extra.competitionDate || extra.competition_date || extra['예선일'] || extra['날짜']);
    const operatingDay = safeStr(extra['\uC6B4\uC601\uC77C\uCC28'] || extra.operatingDay || extra.scheduleDay);
    const scheduleTeam = safeStr(extra['심사조'] || extra.judgeTeam || extra.teamGroup || extra['평가조']);
    const scheduleLabel = competitionDate || operatingDay;
    const number = participantRoundNumber_(r, code, currentRound);
    const rawName = code === 'KTCC' ? (r.team_name || r.name || '') : (r.name || '');
    const displayName = hideIdentity ? '' : rawName;
    const displayAff = hideIdentity ? '' : (r.affiliation || '');
    const prefix = policy.numberLabel || (code === 'KTCC' ? '팀번호' : '참가자번호');
    const assignment = {
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
      competitionDate,
      operatingDay,
      scheduleTeam,
      display: (scheduleLabel ? (scheduleLabel + ' · ') : '') + (scheduleTeam ? (scheduleTeam + ' · ') : '') + (number ? (prefix + ' ' + number) : (prefix + ' 미지정')) + (displayName ? ' · ' + displayName : '') + (displayAff ? ' · ' + displayAff : '') + (hideIdentity ? ' · 블라인드' : '')
    };
    if (code === 'IKRC' && hideIdentity) {
      return {
        competitionCode:code,
        currentRound,
        number,
        numberLabel:prefix,
        displayMode:policy.mode,
        identityHidden:true,
        directInput:false,
        display:(number ? (prefix + ' ' + number) : (prefix + ' 미지정')) + ' · 블라인드'
      };
    }
    return assignment;
  });
  return {
    success: true,
    competitionCode: code,
    currentRound,
    policy,
    assignments,
    scheduleScope: code === 'MOB' && !mobManager ? { competitionDate:mobParticipantScopeDate, team:mobActorTeam } : null
  };
}

function ikrcAssignmentFieldForRound_(round) {
  return ikrcStationRoundKeyServer_(round) === '결선' ? 'final_cup_no' : 'prelim_cup_no';
}
function ikrcBlindAssignmentsFromRow_(row) {
  const extra = parseJson(row && row.extra_json, {});
  const stored = extra && extra.ikrcBlindAssignments;
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? Object.assign({}, stored) : {};
}
function ikrcBlindUnitFromRow_(row, round, allowed) {
  const normalizedRound = normalizeRoundForCompetition_('IKRC', round || '예선');
  const map = ikrcBlindAssignmentsFromRow_(row);
  const stored = safeStr(map[normalizedRound]).toUpperCase().replace(/\s+/g, '');
  if (Object.prototype.hasOwnProperty.call(map, normalizedRound)) return stored && (!allowed || allowed.has(stored)) ? stored : '';
  const legacyField = ikrcAssignmentFieldForRound_(normalizedRound);
  const legacy = safeStr(row && row[legacyField]).toUpperCase().replace(/\s+/g, '');
  return legacy && (!allowed || allowed.has(legacy)) ? legacy : '';
}
function ikrcUnitsForStationsServer_(stations) {
  const rows = [];
  (stations || []).forEach(station => {
    for (let no=Number(station.start); no<=Number(station.end); no++) {
      rows.push({ stationId:station.id, stationLabel:station.label, prefix:station.prefix, unit:`${station.prefix}-${no}` });
    }
  });
  return rows;
}
async function getIkrcBlindAssignments(env, actorArg) {
  const auth = await requireManageActorForCode_(env, actorArg, 'IKRC', 'IKRC 블라인드 배정은 관리자 또는 IKRC 대회팀장만 확인할 수 있습니다.');
  if (!auth.ok) return auth.res;
  const cfg = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind('IKRC').first();
  if (!cfg) return { success:false, message:'IKRC 대회 설정을 찾을 수 없습니다.' };
  const round = normalizeRoundForCompetition_('IKRC', cfg.current_round || '예선');
  const field = ikrcAssignmentFieldForRound_(round);
  const stations = ikrcStationsForPurposeServer_(cfg, round, 'competition');
  const units = ikrcUnitsForStationsServer_(stations);
  const allowed = new Set(units.map(item => item.unit));
  const rows = await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY name, id').bind('IKRC').all();
  const participants = (rows.results || []).map(row => {
    const storedMap = ikrcBlindAssignmentsFromRow_(row);
    const storedUnit = safeStr(storedMap[round]).toUpperCase().replace(/\s+/g, '');
    const legacyUnit = safeStr(row[field]).toUpperCase().replace(/\s+/g, '');
    const unit = Object.prototype.hasOwnProperty.call(storedMap, round) ? storedUnit : legacyUnit;
    return {
      participantId:Number(row.id),
      name:row.name || '',
      affiliation:row.affiliation || '',
      currentUnit:unit,
      validUnit:!unit || allowed.has(unit),
      stationId:(units.find(item => item.unit === unit) || {}).stationId || ''
    };
  });
  return {
    success:true,
    competitionCode:'IKRC',
    currentRound:round,
    stations,
    units,
    participants,
    assignedCount:participants.filter(item => item.currentUnit && item.validUnit).length,
    unassignedCount:participants.filter(item => !item.currentUnit || !item.validUnit).length
  };
}
async function saveIkrcStationSettings(env, payload, actorArg) {
  const auth = await requireManageActorForCode_(env, actorArg, 'IKRC', 'IKRC 스테이션 설정 저장은 관리자 또는 IKRC 대회팀장만 가능합니다.');
  if (!auth.ok) return auth.res;
  const cfg = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind('IKRC').first();
  if (!cfg) return { success:false, message:'IKRC 대회 설정을 찾을 수 없습니다.' };
  const round = normalizeRoundForCompetition_('IKRC', cfg.current_round || '예선');
  const requestedRound = normalizeRoundForCompetition_('IKRC', payload && payload.currentRound || round);
  if (requestedRound !== round) return { success:false, message:'IKRC 진행 라운드가 변경되었습니다. 스테이션 화면을 새로 열어주세요.' };
  const normalized = normalizeIkrcStationListServer_(payload && payload.stations, true);
  if (!normalized.ok) return { success:false, message:normalized.message };

  const currentOptions = parseJson(cfg.option_settings, {});
  const currentRaw = currentOptions.ikrcStations && typeof currentOptions.ikrcStations === 'object' ? currentOptions.ikrcStations : {};
  const roundKey = ikrcStationRoundKeyServer_(round);
  const byRound = Object.assign({}, currentRaw.byRound && typeof currentRaw.byRound === 'object' ? currentRaw.byRound : {});
  byRound[roundKey] = normalized.list;
  const candidate = Object.assign({}, currentRaw, {
    byRound,
    stations:normalized.list,
    station1Prefix:normalized.list[0] ? normalized.list[0].prefix : 'A',
    station2Prefix:normalized.list[1] ? normalized.list[1].prefix : 'B'
  });
  const checked = validateIkrcStationOptionSettings_(candidate, round);
  if (!checked.ok) return { success:false, message:checked.message };

  const before = ikrcStationSettingsServer_(cfg, round);
  const stationChanged = ikrcStationFingerprintServer_(before) !== ikrcStationFingerprintServer_(checked.list);
  const scoreCountRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE competition_code=? AND round=?').bind('IKRC', round).first();
  const preservedScoreCount = Number(scoreCountRow && scoreCountRow.n || 0);
  const field = ikrcAssignmentFieldForRound_(round);
  const participantRows = await env.DB.prepare(`SELECT ${field} AS unit FROM participants WHERE competition_code=?`).bind('IKRC').all();
  const allowedUnits = new Set(ikrcUnitsForStationsServer_(checked.list).map(item => item.unit));
  const invalidAssignmentCount = (participantRows.results || []).filter(row => safeStr(row.unit) && !allowedUnits.has(safeStr(row.unit).toUpperCase().replace(/\s+/g, ''))).length;

  if (stationChanged) {
    const nextOptions = Object.assign({}, currentOptions, { ikrcStations:checked.settings });
    await env.DB.prepare('UPDATE competitions SET option_settings=?, updated_at=? WHERE code=?')
      .bind(JSON.stringify(nextOptions), nowIso(), 'IKRC').run();
    // 스테이션 범위가 달라지면 이전 범위의 최종확정 기록은 더 이상 유효하지 않다.
    await env.DB.prepare("DELETE FROM sessions WHERE kind='IKRC_STATION_FINALIZATION'").run();
  }
  let message = stationChanged ? `IKRC ${round} 스테이션 설정 저장 완료` : '변경된 IKRC 스테이션 설정이 없습니다.';
  if (stationChanged && preservedScoreCount) message += `. 기존 평가 ${preservedScoreCount}건은 삭제하지 않고 보존했습니다`;
  if (invalidAssignmentCount) message += `. 현재 범위를 벗어난 선수 배정 ${invalidAssignmentCount}명은 미배정으로 표시됩니다`;
  return {
    success:true,
    message,
    currentRound:round,
    stations:checked.list,
    stationChanged,
    preservedScoreCount,
    invalidAssignmentCount
  };
}
async function saveIkrcBlindAssignments(env, payload, actorArg) {
  const auth = await requireManageActorForCode_(env, actorArg, 'IKRC', 'IKRC 블라인드 배정 저장은 관리자 또는 IKRC 대회팀장만 가능합니다.');
  if (!auth.ok) return auth.res;
  const cfg = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind('IKRC').first();
  if (!cfg) return { success:false, message:'IKRC 대회 설정을 찾을 수 없습니다.' };
  const round = normalizeRoundForCompetition_('IKRC', cfg.current_round || '예선');
  const requestedRound = normalizeRoundForCompetition_('IKRC', payload && payload.currentRound || round);
  if (requestedRound !== round) return { success:false, message:'IKRC 진행 라운드가 변경되었습니다. 블라인드 배정 화면을 새로 열어주세요.' };
  const field = ikrcAssignmentFieldForRound_(round);
  const stations = ikrcStationsForPurposeServer_(cfg, round, 'competition');
  const allowed = new Set(ikrcUnitsForStationsServer_(stations).map(item => item.unit));
  const participantRows = await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY id').bind('IKRC').all();
  const existing = participantRows.results || [];
  if (!existing.length) return { success:false, message:'등록된 IKRC 선수가 없습니다. 선수 등록 후 블라인드 코드를 배정해주세요.' };
  const incoming = Array.isArray(payload && payload.assignments) ? payload.assignments : [];
  const byId = new Map();
  for (const item of incoming) {
    const participantId = Number(item && item.participantId);
    const unit = safeStr(item && item.unit).toUpperCase().replace(/\s+/g, '');
    if (!participantId || byId.has(participantId)) return { success:false, message:'블라인드 배정에 중복된 선수 정보가 있습니다. 화면을 새로고침해주세요.' };
    if (unit && !allowed.has(unit)) return { success:false, message:`현재 스테이션 범위에 없는 코드입니다: ${unit}` };
    byId.set(participantId, unit);
  }
  const existingIds = new Set(existing.map(row => Number(row.id)));
  if (byId.size !== existing.length || Array.from(byId.keys()).some(id => !existingIds.has(id))) {
    return { success:false, message:'선수 등록 목록이 변경되었습니다. 블라인드 배정 화면을 새로 열어 다시 저장해주세요.' };
  }
  const usedUnits = new Set();
  for (const unit of byId.values()) {
    if (!unit) continue;
    if (usedUnits.has(unit)) return { success:false, message:`동일한 블라인드 코드가 두 선수에게 배정되었습니다: ${unit}` };
    usedUnits.add(unit);
  }
  const changed = existing.filter(row => ikrcBlindUnitFromRow_(row, round, allowed) !== safeStr(byId.get(Number(row.id))).toUpperCase());
  if (changed.length) {
    const scoreCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE competition_code=? AND round=?').bind('IKRC', round).first();
    if (Number(scoreCount && scoreCount.n || 0) > 0) {
      const remapped = changed.filter(row => {
        const oldUnit = ikrcBlindUnitFromRow_(row, round, allowed);
        const newUnit = safeStr(byId.get(Number(row.id))).toUpperCase();
        return oldUnit && oldUnit !== newUnit;
      });
      if (remapped.length) {
        return { success:false, message:`${round} IKRC 평가 기록과 이미 연결된 블라인드코드는 다른 선수로 변경할 수 없습니다. 처음 연결되지 않은 코드만 추가로 연결할 수 있습니다.` };
      }
    }
  }
  const updatedAt = nowIso();
  const statements = changed.map(row => {
    const extra = parseJson(row.extra_json, {});
    const map = ikrcBlindAssignmentsFromRow_(row);
    const nextUnit = byId.get(Number(row.id)) || '';
    map[round] = nextUnit;
    extra.ikrcBlindAssignments = map;
    return env.DB.prepare("UPDATE participants SET extra_json=?, updated_at=? WHERE id=? AND competition_code='IKRC'")
      .bind(JSON.stringify(extra), updatedAt, Number(row.id));
  });
  if (statements.length) await env.DB.batch(statements);
  return {
    success:true,
    message:`IKRC ${round} 블라인드 배정 저장 완료: ${usedUnits.size}명 배정 / ${existing.length - usedUnits.size}명 미배정`,
    assignedCount:usedUnits.size,
    unassignedCount:existing.length - usedUnits.size,
    currentRound:round
  };
}


function expectedHeadersForCompetition(code) {
  const meta = ['제출시간','대회코드','라운드','심사위원명','팀','역할','모드'];
  code = safeStr(code).toUpperCase();
  let data = [];
  if (code === 'KCR') data = [
    '컵번호','프로세스',
    'Flavor(플레이버)','Flavor 강도','Flavor 코멘트','Flavor 자동생성상태','Flavor 스마트태그',
    'Aftertaste(에프터테이스트)','Aftertaste 지속성','Aftertaste 코멘트','Aftertaste 자동생성상태','Aftertaste 스마트태그','Aftertaste 플레이버참조 스마트태그',
    'Acidity(산미)','Acidity 강도','Acidity 코멘트','Acidity 자동생성상태','Acidity 스마트태그',
    'Sweetness(단맛) ×2','Sweetness 강도','Sweetness 코멘트','Sweetness 자동생성상태','Sweetness 스마트태그',
    'Mouthfeel(마우스필)','Mouthfeel 강도','Mouthfeel 코멘트','Mouthfeel 자동생성상태','Mouthfeel 스마트태그',
    'Overall(오버롤)','종합코멘트','총점','실격여부','실격사유','검수상태',
    '정규화점수','공식점수','순위반영점수','정규화메모','종합코멘트 사용여부'
  ];
  else if (code === 'KCAC') data = ['참가자번호','선수명','우유종류','잔용도','우유명','예선 Pattern Completion(패턴 완성도)','예선 Pattern Symmetry & Balance(대칭과 균형)','예선 Surface Quality(표면 품질)','예선 Position & Proportion(위치와 비율)','예선 Pattern Definition(패턴 선명도)','결선 Theme Expression(주제 표현력)','결선 Technical Execution(작업 수행 완성도)','결선 Cleanliness(청결)','결선 Taste Balance(맛의 균형)','결선 Mouthfeel(질감)','결선 Presentation(프레젠테이션)','결선 Surface Quality(표면 품질)','결선 Position & Symmetry(위치와 대칭)','결선 Design Completion(디자인 완성도)','소계','감점','최종점수','가이드URL','종합코멘트','실격여부','실격사유','검수상태','패턴종류','리프수','리프수감점','시간감점','예선 Pattern Completion 스마트태그','예선 Pattern Symmetry & Balance 스마트태그','예선 Surface Quality 스마트태그','예선 Position & Proportion 스마트태그','예선 Pattern Definition 스마트태그','결선 Theme Expression 스마트태그','결선 Technical Execution 스마트태그','결선 Cleanliness 스마트태그','결선 Taste Balance 스마트태그','결선 Mouthfeel 스마트태그','결선 Presentation 스마트태그','결선 Surface Quality 스마트태그','결선 Position & Symmetry 스마트태그','결선 Design Completion 스마트태그','예선영상URL','제출영상URL','영상제출확인','패턴스크린샷개수','미디어불러오기방식','미디어파일명'];
  else if (code === 'KBC') data = ['참가자번호','Service Professionalism(서비스의 전문성)','Espresso Taste & Design(맛과 설계) ×2','Espresso Clean Cup(클린컵)','Espresso Mouthfeel(마우스필)','Espresso Flavor(플레이버)','Espresso Total','Signature Taste & Design(맛과 설계) ×2','Signature Clean Cup(클린컵)','Signature Mouthfeel(마우스필)','Signature Flavor(플레이버)','Signature Total','Machine & Equipment Professionalism(머신 및 기물 운용 전문성)','시간감점','총점','종합코멘트','실격여부','실격사유','검수상태','선수명','경기시간','Service Professionalism 코멘트','Espresso Taste & Design 코멘트','Espresso Clean Cup 코멘트','Espresso Mouthfeel 코멘트','Espresso Flavor 코멘트','Signature Taste & Design 코멘트','Signature Clean Cup 코멘트','Signature Mouthfeel 코멘트','Signature Flavor 코멘트','Machine & Equipment Professionalism 코멘트','Service Professionalism 스마트태그','Espresso Taste & Design 스마트태그','Espresso Clean Cup 스마트태그','Espresso Mouthfeel 스마트태그','Espresso Flavor 스마트태그','Signature Taste & Design 스마트태그','Signature Clean Cup 스마트태그','Signature Mouthfeel 스마트태그','Signature Flavor 스마트태그','Machine & Equipment Professionalism 스마트태그'];
  else if (code === 'MOB') data = ['참가자번호','메뉴','Pre-Service Station(시연 전 작업대)','Service Station(시연 중 작업대)','Post-Service Station(시연 후 작업대)','Sweetness(스윗니스)','Flavor(플레이버)','Balance(균형)','Clean Cup(클린컵)','Mouthfeel(질감)','Professionalism(시연 전문성)','Creative Form & Usability(형태와 용이성)','Creative Flavor(창작 향미)','Creative Balance(균형)','Creative Mouthfeel(질감)','Creative Professionalism(전문성과 독창성)','총점','종합코멘트','실격여부','실격사유','검수상태','Pre-Service Station 코멘트','Service Station 코멘트','Post-Service Station 코멘트','Sweetness 코멘트','Flavor 코멘트','Balance 코멘트','Clean Cup 코멘트','Mouthfeel 코멘트','Professionalism 코멘트','Creative Form & Usability 코멘트','Creative Flavor 코멘트','Creative Balance 코멘트','Creative Mouthfeel 코멘트','Creative Professionalism 코멘트','시간감점','경기시간','선수명','Pre-Service Station 스마트태그','Service Station 스마트태그','Post-Service Station 스마트태그','Sweetness 스마트태그','Flavor 스마트태그','Balance 스마트태그','Clean Cup 스마트태그','Mouthfeel 스마트태그','Professionalism 스마트태그','Creative Form & Usability 스마트태그','Creative Flavor 스마트태그','Creative Balance 스마트태그','Creative Mouthfeel 스마트태그','Creative Professionalism 스마트태그','Signature Technical Pre-Service Station(창작음료 시연 전 작업대)','Signature Technical Service Station(창작음료 시연 중 작업대)','Signature Technical Ingredient Use(부재료 사용의 적절함)','Signature Technical Post-Service Station(창작음료 시연 후 작업대)','Signature Technical Pre-Service Station 코멘트','Signature Technical Service Station 코멘트','Signature Technical Ingredient Use 코멘트','Signature Technical Post-Service Station 코멘트','Signature Technical Pre-Service Station 스마트태그','Signature Technical Service Station 스마트태그','Signature Technical Ingredient Use 스마트태그','Signature Technical Post-Service Station 스마트태그','테크니컬 총점','센서리 총점','창작메뉴 총점','감점 전 합산','감점 적용 후 점수','순위 반영점수','총평가 반영점수'];
  else if (code === 'IKRC') data = ['샘플번호','Flavor(플레이버) ×3','Flavor 강도','Clean Cup(클린컵) ×2','Clean Cup 강도','Sweetness(스윗니스) ×2','Sweetness 강도','Acidity(산미)','Acidity 강도','Mouthfeel(마우스필) ×2','Mouthfeel 강도','종합코멘트','총점','실격여부','검수상태','참가자 번호','선수명','Seed to Cup 가산점','Seed to Cup 메모','최종점수','Flavor 스마트태그','Clean Cup 스마트태그','Sweetness 스마트태그','Acidity 스마트태그','Mouthfeel 스마트태그','실격사유','스테이션ID','스테이션','스테이션코드'];
  else if (code === 'MOC') data = ['참가자번호','평가구분','정답수','가산점','총점','종료시간','서명','실격여부','실격사유','검수상태','Section1 지정국가','Section2 지정국가','Section1 농장','Section1 발효방식','Section2 농장','Section2 발효방식','선수명'];
  else if (code === 'KTCC') data = ['팀번호','팀명','Section1 주제','Section1 선택컵','Section1 정답수','Section2 주제','Section2 선택컵','Section2 정답수','Section3 주제','Section3 선택컵','Section3 정답수','Section3 가산점','총점','종료시간','서명','실격여부','실격사유','검수상태','토너먼트 단계','매치번호','상대팀','진출판정','Section1 전체오답(Y/N)','Section1 전체오답사유','Section1 원기록 정답수','Section2 전체오답(Y/N)','Section2 전체오답사유','Section2 원기록 정답수','Section3 전체오답(Y/N)','Section3 전체오답사유','Section3 원기록 정답수'];
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
function ikrcSeedBonusFromValue_(v) {
  const n = toNumber(v);
  if (n === null || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, Math.round(n)));
}
function ikrcSeedBonusFromExtra_(extra) {
  return ikrcSeedBonusFromValue_(firstNumberFromKeys_(extra, ['Seed to Cup 가산점','SeedToCup Bonus','시드투컵 가산점']));
}
function isDisqualifiedValue_(v) {
  const s = safeStr(v).replace(/\s/g, '');
  return v === true || /^(Y|YES|TRUE|1|실격)$/i.test(s);
}

function isExplicitNonDisqualifiedValue_(v) {
  const s = safeStr(v).replace(/\s/g, '');
  return v === false || /^(N|NO|FALSE|0|정상|해제|비실격|없음|공란|-|)$/i.test(s);
}
function ktccSectionMarkedWrong_(extra, n) {
  const raw = firstNonEmpty([
    extra && extra['Section' + n + ' 전체오답(Y/N)'],
    extra && extra['Section' + n + ' 전체오답'],
    extra && extra['Section' + n + ' 무효'],
    extra && extra['Section' + n + ' 판정'],
    extra && extra['Section' + n + ' 전체오답사유']
  ]);
  if (!raw || isExplicitNonDisqualifiedValue_(raw)) return false;
  const s = safeStr(raw).replace(/\s/g, '');
  return /^(Y|YES|TRUE|1|O|전체오답|세션전체오답|무효|오답)$/i.test(s) || /전체오답|세션오답|제출개수|구획|이탈|쏟|spill|wrong/i.test(s);
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
function ikrcOfficialHeadItem_(code, item) {
  return safeStr(code).toUpperCase() === 'IKRC'
    && item
    && !isCalibrationMode_(item['모드'] || item.mode)
    && isHeadRole_(item['역할'] || item.role || item.judgeRole);
}
function officialReviewCompleted_(code, item) {
  const normalizedCode = safeStr(code).toUpperCase();
  if (normalizedCode === 'IKRC' && item && !isCalibrationMode_(item['모드'] || item.mode)) return true;
  return ikrcOfficialHeadItem_(code, item) || reviewCompletedStatus_(item && (item['검수상태'] || item.status));
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
function mobExtraComponents_(extra) {
  extra = extra || {};
  const dqRaw = extra['실격여부'] || extra['DQ'] || extra.disqualified;
  const isDq = isDisqualifiedValue_(dqRaw);
  const rawTech = sumFromKeys_(extra, ['Pre-Service Station(시연 전 작업대)','Service Station(시연 중 작업대)','Post-Service Station(시연 후 작업대)','Signature Technical Pre-Service Station(창작음료 시연 전 작업대)','Signature Technical Service Station(창작음료 시연 중 작업대)','Signature Technical Ingredient Use(부재료 사용의 적절함)','Signature Technical Post-Service Station(창작음료 시연 후 작업대)']);
  const rawSensory = sumFromKeys_(extra, ['Sweetness(스윗니스)','Flavor(플레이버)','Balance(균형)','Clean Cup(클린컵)','Mouthfeel(질감)','Professionalism(시연 전문성)']);
  const rawCreative = sumFromKeys_(extra, ['Creative Form & Usability(형태와 용이성)','Creative Flavor(창작 향미)','Creative Balance(균형)','Creative Mouthfeel(질감)','Creative Professionalism(전문성과 독창성)']);
  const tech = rawTech !== null ? rawTech : valueOrZero_(extra, ['테크니컬 총점','테크니컬총점','Technical Total','TechnicalTotal']);
  const sensory = rawSensory !== null ? rawSensory : valueOrZero_(extra, ['센서리 총점','센서리총점','Sensory Total','SensoryTotal']);
  const creative = rawCreative !== null ? rawCreative : valueOrZero_(extra, ['창작메뉴 총점','창작메뉴총점','Creative Total','CreativeTotal']);
  const penalty = mobPenaltyFromExtra_(extra);
  const hasRaw = rawTech !== null || rawSensory !== null || rawCreative !== null || valueFromKeysAny_(extra, ['테크니컬 총점','테크니컬총점','센서리 총점','센서리총점','창작메뉴 총점','창작메뉴총점','시간감점','Time Penalty']) !== null;
  const gross = roundScoreValue_(tech + sensory + creative);
  const penaltyApplied = roundScoreValue_(gross - penalty);
  const official = isDq ? 0 : roundScoreValue_(Math.max(0, penaltyApplied));
  return { hasRaw, isDq, tech:roundScoreValue_(tech), sensory:roundScoreValue_(sensory), creative:roundScoreValue_(creative), penalty, gross, penaltyApplied, official };
}
function writeMobDerivedFields_(target, comp) {
  if (!target || !comp || !comp.hasRaw) return;
  target['테크니컬 총점'] = comp.tech;
  target['센서리 총점'] = comp.sensory;
  target['창작메뉴 총점'] = comp.creative;
  target['감점 전 합산'] = comp.gross;
  target['감점 적용 후 점수'] = comp.penaltyApplied;
  target['순위 반영점수'] = comp.official;
  target['총평가 반영점수'] = comp.official;
}
function mobOfficialTotalFromExtra_(extra) {
  const direct = valueFromKeysAny_(extra, ['총평가 반영점수','총평가반영점수','Official Total']);
  const comp = mobExtraComponents_(extra);
  if (comp.isDq) return 0;
  if (comp.hasRaw) return comp.official;
  return direct === null ? null : roundScoreValue_(Math.max(0, direct));
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
const KCAC_QUAL_COMPLETION_TIE_SPEC_ = KCAC_QUAL_TOTAL_SPEC_.slice(0, 1);
const KCAC_QUAL_BALANCE_TIE_SPEC_ = KCAC_QUAL_TOTAL_SPEC_.slice(1, 2);
const KCAC_FINAL_PATTERN_COMPLETION_TIE_SPEC_ = KCAC_FINAL_PATTERN_SPEC_.slice(1, 2);
const KCAC_FINAL_SENSORY_TIE_SPEC_ = KCAC_FINAL_SENSORY_SPEC_.slice(0, 2);
const KCAC_FINAL_PRESENTATION_TIE_SPEC_ = KCAC_FINAL_SENSORY_SPEC_.slice(2, 3);
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
    const after = firstNumberFromKeys_(extra, ['Aftertaste(에프터테이스트)','Aftertaste(애프터테이스트)','Aftertaste']);
    const acidity = firstNumberFromKeys_(extra, ['Acidity(산미)','Acidity']);
    const sweet = firstNumberFromKeys_(extra, ['Sweetness(단맛) ×2','Sweetness(스윗니스) ×2','Sweetness(스윗니스)','Sweetness']);
    const mouthfeel = firstNumberFromKeys_(extra, ['Mouthfeel(마우스필)','Mouthfeel']);
    const overall = firstNumberFromKeys_(extra, ['Overall(오버롤)','Overall(주관적 종합평가)','Overall']);
    if ([flavor, after, acidity, sweet, mouthfeel, overall].every(v => v !== null)) return roundScoreValue_(flavor + after + acidity + (sweet * 2) + mouthfeel + overall);
    return fallback();
  }
  if (code === 'IKRC') {
    const ikrcRound = roundName_(firstNonEmpty([payload.round, payload.currentRound, payload.roundName, extra['라운드']]), '');
    const isFinalRound = ikrcRound === '결선';
    const flavor = firstNumberFromKeys_(extra, ['Flavor(플레이버) ×3','Flavor(플레이버)','Flavor']);
    const clean = firstNumberFromKeys_(extra, ['Clean Cup(클린컵) ×2','Clean Cup(클린컵)','Clean Cup']);
    const sweet = firstNumberFromKeys_(extra, ['Sweetness(스윗니스) ×2','Sweetness(스윗니스)','Sweetness']);
    const acidity = firstNumberFromKeys_(extra, ['Acidity(산미)','Acidity']);
    const mouth = firstNumberFromKeys_(extra, ['Mouthfeel(마우스필) ×2','Mouthfeel(마우스필)','Mouthfeel']);
    if ([flavor, clean, sweet, acidity, mouth].every(v => v !== null)) {
      const seed = isFinalRound ? ikrcSeedBonusFromExtra_(extra) : 0;
      return roundScoreValue_((flavor * 3) + (clean * 2) + (sweet * 2) + acidity + (mouth * 2) + seed);
    }
    const final = firstNumberFromKeys_(extra, ['최종점수','Final Score']);
    if (final !== null) return roundScoreValue_(isFinalRound ? final : Math.min(final, 100));
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
    const mobComp = mobExtraComponents_(extra);
    // 개별 MOB 심사행의 총점은 역할별 평가항목 합계입니다.
    // 시간감점은 순위 집계에서 센서리·테크니컬 합산 후 참가자당 한 번만 적용합니다.
    if (mobComp.hasRaw) return mobComp.isDq ? 0 : mobComp.gross;
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
    const rawS1 = firstNumberFromKeys_(extra, ['Section1 정답수']) || 0;
    const rawS2 = firstNumberFromKeys_(extra, ['Section2 정답수']) || 0;
    const rawS3 = firstNumberFromKeys_(extra, ['Section3 정답수']) || 0;
    const s1Wrong = ktccSectionMarkedWrong_(extra, 1);
    const s2Wrong = ktccSectionMarkedWrong_(extra, 2);
    const s3Wrong = ktccSectionMarkedWrong_(extra, 3);
    const s1 = s1Wrong ? 0 : rawS1;
    const s2 = s2Wrong ? 0 : rawS2;
    const s3 = s3Wrong ? 0 : rawS3;
    const bonus = (!s3Wrong && Number(s3) === 2) ? 2 : 0;
    const hasKtcc = [rawS1,rawS2,rawS3,bonus].some(v => v > 0) || s1Wrong || s2Wrong || s3Wrong || firstNumberFromKeys_(extra, ['총점']) !== null;
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
  const normalizedCode = safeStr(code).toUpperCase();
  const isVirtualMulti = (normalizedCode === 'KCAC' || normalizedCode === 'IKRC') && payloadRows.length > 1;
  const isKcacMulti = normalizedCode === 'KCAC' && payloadRows.length > 1;
  const extra = isVirtualMulti ? extractExtraSingleRow_(payload, code, payloadRowIndex) : extractExtra(payload, code, 0);
  const payloadUnit = firstNonEmpty([extra['참가자번호'], extra['참가자 번호'], extra['선수번호'], extra['선수 번호'], extra['컵번호'], extra['Cup No'], extra['샘플번호'], extra['팀번호'], extra['팀 번호'], data[0], payload.unit, payload.cupNo, payload.participantNo, payload.teamNo]);
  const unit = normalizedCode === 'IKRC' && isVirtualMulti ? firstNonEmpty([payloadUnit, r.unit]) : firstNonEmpty([r.unit, payloadUnit]);
  const round = firstNonEmpty([r.round, payload.round, payload.currentRound, extra['라운드'], fallbackRound]);
  const participantName = firstNonEmpty([r.participant_name, extra['선수명'], extra['참가자명'], extra['이름'], extra['팀명'], payload.participantName, payload.playerName, payload.teamName]);
  const computedTotal = isKcacMulti ? kcacRowTotalFromExtra_(extra) : canonicalScoreForPayload_(code, payload, isVirtualMulti ? payloadRowIndex : 0);
  let totalScore = computedTotal !== null && computedTotal !== undefined ? computedTotal : (r.total_score === null || r.total_score === undefined ? firstNonEmpty([extra['총점'], extra['최종점수'], extra['Total'], extra['Total Score']]) : Number(r.total_score));
  if (r.disqualified || isDisqualifiedValue_(extra['실격여부']) || isDisqualifiedValue_(extra['DQ']) || isDisqualifiedValue_(extra.disqualified)) totalScore = 0;
  const item = Object.assign({}, extra);
  item.rowIndex = isVirtualMulti ? (String(r.id) + ':' + String(payloadRowIndex)) : r.id;
  item.scoreRowId = r.id;
  item.payloadRowIndex = payloadRowIndex;
  item._scoreId = r.id;
  item._payloadRowIndex = payloadRowIndex;
  item['제출시간'] = r.submitted_at || ''; item['대회코드'] = r.competition_code || code; item['라운드'] = round; item['심사위원명'] = r.judge_name || payload.judgeName || ''; item['팀'] = r.team || payload.team || payload.teamGroup || ''; item['역할'] = r.role || payload.judgeRole || payload.role || ''; item['모드'] = r.mode || payload.mode || '';
  if (normalizedCode === 'IKRC' || normalizedCode === 'KCR') {
    if (!item['스테이션ID']) item['스테이션ID'] = payload.stationId || '';
    if (!item['스테이션']) item['스테이션'] = payload.stationLabel || '';
    if (!item['스테이션코드']) item['스테이션코드'] = payload.stationPrefix || '';
    if (normalizedCode === 'KCR' && !item['프로세스']) item['프로세스'] = payload.stationProcess || '';
  }
  if (!item['참가자번호']) item['참가자번호'] = unit; if (!item['참가자 번호']) item['참가자 번호'] = unit; if (!item['컵번호']) item['컵번호'] = unit; if (!item['샘플번호']) item['샘플번호'] = unit; if (!item['팀번호']) item['팀번호'] = unit;
  if (!item['선수명']) item['선수명'] = participantName; if (!item['참가자명']) item['참가자명'] = participantName; if (!item['팀명'] && code === 'KTCC') item['팀명'] = participantName;
  item['총점'] = totalScore; item['최종점수'] = totalScore; item['실격여부'] = r.disqualified ? 'Y' : (item['실격여부'] || ''); item['실격사유'] = r.disqualification_reason || item['실격사유'] || ''; item['검수상태'] = r.review_status || item['검수상태'] || '미검수';
  // MOB 과거/검수 수정 데이터 호환: 시간감점은 화면·검수·최종디브리핑에서 항상 양수 감점값으로 표시한다.
  // 예전 데이터에 -6처럼 저장된 경우에도 점수가 가산되는 것처럼 보이지 않게 6으로 정규화한다.
  if (safeStr(code).toUpperCase() === 'MOB' && item['시간감점'] !== undefined && item['시간감점'] !== null && safeStr(item['시간감점']) !== '') {
    item['시간감점'] = positivePenaltyValue_(item['시간감점']);
  }
  if (safeStr(code).toUpperCase() === 'MOB') {
    const mobComp = mobExtraComponents_(item);
    if (mobComp.hasRaw) {
      writeMobDerivedFields_(item, mobComp);
    }
  }
  item.status = item['검수상태']; item.submittedAt = item['제출시간']; item.timestamp = item['제출시간']; item.competitionCode = item['대회코드']; item.round = item['라운드']; item.judgeName = item['심사위원명']; item.team = item['팀']; item.role = item['역할']; item.mode = item['모드']; item.unit = unit; item.participantName = participantName; item.totalScore = totalScore; item.disqualified = !!r.disqualified; item.disqualificationReason = item['실격사유']; item.payload = payload;
  const categoryInfo = scoreBackupCategoryForItem_(code, item);
  item['검수구분'] = categoryInfo.category;
  item.evaluationCategory = categoryInfo.category;
  item.evaluationCategoryReason = categoryInfo.reason || '';
  const sigData = r.signature_data || payload.signatureBase64 || payload.signatureData || payload.signature || '';
  item.signatureData = sigData; item['서명저장'] = sigData ? 'Y' : '';
  const mediaSummary = mediaSummaryForPayload_(payload);
  item.mediaCount = mediaSummary.count; item['이미지저장'] = mediaSummary.count ? 'Y' : ''; item['이미지개수'] = mediaSummary.count || '';
  item.values = (headers || []).map((h, idx) => { const v = item[h] === undefined || item[h] === null ? '' : item[h]; item['_col' + idx] = v; return v; }); return item;
}

function rowToReviewItems_(r, code, headers, fallbackRound) {
  const payload = parseJson(r.payload_json, {});
  const payloadRows = Array.isArray(payload.rows) ? payload.rows : [];
  if ((safeStr(code).toUpperCase() === 'KCAC' || safeStr(code).toUpperCase() === 'IKRC') && payloadRows.length > 1) {
    return payloadRows.map((_, idx) => rowToReviewItem(r, code, headers, fallbackRound, idx));
  }
  return [rowToReviewItem(r, code, headers, fallbackRound, 0)];
}

function latestIkrcReviewItems_(items) {
  const seen = new Set();
  const list = [];
  let supersededCount = 0;
  (items || []).forEach(item => {
    const category = safeStr(item.evaluationCategory || item['평가구분'] || (isCalibrationMode_(item.mode || item['모드']) ? '켈리브레이션' : '실제평가'));
    const key = [
      safeStr(item.round || item['라운드']).toLowerCase(),
      itemJudgeIdentityKey_(item),
      safeStr(item.role || item['역할']).replace(/\s+/g, '').toLowerCase(),
      safeStr(item.unit || item['샘플번호'] || item['컵번호']).replace(/\s+/g, '').toUpperCase(),
      ikrcItemStationEvidenceTokens_(item).sort().join(','),
      category.replace(/\s+/g, '').toLowerCase()
    ].join('|');
    if (seen.has(key)) {
      supersededCount++;
      return;
    }
    seen.add(key);
    list.push(item);
  });
  return { list, supersededCount };
}

function ikrcReviewTeamMatches_(targetTeam, candidateTeam) {
  const target = safeStr(targetTeam);
  const candidate = safeStr(candidateTeam);
  if (!target || !candidate) return !target && !candidate;
  return mobTeamMatchesServer_(target, candidate);
}
function reviewPopulationStats_(values) {
  const nums = (values || []).map(Number).filter(Number.isFinite);
  if (!nums.length) return { avg:0, stddev:0, count:0 };
  const avg = nums.reduce((sum, value) => sum + value, 0) / nums.length;
  const variance = nums.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / nums.length;
  return {
    avg: Math.round(avg * 10000) / 10000,
    stddev: Math.round(Math.sqrt(variance) * 10000) / 10000,
    count: nums.length
  };
}
function ikrcOfficialReviewComparison_(targetItem, officialItems) {
  if (!targetItem) return null;
  const targetRound = safeStr(targetItem.round || targetItem['라운드']).replace(/\s+/g, '').toLowerCase();
  const targetUnit = ikrcSampleNoFromItem_(targetItem).replace(/\s+/g, '').toUpperCase();
  const targetStation = ikrcReviewStationLabel_(targetItem);
  if (!targetUnit) return null;
  const peers = latestOfficialJudgeRows_((officialItems || []).filter(item => {
    if (!item || isCalibrationMode_(item.mode || item['모드'])) return false;
    const itemRound = safeStr(item.round || item['라운드']).replace(/\s+/g, '').toLowerCase();
    const itemUnit = ikrcSampleNoFromItem_(item).replace(/\s+/g, '').toUpperCase();
    return itemUnit === targetUnit && itemRound === targetRound && ikrcReviewStationMatches_(targetItem, item);
  }));
  if (!peers.length) return null;
  const targetJudgeKey = itemJudgeIdentityKey_(targetItem);
  const targetRole = safeStr(targetItem.role || targetItem['역할']).replace(/\s+/g, '').toLowerCase();
  const scoreRows = peers.map(item => {
    const score = ikrcScoreObjectFromItem_(item);
    return {
      judgeName: score.judgeName || '심사위원',
      role: score.role || '',
      team: score.team || '',
      total: score.total,
      flavor: score.flavor,
      cleanCup: score.cleanCup,
      sweetness: score.sweetness,
      acidity: score.acidity,
      mouthfeel: score.mouthfeel,
      comment: score.comment || '',
      isCurrentJudge: itemJudgeIdentityKey_(item) === targetJudgeKey && safeStr(item.role || item['역할']).replace(/\s+/g, '').toLowerCase() === targetRole,
      isHead: isHeadRole_(score.role)
    };
  });
  const totalStats = reviewPopulationStats_(scoreRows.map(row => row.total));
  const metricSpecs = [
    ['flavor', 'Flavor(플레이버)'],
    ['cleanCup', 'Clean Cup(클린컵)'],
    ['sweetness', 'Sweetness(스윗니스)'],
    ['acidity', 'Acidity(산미)'],
    ['mouthfeel', 'Mouthfeel(마우스필)']
  ];
  const metrics = metricSpecs.map(([key, label]) => {
    const stat = reviewPopulationStats_(scoreRows.map(row => row[key]));
    return { key, label, avg:stat.avg, stddev:stat.stddev, count:stat.count };
  });
  return {
    competitionCode:'IKRC',
    purpose:'official-review',
    scope:'station',
    station:targetStation,
    team:targetStation,
    round:safeStr(targetItem.round || targetItem['라운드']),
    sampleNo:ikrcSampleNoFromItem_(targetItem),
    judgeCount:scoreRows.length,
    headCount:scoreRows.filter(row => row.isHead).length,
    totalAvg:totalStats.avg,
    totalStddev:totalStats.stddev,
    metrics,
    judges:scoreRows
  };
}

function kcrCalibrationReviewComparison_(targetItem, calibrationItems) {
  if (!targetItem) return null;
  const targetRound = safeStr(targetItem.round || targetItem['라운드']).replace(/\s+/g, '').toLowerCase();
  const targetUnit = safeStr(targetItem.unit || targetItem['컵번호'] || targetItem['참가자번호']).replace(/\s+/g, '').toUpperCase();
  if (!targetUnit) return null;
  const peers = latestOfficialJudgeRows_((calibrationItems || []).filter(item => {
    if (!item || !isCalibrationMode_(item.mode || item['모드'])) return false;
    const itemRound = safeStr(item.round || item['라운드']).replace(/\s+/g, '').toLowerCase();
    const itemUnit = safeStr(item.unit || item['컵번호'] || item['참가자번호']).replace(/\s+/g, '').toUpperCase();
    return itemRound === targetRound && itemUnit === targetUnit && ikrcReviewStationMatches_(targetItem, item);
  }));
  if (!peers.length) return null;
  const specs = [
    ['flavor', ['Flavor(플레이버)','Flavor','플레이버']],
    ['aftertaste', ['Aftertaste(애프터테이스트)','Aftertaste','애프터테이스트']],
    ['acidity', ['Acidity(산미)','Acidity','산미']],
    ['sweetness', ['Sweetness(스윗니스) ×2','Sweetness(스윗니스)','Sweetness','스윗니스','단맛']],
    ['mouthfeel', ['Mouthfeel(마우스필)','Mouthfeel','마우스필','질감']],
    ['overall', ['Overall(오버롤)','Overall','오버롤']]
  ];
  const scoreRows = peers.map(item => {
    const row = {
      judgeName:safeStr(item.judgeName || item['심사위원명']) || '심사위원',
      role:safeStr(item.role || item['역할']),
      total:rankingScoreFromItem_(item) || 0,
      comment:safeStr(item['종합코멘트'] || item['Overall Comment(종합 코멘트)'] || item['Overall Comment'] || item['코멘트'])
    };
    specs.forEach(([key, labels]) => { row[key] = firstNumberFromKeys_(item, labels) || 0; });
    return row;
  });
  const totalStats = reviewPopulationStats_(scoreRows.map(row => row.total));
  const metrics = specs.map(([key, labels]) => {
    const stat = reviewPopulationStats_(scoreRows.map(row => row[key]));
    return { key, label:labels[0], avg:stat.avg, stddev:stat.stddev, count:stat.count };
  });
  return {
    competitionCode:'KCR', purpose:'calibration-review', scope:'station',
    station:ikrcReviewStationLabel_(targetItem), team:ikrcReviewStationLabel_(targetItem),
    round:safeStr(targetItem.round || targetItem['라운드']), participantNo:targetUnit,
    judgeCount:scoreRows.length, totalAvg:totalStats.avg, totalStddev:totalStats.stddev,
    metrics, judges:scoreRows
  };
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
  const scrubSecrets = (value, parentKey = '') => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(item => scrubSecrets(item, parentKey)); return; }
    Object.keys(value).forEach(key => {
      if (/^(judgeToken|actorToken|operatorToken|adminToken|sessionToken|token|password|secret|secretCode)$/i.test(key)) {
        delete value[key];
        return;
      }
      if (/^(judgePhone|operatorPhone)$/i.test(key) || (parentKey === 'judge' && /^phone$/i.test(key))) {
        delete value[key];
        return;
      }
      scrubSecrets(value[key], key);
    });
  };
  scrubSecrets(p);
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
function scoreBackupCategoryForItem_(code, item) {
  code = safeStr(code).toUpperCase();
  const mode = firstNonEmpty([item && item['모드'], item && item.mode, item && item.evalMode]);
  const status = firstNonEmpty([item && item['검수상태'], item && item.status, item && item.reviewStatus]);
  if (isCalibrationMode_(mode)) return { category: '켈리브레이션', reason: '켈리브레이션 모드' };
  if (isCalibrationMode_(status)) return { category: '켈리브레이션', reason: '켈리브레이션 검수상태' };
  return { category: '실제평가', reason: '' };
}
function scoreBackupExclusionReason_(code, item, categoryInfo) {
  if (categoryInfo && categoryInfo.category === '켈리브레이션') return categoryInfo.reason || '켈리브레이션';
  if (rankingExcludedByReviewStatus_(item && (item['검수상태'] || item.status))) return '검수상태 미완료 또는 제외상태';
  return '';
}
function scoreBackupRowOut_(code, item, headers) {
  const categoryInfo = scoreBackupCategoryForItem_(code, item);
  const countable = shouldCountItemInRanking_(code, item);
  const base = reportRowOut_(item, headers);
  const roundGroup = roundName_(base['라운드'] || (item && item.round) || '', base['라운드'] || '');
  return Object.assign({
    '백업구분': categoryInfo.category,
    '라운드구분': roundGroup || base['라운드'] || '',
    '순위반영여부': countable ? 'Y' : 'N',
    '순위반영제외사유': countable ? '' : scoreBackupExclusionReason_(code, item, categoryInfo)
  }, base);
}
async function getScoreBackupReport(env, competitionCode, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const auth = await requireManageActorForCode_(env, actorArg, code, '점수 백업 엑셀 다운로드 권한이 없습니다. 관리자 또는 대회팀장 권한으로 로그인해주세요.');
  if (!auth.ok) return auth.res;
  const data = await buildRankingData_(env, code);
  const rows = data.rows.map(item => scoreBackupRowOut_(code, item, data.headers));
  const competitionRows = rows.filter(row => row['백업구분'] === '실제평가');
  const calibrationRows = rows.filter(row => row['백업구분'] === '켈리브레이션');
  const rounds = Array.from(new Set((data.ranking || []).map(r => r.round).concat(rows.map(r => r['라운드구분'] || r['라운드'])).filter(Boolean)));
  const statusCounts = rows.reduce((acc, row) => {
    const status = safeStr(row['검수상태'] || '미검수') || '미검수';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const categoryCounts = rows.reduce((acc, row) => {
    const category = safeStr(row['백업구분'] || '실제평가') || '실제평가';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  return {
    success: true,
    compCode: code,
    compName: data.cfg ? data.cfg.name : (COMPETITION_NAMES[code] || code),
    currentRound: data.cfg ? data.cfg.current_round : '',
    generatedAt: nowIso(),
    headers: data.headers,
    rounds,
    statusCounts,
    categoryCounts,
    rows,
    scoreRows: rows,
    competitionRows,
    calibrationRows
  };
}
async function getFinalReport(env, competitionCode, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const auth = await requireManageActorForCode_(env, actorArg, code, '최종디브리핑 파일 다운로드 권한이 없습니다. 관리자 또는 대회팀장 권한으로 로그인해주세요.');
  if (!auth.ok) return auth.res;
  const data = await buildRankingData_(env, code);
  // 최종디브리핑 파일은 순위 반영 기준과 동일하게, 검수완료·수정완료이면서 순위 제외 대상이 아닌 데이터만 내려보냅니다.
  const finalItems = officialScoreItemsForOutput_(code, data.rows.filter(item => officialReviewCompleted_(code, item) && shouldCountItemInRanking_(code, item)));
  const approvedRows = finalItems.map(item => reportRowOut_(item, data.headers));
  const rows = approvedRows.slice();
  const rawRows = finalItems.map(item => ({
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

function ikrcStationRoundKeyServer_(round) {
  return /결선|final/i.test(safeStr(round)) ? '결선' : '예선';
}
function ikrcDefaultStationPrefixServer_(index) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  index = Math.max(0, Number(index) || 0);
  return index < alphabet.length ? alphabet.charAt(index) : `S${index + 1}`;
}
function normalizeIkrcStationListServer_(source, strict=false, competitionCode='IKRC') {
  const code = String(competitionCode || '').trim().toUpperCase() || 'IKRC';
  const maxPerStation = code === 'KCR' ? 20 : 50;
  const maxRangeNumber = code === 'KCR' ? 999 : 99;
  const purposeFlag = (value, fallback=true) => {
    if (value === undefined || value === null || value === '') return !!fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return !/^(?:0|false|no|n|off|미사용)$/i.test(safeStr(value));
  };
  if (!Array.isArray(source) || !source.length) return { ok:false, message:`${code} 스테이션을 1개 이상 등록해주세요.`, list:[] };
  if (source.length > 12) return { ok:false, message:`${code} 스테이션은 최대 12개까지 등록할 수 있습니다.`, list:[] };
  const used = new Set();
  const usedIds = new Set();
  const list = [];
  for (let index=0; index<source.length; index++) {
    const item = source[index] && typeof source[index] === 'object' ? source[index] : {};
    const fallback = ikrcDefaultStationPrefixServer_(index);
    let id = safeStr(item.id).toLowerCase().replace(/[^0-9a-z_-]/g, '').slice(0, 48) || `station${index + 1}`;
    if (usedIds.has(id)) {
      const baseId = `station${index + 1}`;
      id = baseId;
      let idSuffix = 2;
      while (usedIds.has(id)) id = `${baseId}-${idSuffix++}`.slice(0, 48);
    }
    usedIds.add(id);
    const label = safeStr(item.label).slice(0, 40) || `스테이션 ${index + 1}`;
    let prefix = safeStr(item.prefix).toUpperCase().replace(/[^0-9A-Z가-힣]/g, '').slice(0, 8) || fallback;
    let start = Math.floor(Number(item.start));
    let end = Math.floor(Number(item.end));
    if (!Number.isFinite(start) || start < 1 || start > maxRangeNumber) start = 1;
    if (!Number.isFinite(end) || end < 1 || end > maxRangeNumber) end = 10;
    if (strict && used.has(prefix)) return { ok:false, message:`${code} 스테이션 코드는 서로 달라야 합니다: ${prefix}`, list:[] };
    if (strict && end < start) return { ok:false, message:`스테이션 ${index + 1}의 끝 번호는 시작 번호보다 작을 수 없습니다.`, list:[] };
    if (strict && end - start + 1 > maxPerStation) return { ok:false, message:`${code} 스테이션 ${index + 1}은 최대 ${maxPerStation}개 ${code === 'KCR' ? '컵' : '샘플'}까지 지정할 수 있습니다.`, list:[] };
    if (used.has(prefix)) {
      prefix = fallback;
      let suffix = 2;
      while (used.has(prefix)) prefix = `${fallback}${suffix++}`.slice(0, 8);
    }
    if (end < start) end = start;
    if (end - start + 1 > maxPerStation) end = start + maxPerStation - 1;
    used.add(prefix);
    const stationPurposeEnabled = code === 'IKRC' || code === 'KCR';
    const useForCalibration = stationPurposeEnabled ? purposeFlag(item.useForCalibration, true) : true;
    const useForCompetition = stationPurposeEnabled ? purposeFlag(item.useForCompetition, true) : true;
    if (strict && stationPurposeEnabled && !useForCalibration && !useForCompetition) {
      return { ok:false, message:`${label}은 켈리브레이션용 또는 대회용 중 하나 이상을 선택해야 합니다.`, list:[] };
    }
    list.push(stationPurposeEnabled
      ? { id, label:code === 'KCR' ? `스테이션 ${index + 1}` : label, prefix, start, end, useForCalibration, useForCompetition, ...(code === 'KCR' ? {numberMode:'participant'} : {}) }
      : { id, label, prefix, start, end });
  }
  return { ok:true, list };
}
function validateIkrcStationOptionSettings_(rawSettings, currentRound) {
  const raw = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const byRoundSource = raw.byRound && typeof raw.byRound === 'object' ? raw.byRound : {};
  const legacy = Array.isArray(raw.stations) && raw.stations.length ? raw.stations : [
    {prefix:raw.station1Prefix || 'A', start:1, end:10},
    {prefix:raw.station2Prefix || 'B', start:1, end:10}
  ];
  const byRound = {};
  for (const key of ['예선','결선']) {
    const source = Array.isArray(byRoundSource[key]) && byRoundSource[key].length ? byRoundSource[key] : legacy;
    const checked = normalizeIkrcStationListServer_(source, true);
    if (!checked.ok) return checked;
    byRound[key] = checked.list;
  }
  const roundKey = ikrcStationRoundKeyServer_(currentRound);
  const active = byRound[roundKey];
  return {
    ok:true,
    list:active,
    settings:Object.assign({}, raw, {
      byRound,
      stations:active,
      station1Prefix:active[0] ? active[0].prefix : 'A',
      station2Prefix:active[1] ? active[1].prefix : 'B'
    })
  };
}
function ikrcStationSettingsServer_(cfg, roundOverride) {
  let optionSettings = {};
  if (cfg && typeof cfg.option_settings === 'string') optionSettings = parseJson(cfg.option_settings, {});
  else if (cfg && cfg.optionSettings && typeof cfg.optionSettings === 'object') optionSettings = cfg.optionSettings;
  else if (cfg && typeof cfg === 'object') optionSettings = cfg;
  const source = optionSettings.ikrcStations && typeof optionSettings.ikrcStations === 'object' ? optionSettings.ikrcStations : {};
  const roundKey = ikrcStationRoundKeyServer_(roundOverride || (cfg && cfg.current_round) || (cfg && cfg.currentRound));
  const byRound = source.byRound && typeof source.byRound === 'object' ? source.byRound : {};
  const rawList = Array.isArray(byRound[roundKey]) && byRound[roundKey].length ? byRound[roundKey]
    : (Array.isArray(source.stations) && source.stations.length ? source.stations : [
      {prefix:source.station1Prefix || 'A', start:1, end:10},
      {prefix:source.station2Prefix || 'B', start:1, end:10}
    ]);
  const normalized = normalizeIkrcStationListServer_(rawList, false);
  return normalized.ok ? normalized.list : normalizeIkrcStationListServer_([{prefix:'A',start:1,end:10},{prefix:'B',start:1,end:10}], false).list;
}
function ikrcStationFingerprintServer_(stations) {
  return (stations || []).map(station => [station.id, station.label, station.prefix, station.start, station.end, station.useForCalibration !== false ? 1 : 0, station.useForCompetition !== false ? 1 : 0].join(':')).join('|');
}
function ikrcStationsForPurposeServer_(cfg, roundOverride, purpose='competition') {
  const calibration = safeStr(purpose).toLowerCase() === 'calibration';
  return ikrcStationSettingsServer_(cfg, roundOverride).filter(station => calibration ? station.useForCalibration !== false : station.useForCompetition !== false);
}

function ikrcStationScopeTokenServer_(value) {
  return safeStr(value)
    .replace(/IKRC|스테이션|station|헤드|심사위원|심사|센서리|팀|조|team|group|judge|head|sensory|sensor/ig, '')
    .replace(/[^0-9a-zA-Z가-힣]/g, '')
    .toLowerCase();
}
function ikrcStationScopeTokensServer_(station) {
  station = station || {};
  return Array.from(new Set([
    ikrcStationScopeTokenServer_(station.id),
    ikrcStationScopeTokenServer_(station.label),
    ikrcStationScopeTokenServer_(station.prefix)
  ].filter(Boolean)));
}
function ikrcFindStationByAssignmentServer_(assignment, stations) {
  const token = ikrcStationScopeTokenServer_(assignment);
  if (!token || /^(all|전체|공통|운영|관리)$/.test(token)) return null;
  return (stations || []).find(station => ikrcStationScopeTokensServer_(station).includes(token)) || null;
}
function ikrcActorTeamServer_(actor) {
  actor = actor || {};
  const teamMap = actor.teamMap && typeof actor.teamMap === 'object' ? actor.teamMap : {};
  return safeStr(teamMap.IKRC || actor.teamGroup || actor.team || actor.judgeTeam);
}
function ikrcActorAssignedStationServer_(actor, cfg) {
  if (!actor || hasAdmin(actor)) return null;
  return ikrcFindStationByAssignmentServer_(ikrcActorTeamServer_(actor), ikrcStationsForPurposeServer_(cfg, cfg && (cfg.current_round || cfg.currentRound), 'competition'));
}
function ikrcUnitBelongsToStationServer_(unit, station) {
  const normalized = safeStr(unit).toUpperCase().replace(/\s+/g, '');
  const prefix = safeStr(station && station.prefix).toUpperCase().replace(/\s+/g, '');
  if (!normalized || !prefix) return false;
  const match = normalized.match(/^(.+?)-(\d+)$/);
  if (!match || match[1] !== prefix) return false;
  const number = Number(match[2]);
  return Number.isFinite(number) && number >= Number(station.start) && number <= Number(station.end);
}
function ikrcPayloadStationEvidenceTokensServer_(payload, fallbackUnit='') {
  payload = payload && typeof payload === 'object' ? payload : {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const row = rows[0] && typeof rows[0] === 'object' ? rows[0] : {};
  const extra = row.extraFields && typeof row.extraFields === 'object' ? row.extraFields : {};
  const unit = firstNonEmpty([
    fallbackUnit,
    payload.unit,
    payload.sampleNo,
    payload.cupNo,
    Array.isArray(row.data) ? row.data[0] : '',
    extra['샘플번호'],
    extra['컵번호']
  ]);
  const unitMatch = safeStr(unit).toUpperCase().replace(/\s+/g, '').match(/^(.+?)-\d+$/);
  return Array.from(new Set([
    ikrcStationScopeTokenServer_(payload.stationId || extra['스테이션ID']),
    ikrcStationScopeTokenServer_(payload.stationLabel || extra['스테이션']),
    ikrcStationScopeTokenServer_(payload.stationPrefix || extra['스테이션코드']),
    ikrcStationScopeTokenServer_(unitMatch ? unitMatch[1] : '')
  ].filter(Boolean)));
}
function ikrcPayloadBelongsToStationServer_(payload, station, fallbackUnit='') {
  const evidence = ikrcPayloadStationEvidenceTokensServer_(payload, fallbackUnit);
  const stationTokens = ikrcStationScopeTokensServer_(station);
  if (evidence.some(token => stationTokens.includes(token))) return true;
  return ikrcUnitBelongsToStationServer_(fallbackUnit, station);
}
function ikrcScoreBelongsToStationServer_(scoreRow, station) {
  if (!scoreRow || !station) return false;
  return ikrcPayloadBelongsToStationServer_(parseJson(scoreRow.payload_json, {}), station, scoreRow.unit);
}
function ikrcItemStationEvidenceTokens_(item) {
  item = item || {};
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
  const payloadEvidence = ikrcPayloadStationEvidenceTokensServer_(payload, item.unit || item['샘플번호'] || item['컵번호']);
  const directEvidence = [
    ikrcStationScopeTokenServer_(item['스테이션ID'] || item.stationId),
    ikrcStationScopeTokenServer_(item['스테이션'] || item.stationLabel),
    ikrcStationScopeTokenServer_(item['스테이션코드'] || item.stationPrefix)
  ].filter(Boolean);
  const evidence = Array.from(new Set(payloadEvidence.concat(directEvidence)));
  if (evidence.length) return evidence;
  return [ikrcStationScopeTokenServer_(item.team || item['팀'] || item['평가팀'])].filter(Boolean);
}
function ikrcReviewStationMatches_(targetItem, candidateItem) {
  const target = ikrcItemStationEvidenceTokens_(targetItem);
  const candidate = ikrcItemStationEvidenceTokens_(candidateItem);
  if (!target.length || !candidate.length) return false;
  return target.some(token => candidate.includes(token));
}
function ikrcReviewStationLabel_(item) {
  item = item || {};
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
  return safeStr(item['스테이션'] || item.stationLabel || payload.stationLabel || item.team || item['팀']);
}

function kcrStationProcessServer_(value, index=0) {
  const text = safeStr(value).replace(/\s+/g, '').toLowerCase();
  if (/washed|wash|워시|워쉬/.test(text)) return 'Washed';
  if (/natural|내추|네추|네츄|나추/.test(text)) return 'Natural';
  if (/blending|blend|블렌|블랜/.test(text)) return 'Blending';
  return ['Washed','Natural','Blending'][Math.max(0, Number(index) || 0) % 3];
}
function normalizeKcrStationListServer_(source, strict=false) {
  const checked = normalizeIkrcStationListServer_(source, strict, 'KCR');
  if (!checked.ok) return checked;
  checked.list = checked.list.map((station, index) => Object.assign({}, station, {
    label:`스테이션 ${index + 1}`,
    process:kcrStationProcessServer_(source && source[index] && source[index].process, index),
    useForCalibration:station.useForCalibration !== false,
    useForCompetition:station.useForCompetition !== false,
    numberMode:'participant'
  }));
  return checked;
}
function validateKcrStationOptionSettings_(rawSettings, currentRound) {
  const raw = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const byRoundSource = raw.byRound && typeof raw.byRound === 'object' ? raw.byRound : {};
  const legacy = Array.isArray(raw.stations) && raw.stations.length ? raw.stations : [
    {prefix:'A', start:1, end:10, process:'Washed'},
    {prefix:'B', start:1, end:10, process:'Natural'},
    {prefix:'C', start:1, end:10, process:'Blending'}
  ];
  const byRound = {};
  for (const key of ['예선','결선']) {
    const source = Array.isArray(byRoundSource[key]) && byRoundSource[key].length ? byRoundSource[key] : legacy;
    const checked = normalizeKcrStationListServer_(source, true);
    if (!checked.ok) return checked;
    byRound[key] = checked.list;
  }
  const roundKey = ikrcStationRoundKeyServer_(currentRound);
  const active = byRound[roundKey];
  return { ok:true, list:active, settings:Object.assign({}, raw, {byRound, stations:active}) };
}
function kcrStationSettingsServer_(cfg, roundOverride) {
  let optionSettings = {};
  if (cfg && typeof cfg.option_settings === 'string') optionSettings = parseJson(cfg.option_settings, {});
  else if (cfg && cfg.optionSettings && typeof cfg.optionSettings === 'object') optionSettings = cfg.optionSettings;
  else if (cfg && typeof cfg === 'object') optionSettings = cfg;
  const source = optionSettings.kcrStations && typeof optionSettings.kcrStations === 'object' ? optionSettings.kcrStations : {};
  const roundKey = ikrcStationRoundKeyServer_(roundOverride || (cfg && cfg.current_round) || (cfg && cfg.currentRound));
  const byRound = source.byRound && typeof source.byRound === 'object' ? source.byRound : {};
  const defaults = [
    {prefix:'A', start:1, end:10, process:'Washed'},
    {prefix:'B', start:1, end:10, process:'Natural'},
    {prefix:'C', start:1, end:10, process:'Blending'}
  ];
  const rawList = Array.isArray(byRound[roundKey]) && byRound[roundKey].length ? byRound[roundKey]
    : (Array.isArray(source.stations) && source.stations.length ? source.stations : defaults);
  const normalized = normalizeKcrStationListServer_(rawList, false);
  return normalized.ok ? normalized.list : normalizeKcrStationListServer_(defaults, false).list;
}
function kcrStationFingerprintServer_(stations) {
  return (stations || []).map(station => [station.id, station.label, station.prefix, station.start, station.end, station.process, station.useForCalibration !== false, station.useForCompetition !== false, station.numberMode || 'participant'].join(':')).join('|');
}

function kcrStationsForPurposeServer_(cfg, roundOverride, purpose) {
  const calibration = safeStr(purpose).toLowerCase() === 'calibration';
  return kcrStationSettingsServer_(cfg, roundOverride).filter(station => calibration ? station.useForCalibration !== false : station.useForCompetition !== false);
}

function validateKcrStationSubmission_(payload, cfg) {
  const rows = Array.isArray(payload && payload.rows) ? payload.rows : [];
  const purpose = isCalibrationMode_(payload && payload.mode) ? 'calibration' : 'competition';
  const settings = kcrStationsForPurposeServer_(cfg, payload && payload.round, purpose);
  const stationId = safeStr(payload && payload.stationId).toLowerCase();
  const station = settings.find(item => safeStr(item.id).toLowerCase() === stationId);
  if (!station) return { ok:false, message:`현재 ${purpose === 'calibration' ? '켈리브레이션' : '대회평가'}용으로 열린 KCR 스테이션을 다시 선택해주세요.` };
  const expectedUnits = Array.from({ length:station.end - station.start + 1 }, (_, idx) => String(station.start + idx));
  if (rows.length !== expectedUnits.length) {
    return { ok:false, message:`${station.label} 평가는 참가자번호 ${expectedUnits[0]}부터 ${expectedUnits[expectedUnits.length - 1]}까지 ${expectedUnits.length}명이 모두 있어야 저장됩니다.` };
  }
  const actualUnits = rows.map(row => {
    const inferred = inferScorePayload(Object.assign({}, payload, {rows:[row]}));
    return safeStr(inferred.unit).toUpperCase().replace(/\s+/g, '');
  });
  const duplicates = actualUnits.filter((unit, idx) => actualUnits.indexOf(unit) !== idx);
  const missing = expectedUnits.filter(unit => !actualUnits.includes(unit));
  const unexpected = actualUnits.filter(unit => !expectedUnits.includes(unit));
  if (actualUnits.some(unit => !unit) || duplicates.length || missing.length || unexpected.length) {
    return {ok:false, message:`${station.label} 참가자번호가 올바르지 않습니다. ${expectedUnits.join(', ')}를 빠짐없이 확인해주세요.`};
  }
  const payloadPrefix = safeStr(payload && payload.stationPrefix).toUpperCase().replace(/\s+/g, '');
  if (payloadPrefix && payloadPrefix !== station.prefix) return {ok:false, message:'KCR 스테이션 설정이 변경되었습니다. 평가 화면을 새로 열어 다시 선택해주세요.'};
  if (!isCalibrationMode_(payload && payload.mode)) {
    const expectedProcess = kcrStationProcessServer_(station.process);
    const invalidProcess = rows.some(row => kcrStationProcessServer_(kcrProcessKeyFromPayload_(Object.assign({}, payload, {rows:[row]}))) !== expectedProcess);
    if (invalidProcess) return {ok:false, message:`${station.label}의 프로세스 설정이 변경되었습니다. 평가 화면을 새로 열어 다시 선택해주세요.`};
    const optionSettings = cfg && typeof cfg.option_settings === 'string' ? parseJson(cfg.option_settings, {}) : {};
    const processSettings = optionSettings.kcrProcesses && typeof optionSettings.kcrProcesses === 'object' ? optionSettings.kcrProcesses : {};
    const processKey = expectedProcess.toLowerCase();
    if (processSettings[processKey] === false) return {ok:false, message:`${station.label}의 ${expectedProcess} 프로세스가 현재 닫혀 있습니다. 대회팀장에게 확인해주세요.`};
  }
  return {ok:true, station, expectedUnits};
}

function validateIkrcStationSubmission_(payload, cfg) {
  const rows = Array.isArray(payload && payload.rows) ? payload.rows : [];
  const purpose = isCalibrationMode_(payload && payload.mode) ? 'calibration' : 'competition';
  const settings = ikrcStationsForPurposeServer_(cfg, payload && payload.round, purpose);
  const stationId = safeStr(payload && payload.stationId).toLowerCase();
  const station = settings.find(item => safeStr(item.id).toLowerCase() === stationId);
  if (!station) return { ok:false, message:`현재 ${purpose === 'calibration' ? '켈리브레이션' : '대회평가'}용으로 열린 IKRC 스테이션을 다시 선택해주세요.` };
  const expectedUnits = Array.from({ length:station.end - station.start + 1 }, (_, idx) => `${station.prefix}-${station.start + idx}`);
  if (rows.length !== expectedUnits.length) {
    return { ok:false, message:`${station.label} 평가는 ${expectedUnits[0]}부터 ${expectedUnits[expectedUnits.length - 1]}까지 ${expectedUnits.length}개 샘플이 모두 있어야 저장됩니다.` };
  }
  const actualUnits = rows.map(row => {
    const inferred = inferScorePayload(Object.assign({}, payload, { rows:[row] }));
    return safeStr(inferred.unit).toUpperCase().replace(/\s+/g, '');
  });
  const duplicates = actualUnits.filter((unit, idx) => actualUnits.indexOf(unit) !== idx);
  const missing = expectedUnits.filter(unit => !actualUnits.includes(unit));
  const unexpected = actualUnits.filter(unit => !expectedUnits.includes(unit));
  if (actualUnits.some(unit => !unit) || duplicates.length || missing.length || unexpected.length) {
    return {
      ok:false,
      message:`${station.label} 샘플 번호가 올바르지 않습니다. ${expectedUnits.join(', ')}를 빠짐없이 확인해주세요.`
    };
  }
  const payloadPrefix = safeStr(payload && payload.stationPrefix).toUpperCase().replace(/\s+/g, '');
  if (payloadPrefix && payloadPrefix !== station.prefix) {
    return { ok:false, message:'스테이션 설정이 변경되었습니다. 평가 화면을 새로 열어 다시 선택해주세요.' };
  }
  return { ok:true, station, expectedUnits };
}

function utf8ByteLength_(value) {
  return new TextEncoder().encode(String(value == null ? '' : value)).length;
}
function kcrProcessKeyFromPayload_(payload) {
  payload = payload && typeof payload === 'object' ? payload : {};
  const row = Array.isArray(payload.rows) && payload.rows[0] && typeof payload.rows[0] === 'object' ? payload.rows[0] : {};
  const extra = row.extraFields && typeof row.extraFields === 'object' ? row.extraFields : {};
  const data = Array.isArray(row.data) ? row.data : [];
  return safeStr(firstNonEmpty([
    payload.process,
    payload.processName,
    row.process,
    extra['프로세스'],
    extra.Process,
    data[1]
  ])).replace(/\s+/g, '').toLowerCase();
}

async function scoreSubmissionReceipt_(env, code, clientSubmissionId, actorIdentityKey) {
  const clientId = safeStr(clientSubmissionId);
  if (!clientId || !COMPETITION_CODES.includes(safeStr(code).toUpperCase())) return { token:'', receipt:null };
  const digest = await sha256Hex_([safeStr(code).toUpperCase(), clientId, safeStr(actorIdentityKey)].join('|'));
  const token = 'SCORE_SUBMISSION_RECEIPT:' + safeStr(code).toUpperCase() + ':' + digest;
  const row = await env.DB.prepare('SELECT payload_json FROM sessions WHERE token=? AND kind=?')
    .bind(token, 'SCORE_SUBMISSION_RECEIPT').first();
  return { token, receipt:row ? parseJson(row.payload_json, {}) : null };
}

async function submitScores(env, payload, signature, request = null) {
  const basePayload = payload || {};
  const initial = inferScorePayload(basePayload);
  if (!initial.code) return { success: false, message: '대회코드를 찾지 못했습니다.' };
  const auth = await requireActorForCode_(env, { judgeToken: basePayload.judgeToken || basePayload.actorToken || '' }, initial.code, '평가 제출 로그인이 만료되었습니다. 다시 로그인 후 제출해주세요.');
  if (!auth.ok) return auth.res;
  const actorName = safeStr(auth.actor && (auth.actor.name || auth.actor.judgeName || auth.actor.operatorName));
  const actorPhone = normalizePhone(auth.actor && auth.actor.phone);
  const actorIdentityKey = operatorIdentityKey_(actorName, actorPhone);
  const actorRoleMap = auth.actor && auth.actor.roleMap && typeof auth.actor.roleMap === 'object' ? auth.actor.roleMap : {};
  const actorTeamMap = auth.actor && auth.actor.teamMap && typeof auth.actor.teamMap === 'object' ? auth.actor.teamMap : {};
  const actorRole = safeStr(actorRoleMap[initial.code] || (auth.actor && (auth.actor.role || auth.actor.judgeRole || auth.actor.operatorRole)));
  const actorTeam = safeStr(actorTeamMap[initial.code] || (auth.actor && (auth.actor.teamGroup || auth.actor.team)));
  const receiptInfo = await scoreSubmissionReceipt_(env, initial.code, basePayload.clientSubmissionId, actorIdentityKey);
  if (receiptInfo.receipt && Number(receiptInfo.receipt.inserted || 0) > 0) {
    return {
      success:true,
      message:'이미 안전하게 저장된 동일 전체제출입니다.',
      inserted:Number(receiptInfo.receipt.inserted || 0),
      skipped:0,
      idempotent:true,
      completedAt:safeStr(receiptInfo.receipt.completedAt)
    };
  }
  const submitKey = 'submit:' + initial.code + ':' + await sha256Hex_((auth.actor.phone || '') + ':' + (basePayload.judgeToken || '') + ':' + (clientIp_(request) || ''));
  const lim = await rateLimit_(env, submitKey, 60, 60);
  if (!lim.ok) return { success: false, message: '제출 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' };
  const rows = Array.isArray(basePayload.rows) ? basePayload.rows : [];
  if (initial.code === 'KCR' && rows.length > 20) {
    return { success:false, message:'KCR은 기록 안전을 위해 한 번에 최대 20개 컵까지 제출할 수 있습니다. 범위를 나누어 진행해주세요.' };
  }
  const cfg = await env.DB.prepare('SELECT current_round, option_settings FROM competitions WHERE code=?').bind(initial.code).first();
  const submitRound = safeStr(initial.round || (cfg && cfg.current_round) || '예선');
  if (initial.code === 'MOB' && !hasManageAccess(auth.actor, 'MOB')) {
    const mobParticipantDate = mobActiveParticipantDateFromConfig_(cfg);
    if (mobParticipantDate) {
      const participantRows = await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY id').bind('MOB').all();
      const validParticipant = (participantRows.results || []).some(row => {
        if (safeStr(participantRoundNumber_(row, 'MOB', submitRound)) !== safeStr(initial.unit)) return false;
        const extra = parseJson(row.extra_json, {});
        const rowDate = normalizeEffectiveDate_(extra['대회일'] || extra.competitionDate || extra.competition_date || extra['예선일'] || extra['날짜']);
        return rowDate === mobParticipantDate;
      });
      if (!validParticipant) {
        return { success:false, message:`현재 MOB 평가 참가자 표시일은 ${mobParticipantDate}입니다. 평가 화면을 새로고침하고 오늘 참가자를 다시 선택해주세요.` };
      }
    }
  }
  if (initial.code === 'IKRC') {
    const stationValidation = validateIkrcStationSubmission_(basePayload, cfg);
    if (!stationValidation.ok) return { success:false, message:stationValidation.message };
    // 현장에서는 같은 심사위원이 운영팀장의 안내에 따라 여러 스테이션을 순차 평가할 수 있습니다.
    // 제출 기록은 아래 stationId/label/prefix와 샘플 번호로 분리되며, 동일 스테이션의 중복 제출만 차단합니다.
    basePayload.stationId = stationValidation.station.id;
    basePayload.stationLabel = stationValidation.station.label;
    basePayload.stationPrefix = stationValidation.station.prefix;
    basePayload.stationScopeKey = stationValidation.station.id;
    basePayload.stationSampleCount = stationValidation.expectedUnits.length;
    rows.forEach(row => {
      if (!row || typeof row !== 'object') return;
      if (!row.extraFields || typeof row.extraFields !== 'object') row.extraFields = {};
      row.extraFields['스테이션'] = stationValidation.station.label;
      row.extraFields['스테이션코드'] = stationValidation.station.prefix;
    });
  }
  if (initial.code === 'KCR') {
    const stationValidation = validateKcrStationSubmission_(basePayload, cfg);
    if (!stationValidation.ok) return {success:false, message:stationValidation.message};
    const participantRows = await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY id').bind('KCR').all();
    const registeredNumbers = new Set((participantRows.results || [])
      .map(row => safeStr(participantRoundNumber_(row, 'KCR', submitRound)))
      .filter(Boolean));
    const missingParticipantNumbers = stationValidation.expectedUnits.filter(unit => !registeredNumbers.has(safeStr(unit)));
    if (missingParticipantNumbers.length) {
      return {
        success:false,
        message:`${stationValidation.station.label}에 선수등록과 일치하지 않는 참가자번호가 있습니다: ${missingParticipantNumbers.join(', ')}. 참가자번호 범위를 다시 저장해주세요.`
      };
    }
    basePayload.stationId = stationValidation.station.id;
    basePayload.stationLabel = stationValidation.station.label;
    basePayload.stationPrefix = stationValidation.station.prefix;
    basePayload.stationProcess = stationValidation.station.process;
    basePayload.stationSampleCount = stationValidation.expectedUnits.length;
    rows.forEach(row => {
      if (!row || typeof row !== 'object') return;
      if (!row.extraFields || typeof row.extraFields !== 'object') row.extraFields = {};
      row.extraFields['스테이션'] = stationValidation.station.label;
      row.extraFields['스테이션코드'] = stationValidation.station.prefix;
      if (!isCalibrationMode_(basePayload.mode)) row.extraFields['프로세스'] = stationValidation.station.process;
    });
  }
  // KCR/IKRC는 한 번에 여러 컵/샘플을 제출하므로, 디브리핑·순위 매칭을 위해 컵/샘플별로 분리 저장합니다.
  // KCAC는 여러 잔이 한 선수의 한 세트 점수라서 한 제출로 유지합니다.
  const shouldSplit = ['KCR','IKRC'].includes(initial.code) && rows.length > 1;
  const payloads = shouldSplit
    ? rows.map((row, idx) => {
        const one = Object.assign({}, basePayload, {
          rows: [row],
          originalRowCount: rows.length,
          originalRowIndex: idx + 1
        });
        // 여러 컵/샘플을 분리할 때 제출 전체의 대표값이 개별 행 값을 덮어쓰면 안 됩니다.
        // 컵 번호·참가자명·총점은 각 row에서 다시 추론하고 계산합니다.
        [
          'unit','cupNo','cupNumber','participantNo','participantNumber','teamNo','targetNo','number',
          'participantName','playerName','teamName',
          'totalScore','total','finalScore','subtotalScore','subtotal','computedTotalScore'
        ].forEach(key => { delete one[key]; });
        return one;
      })
    : [basePayload];
  let inserted = 0, skipped = 0;
  const atomicInsertStatements = [];
  const duplicateCutoff = new Date(Date.now() - 20 * 1000).toISOString();
  for (const rawPayload of payloads) {
    const onePayload = Object.assign({}, rawPayload || {});
    // 제출자 식별값과 역할은 로그인 세션의 최신 운영계정 정보를 기준으로 고정합니다.
    // 오래 열린 화면이나 변조된 요청이 다른 심사위원 이름/역할로 저장되는 것을 방지합니다.
    if (actorName) {
      onePayload.judgeName = actorName;
      onePayload.operatorName = actorName;
    }
    if (actorPhone) {
      onePayload.judgePhone = actorPhone;
      onePayload.operatorPhone = actorPhone;
    }
    if (actorIdentityKey) {
      onePayload.operatorIdentityKey = actorIdentityKey;
      onePayload.judgeIdentityKey = actorIdentityKey;
    }
    if (actorRole) {
      onePayload.judgeRole = actorRole;
      onePayload.role = actorRole;
    }
    const evaluationCategory = scoreEvaluationCategoryKey_(onePayload.mode || onePayload.evalMode || initial.mode);
    if (safeStr(initial.code).toUpperCase() === 'IKRC' && evaluationCategory === 'calibration:all') {
      return { success:false, message:'IKRC 전체 켈리브레이션은 운영하지 않습니다. 켈리브레이션용 스테이션을 선택해주세요.' };
    }
    const stationTeam = ['KCR','IKRC'].includes(initial.code) ? safeStr(onePayload.stationLabel || basePayload.stationLabel) : '';
    const securedTeam = evaluationCategory === 'calibration:all' ? '전체 켈리브레이션팀' : (stationTeam || actorTeam);
    if (securedTeam) {
      onePayload.team = securedTeam;
      onePayload.teamGroup = securedTeam;
    }
    onePayload.actorType = auth.actor && (auth.actor.type || auth.actor.accountType) || '';
    if (onePayload.judge && typeof onePayload.judge === 'object') {
      onePayload.judge = Object.assign({}, onePayload.judge, { name: actorName, phone: actorPhone, role: actorRole, teamGroup: securedTeam || actorTeam, operatorIdentityKey: actorIdentityKey });
      delete onePayload.judge.judgeToken;
      delete onePayload.judge.actorToken;
      delete onePayload.judge.operatorToken;
      delete onePayload.judge.token;
    }
    // 인증 토큰은 평가 데이터가 아니므로 세션 검증 후 DB payload에 보관하지 않습니다.
    delete onePayload.judgeToken;
    delete onePayload.actorToken;
    delete onePayload.operatorToken;
    delete onePayload.adminToken;
    delete onePayload.sessionToken;
    delete onePayload.token;
    if (!onePayload.round && !onePayload.currentRound && submitRound) onePayload.round = submitRound;
    applyMocTimeDisqualificationToPayload_(onePayload, onePayload.round || onePayload.currentRound || submitRound);
    const x0 = inferScorePayload(onePayload);
    if (!x0.code) continue;
    const total = canonicalScoreForPayload_(x0.code, onePayload, 0);
    const x = Object.assign({}, x0, { round: safeStr(x0.round || submitRound || '예선'), total: total !== null && total !== undefined ? total : x0.total });
    onePayload.totalScore = x.total;
    onePayload.computedTotalScore = x.total;
    onePayload.currentRound = x.round;
    if (!x.unit) return { success: false, message: '참가자번호/컵번호/샘플번호/팀번호를 찾지 못했습니다. 번호 입력을 확인해주세요.' };
    const payloadJson = JSON.stringify(onePayload || {});
    const payloadBytes = utf8ByteLength_(payloadJson);
    if (payloadBytes > 1750000) {
      return {
        success:false,
        message:'평가 데이터가 안전 저장 용량을 초과했습니다. KCAC 사진은 각 잔의 최신 스냅샷 1개만 남긴 뒤 다시 제출해주세요.',
        payloadTooLarge:true,
        payloadBytes
      };
    }
    if (x.code === 'IKRC') {
      // 운영 중 역할 표기가 수정되더라도 동일 인물의 동일 샘플 공식평가가 두 표로 저장되면 안 됩니다.
      // 로그인 계정 식별값으로 소유자를 확인하므로 역할 문자열은 중복 조회 조건에서 제외합니다.
      const existingRows = await env.DB.prepare(`SELECT id, mode, role, judge_name, payload_json FROM scores WHERE competition_code=? AND round=? AND unit=? ORDER BY id DESC`)
        .bind(x.code, x.round, x.unit).all();
      const submittedCategory = scoreEvaluationCategoryKey_(x.mode);
      const existingSameCategory = (existingRows.results || []).find(existing =>
        scoreOwnedByActor_(existing, auth.actor) &&
        scoreEvaluationCategoryKey_(existing.mode) === submittedCategory
      );
      if (existingSameCategory) {
        return {
          success:false,
          message:`이미 제출된 IKRC ${x.unit} 평가입니다. 중복 제출하지 말고 검수 화면에서 수정해주세요.`,
          duplicateId:existingSameCategory.id
        };
      }
    }
    if (x.code === 'KCR') {
      const processKey = kcrProcessKeyFromPayload_(onePayload);
      const existingRows = await env.DB.prepare(`SELECT id, mode, role, judge_name, payload_json FROM scores WHERE competition_code=? AND round=? AND role=? AND unit=? ORDER BY id DESC`)
        .bind(x.code, x.round, x.role, x.unit).all();
      const submittedCategory = scoreEvaluationCategoryKey_(x.mode);
      const existingSameCategory = (existingRows.results || []).find(existing => {
        const existingPayload = parseJson(existing.payload_json, {});
        return scoreOwnedByActor_(existing, auth.actor)
          && scoreEvaluationCategoryKey_(existing.mode) === submittedCategory
          && kcrProcessKeyFromPayload_(existingPayload) === processKey;
      });
      if (existingSameCategory) {
        return {
          success:false,
          message:`이미 제출된 KCR ${x.unit} 평가입니다. 중복 제출하지 말고 검수 화면에서 수정해주세요.`,
          duplicateId:existingSameCategory.id
        };
      }
    }
    if (x.code === 'MOB' && !isCalibrationMode_(x.mode)) {
      const existingMobRows = await env.DB.prepare(`SELECT id, mode, role, judge_name, payload_json FROM scores WHERE competition_code=? AND round=? AND role=? AND unit=? ORDER BY id DESC`)
        .bind(x.code, x.round, x.role, x.unit).all();
      const submittedCategory = scoreEvaluationCategoryKey_(x.mode);
      const existingMob = (existingMobRows.results || []).find(row =>
        scoreOwnedByActor_(row, auth.actor) &&
        scoreEvaluationCategoryKey_(row.mode) === submittedCategory
      );
      if (existingMob && existingMob.id) {
        return {
          success:false,
          message:'이미 제출된 MOB 평가입니다. 새로 제출하지 말고 내평가검수에서 확인·수정해주세요.',
          duplicateId:existingMob.id
        };
      }
    }
    if (x.code === 'KBC') {
      const existingKbcRows = await env.DB.prepare(`SELECT id, mode, role, judge_name, payload_json FROM scores WHERE competition_code=? AND round=? AND role=? AND unit=?`)
        .bind(x.code, x.round, x.role, x.unit).all();
      const submittedCategory = scoreEvaluationCategoryKey_(x.mode);
      const existingKbc = (existingKbcRows.results || []).find(row => scoreOwnedByActor_(row, auth.actor) && scoreEvaluationCategoryKey_(row.mode) === submittedCategory);
      if (existingKbc && existingKbc.id) {
        return { success: false, message: '이미 제출된 KBC 평가입니다. 같은 심사위원의 같은 참가자 평가는 검수 화면에서 수정해주세요.', duplicateId: existingKbc.id };
      }
    }
    if (x.code !== 'KCR' && x.code !== 'IKRC') {
      const dup = await env.DB.prepare(`SELECT id FROM scores WHERE competition_code=? AND round=? AND judge_name=? AND unit=? AND payload_json=? AND submitted_at>? LIMIT 1`)
        .bind(x.code, x.round, x.judgeName, x.unit, payloadJson, duplicateCutoff).first();
      if (dup && dup.id) { skipped++; continue; }
    }
    // IKRC 헤드 공식점수는 제출 즉시 반영 대상이며 센서리 심사위원은 '내평가검수'에서 수정할 수 있습니다.
    // 제출 인원은 현장 구성에 따라 달라질 수 있으므로 스테이션 확정과 집계에서 고정 인원수를 강제하지 않습니다.
    const ikrcOfficialHead = x.code === 'IKRC' && !isCalibrationMode_(x.mode) && isHeadRole_(x.role);
    const initialReviewStatus = isCalibrationMode_(x.mode) ? '켈리브레이션' : (ikrcOfficialHead ? '검수완료' : '미검수');
    const insertVerb = safeStr(onePayload.clientSubmissionId) ? 'INSERT OR IGNORE' : 'INSERT';
    const insertStatement = env.DB.prepare(`${insertVerb} INTO scores (submitted_at, competition_code, round, judge_name, team, role, mode, unit, participant_name, total_score, disqualified, disqualification_reason, review_status, payload_json, signature_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(nowIso(), x.code, x.round, x.judgeName, x.team, x.role, x.mode, x.unit, x.participantName, x.total, boolInt(x.disqualified), x.dqReason, initialReviewStatus, payloadJson, signature || '');
    if (x.code === 'IKRC' || x.code === 'KCR' || receiptInfo.token) atomicInsertStatements.push(insertStatement);
    else {
      await insertStatement.run();
      inserted++;
    }
  }
  if (atomicInsertStatements.length) {
    const scoreInsertCount = atomicInsertStatements.length;
    const batchStatements = atomicInsertStatements.slice();
    if (receiptInfo.token) {
      const receiptPayload = {
        competitionCode:initial.code,
        clientSubmissionId:safeStr(basePayload.clientSubmissionId),
        actorIdentityKey,
        inserted:scoreInsertCount,
        completedAt:nowIso()
      };
      batchStatements.push(env.DB.prepare('INSERT OR REPLACE INTO sessions (token, kind, payload_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(receiptInfo.token, 'SCORE_SUBMISSION_RECEIPT', JSON.stringify(receiptPayload), '2035-12-31T23:59:59.000Z', receiptPayload.completedAt));
    }
    await env.DB.batch(batchStatements);
    inserted += scoreInsertCount;
  }
  if (inserted && initial.code === 'IKRC' && !isCalibrationMode_(initial.mode)) {
    const submittedStationId = safeStr(basePayload.stationId);
    if (submittedStationId) {
      await env.DB.prepare("DELETE FROM sessions WHERE token=? AND kind='IKRC_STATION_FINALIZATION'")
        .bind(ikrcStationFinalizationToken_(submitRound, submittedStationId)).run();
    }
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
  const scopedParticipantRowsRaw = code === 'MOB'
    ? await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY id ASC').bind(code).all()
    : null;
  const scopedParticipantRows = scopedParticipantRowsRaw ? (scopedParticipantRowsRaw.results || []) : [];
  const mobReviewDate = code === 'MOB'
    ? (normalizeEffectiveDate_(actorArg && actorArg.mobReviewDate) || mobActiveParticipantDateFromConfig_(cfg))
    : '';
  const rowsRaw = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id DESC').bind(code).all();
  const rawAll = scopeMobScoreRowsToActiveDate_(code, cfg, scopedParticipantRows, rowsRaw.results || [], mobReviewDate);
  const manager = reviewManageAllowed_(auth.actor, code, actorArg);
  const calibrationOnly = code === 'KCR' && !!(actorArg && actorArg.calibrationOnly);
  const actorRoleForCode = safeStr(auth.actor && auth.actor.roleMap && auth.actor.roleMap[code] || auth.actor && (auth.actor.role || auth.actor.judgeRole));
  if (calibrationOnly && !manager && !isHeadRole_(actorRoleForCode)) {
    return { success:false, message:'KCR 켈리브레이션 결과는 헤드 심사위원 또는 대회팀장·관리자만 확인할 수 있습니다.' };
  }
  const managerStation = code === 'IKRC' && manager ? ikrcActorAssignedStationServer_(auth.actor, cfg) : null;
  const managerRows = managerStation ? rawAll.filter(row => ikrcScoreBelongsToStationServer_(row, managerStation)) : rawAll;
  const raw = calibrationOnly ? managerRows : (manager ? managerRows : rawAll.filter(r => reviewScoreVisibleToActor_(r, auth.actor, code, false)));
  const headers = mergeHeaders(code, raw);
  let list = raw.flatMap(r => rowToReviewItems_(r, code, headers, cfg && cfg.current_round));
  if (manager && list.length) {
    const pRows = scopedParticipantRowsRaw || await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY id ASC').bind(code).all();
    const pIdx = indexParticipantIdentities_(pRows.results || [], code);
    list = list.map(item => enrichReviewItemWithParticipant_(item, lookupParticipantIdentity_(pIdx, item.round || item['라운드'] || (cfg && cfg.current_round), itemNumber_(item) || item.unit), code));
  }
  // 명시적인 켈리브레이션 데이터는 공식 검수에서 분리한다. KCR 결과 확인 화면에서만 읽기 전용으로 노출한다.
  if (calibrationOnly) list = list.filter(item => isCalibrationMode_(item['모드'] || item.mode));
  else if (['KCR','KCAC','KBC','MOB','IKRC'].includes(code)) list = list.filter(item => !isCalibrationMode_(item['모드'] || item.mode));
  let supersededCount = 0;
  if (calibrationOnly) {
    const latest = latestIkrcReviewItems_(list);
    list = latest.list;
    supersededCount = latest.supersededCount;
    list = list.map(item => {
      item._stddev = kcrCalibrationReviewComparison_(item, list);
      return item;
    });
  }
  if (code === 'IKRC') {
    const latest = latestIkrcReviewItems_(list);
    list = latest.list.map(item => {
      if (ikrcOfficialHeadItem_(code, item)) {
        item.status = '검수완료';
        item['검수상태'] = '검수완료';
      }
      return item;
    });
    supersededCount = latest.supersededCount;
    const canCompareOfficialScores = manager;
    if (canCompareOfficialScores && list.length) {
      const allHeaders = mergeHeaders(code, rawAll);
      const allOfficialItems = rawAll
        .flatMap(r => rowToReviewItems_(r, code, allHeaders, cfg && cfg.current_round))
        .filter(item => !isCalibrationMode_(item.mode || item['모드']));
      list = list.map(item => {
        item._stddev = ikrcOfficialReviewComparison_(item, allOfficialItems);
        return item;
      });
    }
  }
  return {
    success: true,
    list,
    headers,
    ownOnly: !manager,
    readOnlyHeadMonitor:calibrationOnly,
    calibrationOnly,
    supersededCount,
    mobReviewDate,
    mobReviewDates:code === 'MOB' ? mobParticipantDatesFromRows_(scopedParticipantRows) : [],
    stationScope:managerStation ? {id:managerStation.id, label:managerStation.label, prefix:managerStation.prefix} : null,
    stationScopes:(managerStation ? [managerStation] : []).map(station => ({id:station.id, label:station.label, prefix:station.prefix}))
  };
}

async function updateReviewRow(env, competitionCode, rowIndex, updates, newStatus, roleText, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const auth = await requireActorForCode_(env, actorArg, code, '검수 수정 권한이 없습니다. 다시 로그인해주세요.');
  if (!auth.ok) return auth.res;
  const actor = auth.actor;
  const manager = reviewManageAllowed_(actor, code, actorArg);
  const ref = parseReviewRowRef_(rowIndex);
  const id = ref.id; if (!id) return { success: false, message: '수정할 행 번호가 없습니다.' };
  const payloadRowIndex = Math.max(0, Number(ref.payloadRowIndex) || 0);
  const current = await env.DB.prepare('SELECT * FROM scores WHERE id=? AND competition_code=?').bind(id, code).first();
  if (!current) return { success: false, message: '수정할 데이터를 찾지 못했습니다.' };
  const cfg = code === 'IKRC' ? await env.DB.prepare('SELECT current_round, option_settings FROM competitions WHERE code=?').bind(code).first() : null;
  const managerStation = code === 'IKRC' && manager ? ikrcActorAssignedStationServer_(actor, cfg) : null;
  if (managerStation && !ikrcScoreBelongsToStationServer_(current, managerStation)) {
    return { success:false, message:`${managerStation.label}에 배정된 팀장은 다른 스테이션 평가를 검수할 수 없습니다.` };
  }
  if (!canReviewScoreRow_(current, actor, code, manager)) return { success: false, message: '본인이 제출한 평가만 직접 검수할 수 있습니다. 전체 검수는 관리자 또는 대회팀장 권한이 필요합니다.' };
  const statusRequested = safeStr(newStatus) || current.review_status || '미검수';
  if (safeStr(current.review_status) === '검수완료' && statusRequested === '미검수' && !manager) {
    return { success: false, message: '검수완료 항목을 미검수로 되돌리는 권한은 관리자 또는 대회팀장에게만 있습니다.' };
  }
  const rowsRaw = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id DESC').bind(code).all();
  const rawAll = rowsRaw.results || [];
  // 검수 수정 컬럼은 getReviewList와 동일한 행 집합 기준으로 계산한다.
  // 심사위원별 payload 필드 차이로 전체 행 기준 헤더를 쓰면 열 번호가 밀릴 수 있다.
  const rawForHeaders = manager
    ? (managerStation ? rawAll.filter(row => ikrcScoreBelongsToStationServer_(row, managerStation)) : rawAll)
    : rawAll.filter(r => reviewScoreVisibleToActor_(r, actor, code, false));
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
    if ((code !== 'KCAC' && code !== 'IKRC') || payload.rows.length <= 1) payload.extraFields[header] = value;
  });
  if (explicitDqTouched && explicitDq === null) explicitDq = false;
  if (explicitDq !== null) {
    if (explicitDq === false && !!current.disqualified && !manager) {
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
  const mocTimeDq = applyMocTimeDisqualificationToPayload_(payload, firstNonEmpty([payload.round, payload.currentRound, current.round]));
  if (mocTimeDq.disqualified) explicitDq = true;
  if (code === 'MOB') {
    const mobComp = mobExtraComponents_(singleRowExtra_(payload, code, targetRowIndex));
    if (mobComp.hasRaw) {
      writeMobDerivedFields_(row0.extraFields, mobComp);
      if (payload.rows.length <= 1) writeMobDerivedFields_(payload.extraFields, mobComp);
    }
  }
  const tmpHeaders = mergeHeaders(code, [{...current, payload_json: JSON.stringify(payload)}]);
  const item = rowToReviewItem({...current, disqualified: explicitDq === null ? current.disqualified : boolInt(explicitDq), disqualification_reason: explicitDq === false ? '' : current.disqualification_reason, payload_json: JSON.stringify(payload)}, code, tmpHeaders, '', targetRowIndex); const inferred = inferScorePayload(payload);
  const unit = firstNonEmpty([item.unit, current.unit, inferred.unit]); const participantName = firstNonEmpty([item.participantName, current.participant_name, inferred.participantName]);
  const canonicalTotal = canonicalScoreForPayload_(code, payload, targetRowIndex);
  const total = canonicalTotal !== null && canonicalTotal !== undefined ? canonicalTotal : (inferred.total !== null && inferred.total !== undefined ? inferred.total : current.total_score);
  payload.totalScore = total;
  payload.computedTotalScore = total;
  const dq = explicitDq !== null ? explicitDq : (isDisqualifiedValue_(item['실격여부']) || inferred.disqualified || !!current.disqualified);
  const dqReason = dq ? firstNonEmpty([item['실격사유'], inferred.dqReason, current.disqualification_reason]) : '';
  const status = statusRequested;
  await env.DB.prepare(`UPDATE scores SET unit=?, participant_name=?, total_score=?, disqualified=?, disqualification_reason=?, review_status=?, payload_json=? WHERE id=? AND competition_code=?`)
    .bind(unit, participantName, total === null || total === undefined || Number.isNaN(Number(total)) ? null : Number(total), boolInt(dq), dqReason, status, JSON.stringify(payload), id, code).run();
  if (code === 'IKRC') await invalidateIkrcStationFinalizationForScore_(env, current, cfg);
  return { success: true, message: '검수 수정 저장 완료', rowIndex: id, status };
}
async function updateReviewStatus(env, competitionCode, rowIndexes, newStatus, roleText, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const auth = await requireActorForCode_(env, actorArg, code, '검수 상태 변경 권한이 없습니다. 다시 로그인해주세요.');
  if (!auth.ok) return auth.res;
  const manager = reviewManageAllowed_(auth.actor, code, actorArg);
  if (code === 'IKRC' && !manager && actorReviewRoleCategory_(auth.actor, code) === 'head') {
    return { success:false, message:'IKRC 헤드 심사위원 화면은 스테이션 통계 확인 전용입니다. 검수 상태는 변경되지 않습니다.' };
  }
  const cfg = code === 'IKRC' ? await env.DB.prepare('SELECT current_round, option_settings FROM competitions WHERE code=?').bind(code).first() : null;
  const managerStation = code === 'IKRC' && manager ? ikrcActorAssignedStationServer_(auth.actor, cfg) : null;
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
    if (code === 'IKRC' && !isCalibrationMode_(ikrcScoreMode_(cur)) && isHeadRole_(cur.role)) {
      if (status !== '검수완료') return { success:false, message:'IKRC 헤드 대회평가는 제출 즉시 확정되므로 검수 상태를 변경하지 않습니다.' };
      if (!reviewCompletedStatus_(cur.review_status)) {
        await env.DB.prepare("UPDATE scores SET review_status='검수완료' WHERE id=? AND competition_code='IKRC'").bind(id).run();
      }
      continue;
    }
    if (managerStation && !ikrcScoreBelongsToStationServer_(cur, managerStation)) {
      return { success:false, message:`${managerStation.label}에 배정된 팀장은 다른 스테이션 평가 상태를 변경할 수 없습니다.` };
    }
    if (!canReviewScoreRow_(cur, auth.actor, code, manager)) {
      return { success: false, message: '본인이 제출한 평가만 직접 검수할 수 있습니다. 전체 검수는 관리자 또는 대회팀장 권한이 필요합니다.' };
    }
    if (safeStr(cur.review_status) === '검수완료' && status !== '검수완료' && !manager) {
      return { success: false, message: '검수완료 항목을 되돌리는 권한은 관리자 또는 대회팀장에게만 있습니다.' };
    }
    await env.DB.prepare('UPDATE scores SET review_status=? WHERE id=? AND competition_code=?').bind(status, id, code).run();
    if (code === 'IKRC') await invalidateIkrcStationFinalizationForScore_(env, cur, cfg);
  }
  return { success: true, message: '상태 변경 완료' };
}
async function deleteReviewRow(env, competitionCode, rowIndex, actorArg) {
  const code = safeStr(competitionCode).toUpperCase();
  const actor = await getActor(env, actorArg);
  if (!hasAdmin(actor)) return { success: false, message: '삭제는 전체 관리자만 가능합니다.' };
  const ref = parseReviewRowRef_(rowIndex);
  const current = code === 'IKRC' ? await env.DB.prepare('SELECT * FROM scores WHERE id=? AND competition_code=?').bind(ref.id, code).first() : null;
  const cfg = code === 'IKRC' ? await env.DB.prepare('SELECT current_round, option_settings FROM competitions WHERE code=?').bind(code).first() : null;
  await env.DB.prepare('DELETE FROM scores WHERE id=? AND competition_code=?').bind(ref.id, code).run();
  if (code === 'IKRC' && current) await invalidateIkrcStationFinalizationForScore_(env, current, cfg);
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
  // 헤드1팀 / 센서리1팀 / Head A / Team A처럼 접두어가 달라도 같은 역할 그룹이면 운영 중 비교 가능해야 한다.
  const normalize = v => safeStr(v)
    .replace(/헤드|심사위원|심사|센서리|테크니컬|기술|팀|조|MOB|IKRC|head|judge|sensory|sensor|technical|tech|team|group|station/ig,'')
    .replace(/[^0-9a-zA-Z가-힣]/g,'')
    .toLowerCase();
  const reqCore = normalize(req);
  const rowCore = normalize(row);
  return !!reqCore && !!rowCore && (reqCore === rowCore || reqCore.indexOf(rowCore) > -1 || rowCore.indexOf(reqCore) > -1);
}
function calibrationSortValue_(item) {
  const t = safeStr(item && (item.submittedAt || item['제출시간'] || item.createdAt || item['생성시간']));
  const id = Number(item && (item.rowIndex || item.id || 0)) || 0;
  return [t, String(id).padStart(12, '0')].join('|');
}
function calibrationJudgeIdentityKey_(item) {
  item = item || {};
  const judge = itemJudgeIdentityKey_(item);
  const round = safeStr(item.round || item['라운드']).replace(/\s+/g,'').toLowerCase();
  const subject = safeStr(
    item.unit || item['샘플번호'] || item['컵번호'] || item['참가자번호'] ||
    item['참가자 번호'] || item.participantNo || item.sampleNo || item.teamNo
  ).replace(/\s+/g,'').toUpperCase();
  const role = safeStr(item.role || item['역할'] || item.judgeRole || item['심사위원역할']).replace(/\s+/g,'').toLowerCase();
  const team = safeStr(item.team || item['팀'] || item.teamGroup || item['평가팀']).replace(/\s+/g,'').toLowerCase();
  const mode = safeStr(item.mode || item['모드']).replace(/\s+/g,'').toLowerCase();
  return [judge || ('row' + safeStr(item.rowIndex || item.id || '')), round, subject, role, team, mode].join('|');
}
function latestCalibrationRowsByJudge_(rows) {
  const map = new Map();
  (rows || []).forEach(item => {
    const key = calibrationJudgeIdentityKey_(item);
    const prev = map.get(key);
    if (!prev || calibrationSortValue_(item) >= calibrationSortValue_(prev)) map.set(key, item);
  });
  return Array.from(map.values()).sort((a,b) => {
    const aj = safeStr(a.judgeName || a['심사위원명']).localeCompare(safeStr(b.judgeName || b['심사위원명']), 'ko');
    if (aj) return aj;
    return calibrationSortValue_(a).localeCompare(calibrationSortValue_(b));
  });
}
function canonicalCalibrationScopeTeam_(team) {
  const t = safeStr(team);
  return t ? ('TEAM:' + t.replace(/\s+/g, '_').slice(0, 64)) : 'ALL';
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
    isHeadCalibration: isHeadRole_(item['역할'] || item.role),
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
  const auth = await requireActorForCode_(env, actorArg, 'MOB', 'MOB 심사 켈리브레이션 확인 권한이 없습니다. 다시 로그인해주세요.');
  if (!auth.ok) return { error: auth.res };
  const roleMap = auth.actor && auth.actor.roleMap && typeof auth.actor.roleMap === 'object' ? auth.actor.roleMap : {};
  const actorRole = safeStr(roleMap.MOB || (auth.actor && auth.actor.role));
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
    // MOB는 IKRC식 스테이션/팀 켈리브레이션이 아니다. 동일 참가자·라운드·역할
    // 카테고리의 일반 대회평가와 헤드 기준점수를 함께 비교한다.
    return true;
  });
  return { auth, category, currentRound, rows, label: mobCategoryLabelServer_(category) };
}
async function getMobCalibrationParticipantNumbers(env, requestedTeam, roleText, actorArg) {
  const data = await mobCalibrationRows_(env, requestedTeam, roleText, actorArg);
  if (data.error) return data.error;
  const normal = latestCalibrationRowsByJudge_(data.rows.filter(item => !isCalibrationMode_(item['모드'] || item.mode) && !isHeadRole_(item['역할'] || item.role)));
  if (!normal.length) return [];
  const checksRaw = await env.DB.prepare('SELECT token, payload_json FROM sessions WHERE kind=?').bind('MOB_CALIBRATION_CHECK').all();
  const checks = new Map();
  (checksRaw.results || []).forEach(r => checks.set(r.token, parseJson(r.payload_json, {})));
  const by = new Map();
  normal.forEach(item => {
    const no = mobCalNumberFromItem_(item);
    const token = mobCalCheckToken_(canonicalCalibrationScopeTeam_(), data.category, no, data.currentRound);
    const legacyToken = mobCalCheckToken_(requestedTeam, data.category, no, data.currentRound);
    const cur = by.get(no) || { participantNo:no, checked:false, judgeCount:0, headCount:0, latestSubmittedAt:'', checkedAt:'', checkerName:'', categoryLabel:data.label };
    cur.judgeCount += 1;
    const submittedAt = safeStr(item.submittedAt || item['제출시간']);
    if (submittedAt && (!cur.latestSubmittedAt || submittedAt > cur.latestSubmittedAt)) cur.latestSubmittedAt = submittedAt;
    const check = checks.get(token) || checks.get(legacyToken);
    if (check && check.checkedAt) { cur.checked = true; cur.checkedAt = check.checkedAt; cur.checkerName = check.checkerName || ''; }
    by.set(no, cur);
  });
  // 확인완료 뒤에도 헤드가 점수·코멘트를 다시 열어볼 수 있도록 목록에 유지한다.
  return Array.from(by.values()).sort((a,b) => safeStr(a.participantNo).localeCompare(safeStr(b.participantNo), 'ko', {numeric:true}));
}
async function getMobCalibrationResultsByParticipant(env, participantNo, requestedTeam, roleText, actorArg) {
  const data = await mobCalibrationRows_(env, requestedTeam, roleText, actorArg);
  if (data.error) return data.error;
  const no = safeStr(participantNo);
  if (!no) return [];
  const targetRows = data.rows.filter(item => mobCalNumberFromItem_(item) === no);
  const normal = latestCalibrationRowsByJudge_(targetRows.filter(item => !isCalibrationMode_(item['모드'] || item.mode) && !isHeadRole_(item['역할'] || item.role)));
  const heads = latestCalibrationRowsByJudge_(targetRows.filter(item => isCalibrationMode_(item['모드'] || item.mode) && isHeadRole_(item['역할'] || item.role)));
  return normal.concat(heads).map(mobScoreObjectFromItem_).sort((a,b) => Number(a.isHeadCalibration) - Number(b.isHeadCalibration) || safeStr(a.judgeName).localeCompare(safeStr(b.judgeName), 'ko'));
}
async function markMobCalibrationChecked(env, participantNo, requestedTeam, checkerName, roleText, actorArg) {
  const data = await mobCalibrationRows_(env, requestedTeam, roleText, actorArg);
  if (data.error) return data.error;
  const no = safeStr(participantNo);
  if (!no) return { success:false, message:'참가자 번호가 없습니다.' };
  const scopeTeam = canonicalCalibrationScopeTeam_();
  const token = mobCalCheckToken_(scopeTeam, data.category, no, data.currentRound);
  const payload = { competitionCode:'MOB', participantNo:no, team:safeStr(requestedTeam), scopeTeam, category:data.category, role:safeStr(roleText), checkerName:safeStr(checkerName), checkedAt:nowIso(), round:data.currentRound };
  await env.DB.prepare('INSERT OR REPLACE INTO sessions (token, kind, payload_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, 'MOB_CALIBRATION_CHECK', JSON.stringify(payload), '2035-12-31T23:59:59.000Z', nowIso()).run();
  return { success:true, message:'검수완료 처리되었습니다.', participantNo:no, checkedAt:payload.checkedAt };
}


function ikrcCalCheckToken_(scopeKey, sampleNo, round, checkerKey) {
  return 'IKRC_CAL_CHECK_V2:' + [safeStr(scopeKey) || 'ALL', safeStr(round) || '-', safeStr(sampleNo), safeStr(checkerKey) || '-'].map(encodeURIComponent).join(':');
}
function ikrcCalibrationCheckerKey_(actor) {
  actor = actor || {};
  return operatorIdentityKey_(actor.name || actor.judgeName || actor.operatorName || '', actor.phone || '') || normalizePersonName_(actor.name || actor.judgeName || actor.operatorName || '') || 'manager';
}
function ikrcCalibrationScope_(requestedScope, actor, stations=[]) {
  const raw = requestedScope && typeof requestedScope === 'object' ? requestedScope : { scope:'station', team:requestedScope };
  let team = safeStr(raw.team || raw.requestedTeam);
  let scope = safeStr(raw.scope || raw.mode).toLowerCase() === 'all' ? 'all' : 'station';
  const requestedStationId = safeStr(raw.stationId || raw.stationID);
  const station = scope === 'station' ? ((stations || []).find(item => safeStr(item.id) === requestedStationId) || ikrcFindStationByAssignmentServer_(team, stations)) : null;
  if (scope === 'station' && !station) team = '';
  if (station) team = station.label;
  const key = scope === 'station' ? ('STATION:' + safeStr((station && station.id) || team).replace(/\s+/g, '_').slice(0, 64)) : 'ALL';
  return {
    scope,
    team,
    station:station ? {id:station.id, label:station.label, prefix:station.prefix} : null,
    key,
    label:scope === 'station' ? ('스테이션 · ' + (station ? station.label : team)) : '전체 심사위원'
  };
}
function ikrcStationCalibrationMode_(mode) {
  return isCalibrationMode_(mode) && /팀별|스테이션|station/i.test(safeStr(mode));
}
function ikrcScoreMode_(scoreRow) {
  const payload = parseJson(scoreRow && scoreRow.payload_json, {});
  return safeStr((scoreRow && scoreRow.mode) || payload.mode || payload.evalMode);
}
function ikrcScoreRound_(scoreRow) {
  const payload = parseJson(scoreRow && scoreRow.payload_json, {});
  return safeStr((scoreRow && scoreRow.round) || payload.round || payload.currentRound || payload.roundName);
}
function ikrcHeadCalibrationStations_(scoreRows, actor, stations, currentRound) {
  const allowed = (stations || []).filter(station => (scoreRows || []).some(scoreRow => {
    if (!scoreOwnedByActor_(scoreRow, actor)) return false;
    if (!ikrcStationCalibrationMode_(ikrcScoreMode_(scoreRow))) return false;
    const scoreRound = ikrcScoreRound_(scoreRow);
    if (currentRound && scoreRound && scoreRound !== currentRound) return false;
    return ikrcScoreBelongsToStationServer_(scoreRow, station);
  }));
  const teamMap = actor && actor.teamMap && typeof actor.teamMap === 'object' ? actor.teamMap : {};
  const assignments = [teamMap.IKRC, actor && actor.teamGroup, actor && actor.team, actor && actor.requestedTeam].map(safeStr).filter(Boolean);
  assignments.forEach(assignment => {
    const assigned = ikrcFindStationByAssignmentServer_(assignment, stations || []);
    if (assigned && !allowed.some(station => safeStr(station.id) === safeStr(assigned.id))) allowed.push(assigned);
  });
  return allowed;
}
function ikrcHeadOfficialStations_(scoreRows, actor, stations, currentRound) {
  const assigned = ikrcFindStationByAssignmentServer_(ikrcActorTeamServer_(actor), stations || []);
  if (assigned) return [assigned];
  return (stations || []).filter(station => (scoreRows || []).some(scoreRow => {
    if (!scoreOwnedByActor_(scoreRow, actor)) return false;
    if (isCalibrationMode_(ikrcScoreMode_(scoreRow))) return false;
    const scoreRound = ikrcScoreRound_(scoreRow);
    if (currentRound && scoreRound && scoreRound !== currentRound) return false;
    return ikrcScoreBelongsToStationServer_(scoreRow, station);
  }));
}
async function getIkrcCalibrationScopeOptions(env, actorArg) {
  const auth = await requireActorForCode_(env, actorArg, 'IKRC', 'IKRC 심사 켈리브레이션 확인 권한이 없습니다. 다시 로그인해주세요.');
  if (!auth.ok) return auth.res;
  const roleMap = auth.actor && auth.actor.roleMap && typeof auth.actor.roleMap === 'object' ? auth.actor.roleMap : {};
  const actorRole = safeStr(roleMap.IKRC || (auth.actor && (auth.actor.role || auth.actor.judgeRole || auth.actor.operatorRole)));
  const canManageAll = hasManageAccess(auth.actor, 'IKRC');
  if (!isHeadRole_(actorRole) && !canManageAll) return { success:false, message:'심사 켈리브레이션 확인 권한이 없습니다.' };
  const cfg = await env.DB.prepare('SELECT current_round, option_settings FROM competitions WHERE code=?').bind('IKRC').first();
  const currentRound = safeStr(cfg && cfg.current_round);
  const stations = ikrcStationsForPurposeServer_(cfg, currentRound, 'calibration');
  const rawRows = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id ASC').bind('IKRC').all();
  const allowed = canManageAll ? stations : ikrcHeadCalibrationStations_(rawRows.results || [], auth.actor, stations, currentRound);
  return {
    success:true,
    currentRound,
    canViewOverall:false,
    canManageAll,
    stations:allowed.map(station => ({ id:station.id, label:station.label, prefix:station.prefix, start:station.start, end:station.end }))
  };
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
    isHeadCalibration: isHeadRole_(item['역할'] || item.role)
  };
}
function ikrcSensoryBaseScoreFromItem_(item) {
  item = item || {};
  const flavor = firstNumberFromKeys_(item, ['Flavor(플레이버) ×3','Flavor(플레이버)','Flavor']);
  const clean = firstNumberFromKeys_(item, ['Clean Cup(클린컵) ×2','Clean Cup(클린컵)','Clean Cup']);
  const sweet = firstNumberFromKeys_(item, ['Sweetness(스윗니스) ×2','Sweetness(스윗니스)','Sweetness']);
  const acidity = firstNumberFromKeys_(item, ['Acidity(산미)','Acidity']);
  const mouth = firstNumberFromKeys_(item, ['Mouthfeel(마우스필) ×2','Mouthfeel(마우스필)','Mouthfeel']);
  if ([flavor, clean, sweet, acidity, mouth].every(v => v !== null)) return roundScoreValue_((flavor * 3) + (clean * 2) + (sweet * 2) + acidity + (mouth * 2));
  const direct = toNumber(item['총점'] ?? item.totalScore);
  if (direct === null) return null;
  const seed = roundName_(item.round || item['라운드'], '') === '결선' ? ikrcSeedBonusFromExtra_(item) : 0;
  return roundScoreValue_(Math.max(0, direct - seed));
}
async function ikrcCalibrationRows_(env, requestedScope, actorArg) {
  const auth = await requireActorForCode_(env, actorArg, 'IKRC', 'IKRC 심사 켈리브레이션 확인 권한이 없습니다. 다시 로그인해주세요.');
  if (!auth.ok) return { error: auth.res };
  const roleMap = auth.actor && auth.actor.roleMap && typeof auth.actor.roleMap === 'object' ? auth.actor.roleMap : {};
  const actorRole = safeStr(roleMap.IKRC || (auth.actor && (auth.actor.role || auth.actor.judgeRole || auth.actor.operatorRole)));
  const canManageAll = hasManageAccess(auth.actor, 'IKRC');
  if (!isHeadRole_(actorRole) && !canManageAll) return { error: { success:false, message:'심사 켈리브레이션 확인 권한이 없습니다.' } };
  const checkerKey = ikrcCalibrationCheckerKey_(auth.actor);
  const cfg = await env.DB.prepare('SELECT current_round, option_settings FROM competitions WHERE code=?').bind('IKRC').first();
  const currentRound = safeStr(cfg && cfg.current_round);
  const stations = ikrcStationsForPurposeServer_(cfg, currentRound, 'calibration');
  const rawRows = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id ASC').bind('IKRC').all();
  let scope = ikrcCalibrationScope_(requestedScope, auth.actor, stations);
  const allowedStations = canManageAll ? stations : ikrcHeadCalibrationStations_(rawRows.results || [], auth.actor, stations, currentRound);
  if (scope.scope !== 'station') scope = ikrcCalibrationScope_({scope:'station', stationId:allowedStations[0] && allowedStations[0].id}, auth.actor, stations);
  if (scope.scope === 'station') {
    const requestedStation = scope.station || (!safeStr(requestedScope && requestedScope.stationId) ? allowedStations[0] : null);
    if (!requestedStation || !allowedStations.some(station => safeStr(station.id) === safeStr(requestedStation.id))) {
      return { error: { success:false, message:'확인할 수 있는 스테이션 결과가 아직 없습니다.' } };
    }
    scope = ikrcCalibrationScope_({scope:'station', stationId:requestedStation.id, team:requestedStation.label}, auth.actor, stations);
  }
  const headers = mergeHeaders('IKRC', rawRows.results || []);
  let rows = (rawRows.results || []).map(r => rowToReviewItem(r, 'IKRC', headers, currentRound));
  rows = rows.filter(item => {
    const no = ikrcSampleNoFromItem_(item);
    if (!no) return false;
    if (currentRound && safeStr(item.round || item['라운드']) && safeStr(item.round || item['라운드']) !== currentRound) return false;
    const mode = safeStr(item['모드'] || item.mode);
    if (!isCalibrationMode_(mode)) return false;
    if (scope.scope === 'station') {
      if (!/팀별|스테이션/.test(mode)) return false;
      if (scope.station) return ikrcPayloadBelongsToStationServer_(item.payload, scope.station, ikrcSampleNoFromItem_(item));
      const rowTeam = safeStr(item['팀'] || item.team || item['평가팀']);
      if (!rowTeam || !mobTeamMatchesServer_(scope.team, rowTeam)) return false;
    } else if (/팀별|스테이션/.test(mode)) return false;
    return true;
  });
  return { auth, currentRound, rows, scope, checkerKey };
}
async function getIkrcCalibrationCupNumbers(env, requestedScope, actorArg) {
  const data = await ikrcCalibrationRows_(env, requestedScope, actorArg);
  if (data.error) return data.error;
  const normal = latestCalibrationRowsByJudge_(data.rows.filter(item => !isHeadRole_(item['역할'] || item.role)));
  const heads = latestCalibrationRowsByJudge_(data.rows.filter(item => isHeadRole_(item['역할'] || item.role)));
  const visibleRows = normal.concat(heads);
  if (!visibleRows.length) return [];
  const checksRaw = await env.DB.prepare('SELECT token, payload_json FROM sessions WHERE kind=?').bind('IKRC_CALIBRATION_CHECK').all();
  const checks = new Map();
  (checksRaw.results || []).forEach(r => checks.set(r.token, parseJson(r.payload_json, {})));
  const by = new Map();
  visibleRows.forEach(item => {
    const sampleNo = ikrcSampleNoFromItem_(item);
    const token = ikrcCalCheckToken_(data.scope.key, sampleNo, data.currentRound, data.checkerKey);
    const cur = by.get(sampleNo) || { sampleNo, checked:false, judgeCount:0, headCount:0, latestSubmittedAt:'', checkedAt:'', checkerName:'' };
    if (isHeadRole_(item['역할'] || item.role)) cur.headCount += 1;
    else cur.judgeCount += 1;
    const submittedAt = safeStr(item.submittedAt || item['제출시간']);
    if (submittedAt && (!cur.latestSubmittedAt || submittedAt > cur.latestSubmittedAt)) cur.latestSubmittedAt = submittedAt;
    const check = checks.get(token);
    if (check && check.checkedAt) { cur.checkedAt = check.checkedAt; cur.checkerName = check.checkerName || ''; }
    by.set(sampleNo, cur);
  });
  return Array.from(by.values()).map(item => {
    item.checked = !!item.checkedAt && (!item.latestSubmittedAt || item.latestSubmittedAt <= item.checkedAt);
    return item;
  }).sort((a,b) => Number(a.checked) - Number(b.checked) || safeStr(a.sampleNo).localeCompare(safeStr(b.sampleNo), 'ko', {numeric:true}));
}
async function getIkrcCalibrationResultsByCup(env, sampleNo, requestedScope, actorArg) {
  const data = await ikrcCalibrationRows_(env, requestedScope, actorArg);
  if (data.error) return data.error;
  const no = safeStr(sampleNo);
  if (!no) return [];
  const targetRows = data.rows.filter(item => ikrcSampleNoFromItem_(item) === no);
  const normal = latestCalibrationRowsByJudge_(targetRows.filter(item => !isHeadRole_(item['역할'] || item.role)));
  const heads = latestCalibrationRowsByJudge_(targetRows.filter(item => isHeadRole_(item['역할'] || item.role)));
  return normal.concat(heads).map(ikrcScoreObjectFromItem_).sort((a,b) => Number(a.isHeadCalibration) - Number(b.isHeadCalibration) || safeStr(a.judgeName).localeCompare(safeStr(b.judgeName), 'ko'));
}
async function markIkrcCalibrationChecked(env, sampleNo, requestedScope, checkerName, roleText, actorArg) {
  const data = await ikrcCalibrationRows_(env, requestedScope, actorArg);
  if (data.error) return data.error;
  const no = safeStr(sampleNo);
  if (!no) return { success:false, message:'컵/샘플 번호가 없습니다.' };
  const token = ikrcCalCheckToken_(data.scope.key, no, data.currentRound, data.checkerKey);
  const payload = { competitionCode:'IKRC', sampleNo:no, team:data.scope.team, scope:data.scope.scope, scopeKey:data.scope.key, checkerKey:data.checkerKey, role:safeStr(roleText), checkerName:safeStr(checkerName), checkedAt:nowIso(), round:data.currentRound };
  await env.DB.prepare('INSERT OR REPLACE INTO sessions (token, kind, payload_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, 'IKRC_CALIBRATION_CHECK', JSON.stringify(payload), '2035-12-31T23:59:59.000Z', nowIso()).run();
  return { success:true, message:'현재 범위와 내 계정에 확인 처리되었습니다.', sampleNo:no, checkedAt:payload.checkedAt, scope:data.scope };
}

function latestOfficialJudgeRowsByUnit_(rows) {
  const byUnit = new Map();
  (rows || []).forEach(item => {
    const unit = ikrcSampleNoFromItem_(item) || itemNumber_(item) || safeStr(item && item.rowIndex);
    if (!unit) return;
    if (!byUnit.has(unit)) byUnit.set(unit, []);
    byUnit.get(unit).push(item);
  });
  return Array.from(byUnit.values()).flatMap(latestOfficialJudgeRows_);
}
function ikrcStationFinalizationToken_(round, stationId) {
  return 'IKRC_STATION_FINAL:' + [safeStr(round) || '-', safeStr(stationId) || '-'].map(encodeURIComponent).join(':');
}
async function getIkrcStationFinalization_(env, round, station) {
  if (!station) return null;
  const token = ikrcStationFinalizationToken_(round, station.id);
  const row = await env.DB.prepare("SELECT payload_json FROM sessions WHERE token=? AND kind='IKRC_STATION_FINALIZATION'").bind(token).first();
  return row ? parseJson(row.payload_json, null) : null;
}
async function invalidateIkrcStationFinalizationForScore_(env, scoreRow, cfg) {
  if (!scoreRow || isCalibrationMode_(ikrcScoreMode_(scoreRow))) return;
  const round = ikrcScoreRound_(scoreRow) || safeStr(cfg && cfg.current_round);
  const station = ikrcStationsForPurposeServer_(cfg, round, 'competition').find(item => ikrcScoreBelongsToStationServer_(scoreRow, item));
  if (!station) return;
  await env.DB.prepare("DELETE FROM sessions WHERE token=? AND kind='IKRC_STATION_FINALIZATION'")
    .bind(ikrcStationFinalizationToken_(round, station.id)).run();
}
async function ikrcOfficialCalibrationRows_(env, requestedScope, actorArg) {
  const auth = await requireActorForCode_(env, actorArg, 'IKRC', 'IKRC 대회평가 스테이션 확인 권한이 없습니다. 다시 로그인해주세요.');
  if (!auth.ok) return { error:auth.res };
  const roleMap = auth.actor && auth.actor.roleMap && typeof auth.actor.roleMap === 'object' ? auth.actor.roleMap : {};
  const actorRole = safeStr(roleMap.IKRC || (auth.actor && (auth.actor.role || auth.actor.judgeRole || auth.actor.operatorRole)));
  const canManageAll = hasManageAccess(auth.actor, 'IKRC');
  if (!isHeadRole_(actorRole) && !canManageAll) {
    return { error:{ success:false, message:'대회평가 결과 확인 권한이 없습니다.' } };
  }
  const cfg = await env.DB.prepare('SELECT current_round, option_settings FROM competitions WHERE code=?').bind('IKRC').first();
  const currentRound = safeStr(cfg && cfg.current_round);
  const stations = ikrcStationsForPurposeServer_(cfg, currentRound, 'competition');
  const rawRows = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id ASC').bind('IKRC').all();
  const allowedStations = canManageAll ? stations : ikrcHeadOfficialStations_(rawRows.results || [], auth.actor, stations, currentRound);
  let scope = ikrcCalibrationScope_(requestedScope, auth.actor, stations);
  // 전체 켈리브레이션은 사용하지 않는다. 헤드·대회팀장·관리자 모두 선택한 스테이션 단위로 확인한다.
  if (scope.scope !== 'station') scope = ikrcCalibrationScope_({scope:'station', stationId:allowedStations[0] && allowedStations[0].id}, auth.actor, stations);
  if (scope.scope === 'station') {
    const requestedStation = scope.station || (!safeStr(requestedScope && requestedScope.stationId) ? allowedStations[0] : null);
    if (!requestedStation || !allowedStations.some(station => safeStr(station.id) === safeStr(requestedStation.id))) {
      return { error:{ success:false, message:'확인할 수 있는 스테이션 결과가 아직 없습니다.' } };
    }
    scope = ikrcCalibrationScope_({scope:'station', stationId:requestedStation.id, team:requestedStation.label}, auth.actor, stations);
  }
  const allRaw = rawRows.results || [];
  const headers = mergeHeaders('IKRC', allRaw);
  let rows = allRaw.filter(scoreRow => {
    if (isCalibrationMode_(ikrcScoreMode_(scoreRow))) return false;
    const scoreRound = ikrcScoreRound_(scoreRow);
    if (currentRound && scoreRound && scoreRound !== currentRound) return false;
    if (scope.scope === 'station' && scope.station && !ikrcScoreBelongsToStationServer_(scoreRow, scope.station)) return false;
    return true;
  }).map(row => rowToReviewItem(row, 'IKRC', headers, currentRound));
  rows = latestOfficialJudgeRowsByUnit_(rows);
  return { auth, actorRole, canManageAll, cfg, currentRound, stations, allowedStations, scope, rows };
}
async function getIkrcOfficialCalibrationScopeOptions(env, actorArg) {
  const data = await ikrcOfficialCalibrationRows_(env, {scope:'station'}, actorArg);
  if (data.error) return data.error;
  return {
    success:true,
    currentRound:data.currentRound,
    canViewOverall:false,
    canManageAll:!!data.canManageAll,
    stations:data.allowedStations.map(station => ({ id:station.id, label:station.label, prefix:station.prefix, start:station.start, end:station.end }))
  };
}
async function getIkrcOfficialCalibrationCupNumbers(env, requestedScope, actorArg) {
  const data = await ikrcOfficialCalibrationRows_(env, requestedScope, actorArg);
  if (data.error) return data.error;
  const bySample = new Map();
  data.rows.forEach(item => {
    const sampleNo = ikrcSampleNoFromItem_(item);
    if (!sampleNo) return;
    const cur = bySample.get(sampleNo) || { sampleNo, judgeCount:0, headCount:0, sensoryReviewCount:0, panelComplete:false, reviewComplete:false, latestSubmittedAt:'' };
    if (isHeadRole_(item['역할'] || item.role)) cur.headCount += 1;
    else {
      cur.judgeCount += 1;
      if (reviewCompletedStatus_(item['검수상태'] || item.status)) cur.sensoryReviewCount += 1;
    }
    const submittedAt = safeStr(item.submittedAt || item['제출시간']);
    if (submittedAt && (!cur.latestSubmittedAt || submittedAt > cur.latestSubmittedAt)) cur.latestSubmittedAt = submittedAt;
    bySample.set(sampleNo, cur);
  });
  const items = Array.from(bySample.values()).map(item => {
    item.panelComplete = item.headCount + item.judgeCount > 0;
    item.reviewComplete = item.judgeCount > 0 && item.sensoryReviewCount === item.judgeCount;
    return item;
  }).sort((a,b) => Number(a.reviewComplete) - Number(b.reviewComplete) || safeStr(a.sampleNo).localeCompare(safeStr(b.sampleNo), 'ko', {numeric:true}));
  const finalization = data.scope.scope === 'station' ? await getIkrcStationFinalization_(env, data.currentRound, data.scope.station) : null;
  return { success:true, items, finalization };
}
async function getIkrcOfficialCalibrationResultsByCup(env, sampleNo, requestedScope, actorArg) {
  const data = await ikrcOfficialCalibrationRows_(env, requestedScope, actorArg);
  if (data.error) return data.error;
  const no = safeStr(sampleNo);
  if (!no) return { success:false, message:'샘플 번호가 없습니다.' };
  const target = latestOfficialJudgeRows_(data.rows.filter(item => ikrcSampleNoFromItem_(item) === no));
  const sensory = target.filter(item => !isHeadRole_(item['역할'] || item.role));
  const heads = target.filter(item => isHeadRole_(item['역할'] || item.role));
  const submittedRows = heads.concat(sensory);
  const panelComplete = submittedRows.length > 0;
  const finalAverage = panelComplete ? reviewPopulationStats_(submittedRows.map(item => ikrcScoreObjectFromItem_(item).total)).avg : null;
  return {
    success:true,
    sampleNo:no,
    scope:data.scope,
    rows:sensory.map(ikrcScoreObjectFromItem_).sort((a,b) => safeStr(a.judgeName).localeCompare(safeStr(b.judgeName), 'ko')),
    judgeCount:sensory.length,
    headCount:heads.length,
    sensoryReviewCount:sensory.filter(item => reviewCompletedStatus_(item['검수상태'] || item.status)).length,
    reviewComplete:sensory.length > 0 && sensory.every(item => reviewCompletedStatus_(item['검수상태'] || item.status)),
    panelComplete,
    finalAverage,
    headScoreHidden:true,
    message:panelComplete ? `현재 제출된 헤드 ${heads.length}명과 센서리 ${sensory.length}명의 공식 평가를 표시합니다.` : '아직 제출된 공식 평가가 없습니다.'
  };
}
async function finalizeIkrcStationEvaluation(env, requestedScope, actorArg) {
  const data = await ikrcOfficialCalibrationRows_(env, requestedScope, actorArg);
  if (data.error) return data.error;
  if (data.scope.scope !== 'station' || !data.scope.station) return { success:false, message:'최종확정할 스테이션을 먼저 선택해주세요.' };
  const targetStation = data.stations.find(item => safeStr(item.id) === safeStr(data.scope.station.id)) || data.scope.station;
  const units = ikrcUnitsForStationsServer_([targetStation]).map(item => item.unit);
  const stationRows = data.rows.filter(item => units.includes(ikrcSampleNoFromItem_(item)));
  if (!stationRows.length) return { success:false, message:'이 스테이션에 제출된 공식 평가가 없습니다. 평가 제출 후 다시 확인해주세요.' };
  const panels = units.map(unit => {
    const panel = ikrcOfficialPanelRows_(stationRows.filter(item => ikrcSampleNoFromItem_(item) === unit));
    return { unit, headCount:panel.headCount, sensoryCount:panel.sensoryCount, submittedCount:panel.headCount + panel.sensoryCount };
  });
  const payload = {
    competitionCode:'IKRC', round:data.currentRound, stationId:targetStation.id,
    stationLabel:targetStation.label, stationPrefix:targetStation.prefix,
    units, panels, submittedCount:stationRows.length,
    confirmedBy:safeStr(data.auth.actor && data.auth.actor.name), confirmedRole:data.actorRole,
    confirmedAt:nowIso()
  };
  const token = ikrcStationFinalizationToken_(data.currentRound, targetStation.id);
  await env.DB.prepare('INSERT OR REPLACE INTO sessions (token, kind, payload_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, 'IKRC_STATION_FINALIZATION', JSON.stringify(payload), '2035-12-31T23:59:59.000Z', payload.confirmedAt).run();
  return { success:true, message:`${targetStation.label}의 현재 제출 점수를 최종확정했습니다. 심사 인원수는 강제하지 않으며, 이후 제출이나 수정이 생기면 확정은 자동 해제됩니다.`, finalization:payload };
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
  if (roundName_(item.round || item['라운드'], '') !== '결선') return item;
  let best = null;
  for (const key of ikrcSeedTargetKeysForItem_(item)) {
    const p = seedMap.get(key);
    if (p && p.bonus !== undefined) { best = p; break; }
  }
  if (!best) return item;
  const bonus = ikrcSeedBonusFromValue_(best.bonus);
  item['Seed to Cup 가산점'] = bonus;
  item['Seed to Cup 메모'] = safeStr(best.memo || '');
  const base = ikrcSensoryBaseScoreFromItem_(item) || 0;
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
  rows = rows.filter(item => !isCalibrationMode_(item['모드'] || item.mode));
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
    if (direct) { cur.seedBonus = ikrcSeedBonusFromValue_(direct.bonus); cur.seedMemo = safeStr(direct.memo || ''); }
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
  const payload = { competitionCode:'IKRC', targetType, targetValue, bonus:ikrcSeedBonusFromValue_(bonus), memo:safeStr(memo), savedAt:nowIso(), savedBy:safeStr(auth.actor && auth.actor.name) };
  await env.DB.prepare('INSERT OR REPLACE INTO sessions (token, kind, payload_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(ikrcSeedResultToken_(targetType, targetValue), 'IKRC_SEED_RESULT', JSON.stringify(payload), '2035-12-31T23:59:59.000Z', nowIso()).run();
  return { success:true, message:'Seed to Cup 결과를 저장했습니다.', result:payload };
}

function isCalibrationMode_(v) { return /켈리브레이션|캘리브레이션|calibration|calib/i.test(safeStr(v)); }
function scoreEvaluationCategoryKey_(v) {
  const mode = safeStr(v);
  if (!isCalibrationMode_(mode)) return 'competition';
  if (/스테이션|station/i.test(mode)) return 'calibration:station';
  if (/팀별/.test(mode)) return 'calibration:team';
  if (/전체/.test(mode)) return 'calibration:all';
  return 'calibration:legacy';
}
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
function mocTimeLimitSecondsForRound_(round) {
  return roundName_(round, '예선') === '예선' ? 5 * 60 : 6 * 60;
}
function applyMocTimeDisqualificationToPayload_(payload, round) {
  payload = payload || {};
  const code = safeStr(payload.competitionCode || payload.code || payload.compCode || payload.competition).toUpperCase();
  if (code !== 'MOC') return { disqualified:false, reason:'' };
  if (!Array.isArray(payload.rows)) payload.rows = [{}];
  if (!payload.rows.length) payload.rows.push({});
  const row0 = payload.rows[0] || (payload.rows[0] = {});
  if (!row0.extraFields || typeof row0.extraFields !== 'object') row0.extraFields = {};
  if (!payload.extraFields || typeof payload.extraFields !== 'object') payload.extraFields = {};
  const extra = extractExtra(payload, 'MOC', 0);
  const sec = itemEndTimeSeconds_(extra);
  if (sec === 999999 || sec <= mocTimeLimitSecondsForRound_(round || payload.round || payload.currentRound)) {
    return { disqualified:false, reason:'' };
  }
  payload.disqualified = true;
  payload.dq = 'Y';
  payload.disqualifiedYn = 'Y';
  payload.disqualificationReason = firstNonEmpty([payload.disqualificationReason, payload.dqReason, extra['실격사유'], '시간 초과']);
  payload.dqReason = payload.disqualificationReason;
  row0.extraFields['실격여부'] = 'Y';
  row0.extraFields['실격사유'] = payload.disqualificationReason;
  payload.extraFields['실격여부'] = 'Y';
  payload.extraFields['실격사유'] = payload.disqualificationReason;
  return { disqualified:true, reason:payload.disqualificationReason };
}
function roundName_(v, fallback='예선') { const s=safeStr(v); if (/final|결선/i.test(s)) return '결선'; if (/main|본선/i.test(s)) return '본선'; if (/qual|prelim|예선/i.test(s)) return '예선'; return s || fallback; }
function shouldCountItemInRanking_(code, item) {
  if (!item) return false;
  if (isCalibrationMode_(item['모드'] || item.mode)) return false;
  if (safeStr(code).toUpperCase() === 'IKRC') return true;
  // 기존 OT 데이터의 헤드 점수가 '미검수'로 저장되어 있어도 새 운영규칙상 별도 검수 없이 공식점수로 인정한다.
  if (ikrcOfficialHeadItem_(code, item)) return true;
  if (rankingExcludedByReviewStatus_(item['검수상태'] || item.status)) return false;
  return true;
}
function tieInfoForItem_(code, item, round) {
  code = safeStr(code).toUpperCase();
  const r = roundName_(round, '');
  if (code === 'KCR') {
    return {
      sweetness: itemBestScore_(item, ['Sweetness(스윗니스) ×2','Sweetness(단맛) ×2','스윗니스','Sweetness','Sweetness(스윗니스)']),
      overall: itemBestScore_(item, ['Overall(오버롤)','Overall(주관적 종합평가)','Overall','오버롤'])
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
        sensory:weightedSubtotalFromSpec_(item, KCAC_FINAL_SENSORY_TIE_SPEC_) || 0,
        presentation:weightedSubtotalFromSpec_(item, KCAC_FINAL_PRESENTATION_TIE_SPEC_) || 0,
        patternCompletion:weightedSubtotalFromSpec_(item, KCAC_FINAL_PATTERN_COMPLETION_TIE_SPEC_) || 0,
        time:itemEndTimeSeconds_(item)
      };
    }
    return {
      completion:weightedSubtotalFromSpec_(item, KCAC_QUAL_COMPLETION_TIE_SPEC_) || 0,
      balance:weightedSubtotalFromSpec_(item, KCAC_QUAL_BALANCE_TIE_SPEC_) || 0,
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
  if (code === 'KBC') return '총점 → 에스프레소 합산';
  return '총점';
}
function officialRankingBasisLabel_(code, basis) {
  code = safeStr(code).toUpperCase();
  const text = safeStr(basis);
  if (code === 'KCR') return /정규화|Normalized|공식/i.test(text) ? '정규화 총점' : '항목 총점';
  if (code === 'IKRC') {
    if (/실시간|확인|대기|현재 제출/.test(text)) return text;
    return /Seed to Cup/i.test(text) ? '최종 총점 + Seed to Cup' : '최종 총점';
  }
  if (code === 'KBC') return /시간감점|Penalty/i.test(text) ? '최종 총점 - 시간감점' : '최종 총점';
  if (code === 'KCAC') return '최종 총점';
  if (code === 'MOB') return text || '총점 합산';
  if (text && !/평균|average/i.test(text)) return text;
  return '최종 총점';
}
function rankingTieBreakSummary_(code, tie) {
  code = safeStr(code).toUpperCase();
  tie = tie || {};
  if (code === 'KCR') {
    const parts = [];
    const sweetness = Number(tie.sweetness);
    const overall = Number(tie.overall);
    if (Number.isFinite(sweetness)) parts.push('Sweetness ' + roundScoreValue_(sweetness).toFixed(1));
    if (Number.isFinite(overall)) parts.push('Overall ' + roundScoreValue_(overall).toFixed(1));
    return parts.join(' / ');
  }
  if (code === 'IKRC') {
    const parts = [];
    const flavor = Number(tie.flavor);
    const sweetness = Number(tie.sweetness);
    const mouthfeel = Number(tie.mouthfeel);
    if (Number.isFinite(flavor)) parts.push('Flavor ' + roundScoreValue_(flavor).toFixed(1));
    if (Number.isFinite(sweetness)) parts.push('Sweetness ' + roundScoreValue_(sweetness).toFixed(1));
    if (Number.isFinite(mouthfeel)) parts.push('Mouthfeel ' + roundScoreValue_(mouthfeel).toFixed(1));
    return parts.join(' / ');
  }
  if ((code === 'MOC' || code === 'KTCC') && Number.isFinite(Number(tie.time)) && Number(tie.time) !== 999999) {
    return '종료시간 ' + tie.time + '초';
  }
  if (code === 'KCAC') {
    const parts = [];
    const sensory = Number(tie.sensory);
    const presentation = Number(tie.presentation);
    const patternCompletion = Number(tie.patternCompletion);
    const completion = Number(tie.completion);
    const balance = Number(tie.balance);
    const time = Number(tie.time);
    if (Number.isFinite(sensory) && sensory) parts.push('센서리 ' + roundScoreValue_(sensory).toFixed(1));
    if (Number.isFinite(presentation) && presentation) parts.push('프레젠테이션 ' + roundScoreValue_(presentation).toFixed(1));
    if (Number.isFinite(patternCompletion) && patternCompletion) parts.push('패턴 완성도 ' + roundScoreValue_(patternCompletion).toFixed(1));
    if (Number.isFinite(completion) && completion) parts.push('패턴 완성도 ' + roundScoreValue_(completion).toFixed(1));
    if (Number.isFinite(balance) && balance) parts.push('패턴 균형 ' + roundScoreValue_(balance).toFixed(1));
    if (Number.isFinite(time) && time !== 999999) parts.push('경기시간 ' + time + '초');
    return parts.join(' / ');
  }
  return '';
}

function avgList_(list) {
  const nums = (list || []).map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((a,b)=>a+b,0) / nums.length : 0;
}
function sumList_(list) {
  const nums = (list || []).map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((a,b)=>a+b,0) : 0;
}
function itemJudgeIdentityKey_(item) {
  item = item || {};
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
  const nested = payload.judge && typeof payload.judge === 'object' ? payload.judge : {};
  const operatorIdentityKey = safeStr(firstNonEmpty([
    payload.operatorIdentityKey,
    payload.judgeIdentityKey,
    nested.operatorIdentityKey,
    nested.identityKey,
    item.operatorIdentityKey
  ]));
  if (operatorIdentityKey) return 'operator:' + operatorIdentityKey;
  const phone = normalizePhone(firstNonEmpty([payload.judgePhone, payload.operatorPhone, nested.phone, item.judgePhone, item.operatorPhone]));
  if (phone) return 'phone:' + phone;
  const name = safeStr(item['심사위원명'] || item.judgeName || item.judge || item.operatorName || item['운영자명']).replace(/\s+/g, '').toLowerCase();
  return name ? ('name:' + name) : ('row:' + safeStr(item.scoreRowId || item._scoreId || item.rowIndex || ''));
}
function officialJudgeRoleKey_(item) {
  item = item || {};
  const judge = itemJudgeIdentityKey_(item);
  const role = safeStr(item['역할'] || item.role || item.judgeRole || '').replace(/\s+/g, '').toLowerCase();
  const competitionCode = safeStr(item.competitionCode || item['대회코드'] || '').toUpperCase();
  // IKRC 최종평균은 한 심사위원당 한 표입니다. 현장 권한 변경으로 역할명이 달라져도
  // 같은 계정의 최신 제출만 남겨 헤드/센서리 수와 평균이 중복되지 않게 합니다.
  if (competitionCode === 'IKRC' && judge) return judge;
  if (judge || role) return judge + ':' + role;
  return 'row:' + safeStr(item.scoreRowId || item._scoreId || item.rowIndex || Math.random());
}
function scoreItemIsNewer_(next, current) {
  if (!current) return true;
  const nextId = Number(next && (next.scoreRowId || next._scoreId || next.rowIndex) || 0);
  const currentId = Number(current && (current.scoreRowId || current._scoreId || current.rowIndex) || 0);
  const nextTime = Date.parse(next && (next.submittedAt || next.timestamp || next['제출시간']) || '') || 0;
  const currentTime = Date.parse(current && (current.submittedAt || current.timestamp || current['제출시간']) || '') || 0;
  return nextTime > currentTime || (nextTime === currentTime && nextId >= currentId);
}
function latestOfficialJudgeRows_(rows) {
  const map = new Map();
  (rows || []).forEach(item => {
    const key = officialJudgeRoleKey_(item);
    if (scoreItemIsNewer_(item, map.get(key))) map.set(key, item);
  });
  return Array.from(map.values());
}
function ikrcOfficialPanelRows_(rows) {
  const latest = latestOfficialJudgeRows_(rows || []);
  const heads = latest.filter(item => isHeadRole_(item && (item['역할'] || item.role || item.judgeRole)));
  const sensory = latest.filter(item => !isHeadRole_(item && (item['역할'] || item.role || item.judgeRole)));
  const complete = heads.length + sensory.length > 0;
  const reviewedSensory = sensory.filter(item => reviewCompletedStatus_(item && (item['검수상태'] || item.status)));
  const liveRows = heads.concat(sensory);
  return {
    complete,
    reviewComplete:sensory.length > 0 && reviewedSensory.length === sensory.length,
    headCount:heads.length,
    sensoryCount:sensory.length,
    confirmedHeadCount:heads.length,
    confirmedSensoryCount:reviewedSensory.length,
    confirmedJudgeCount:liveRows.length,
    expectedHeadCount:heads.length,
    expectedSensoryCount:sensory.length,
    expectedJudgeCount:liveRows.length,
    liveRows,
    rows:heads.concat(sensory)
  };
}
function officialScoreItemsForOutput_(code, items) {
  code = safeStr(code).toUpperCase();
  const source = Array.isArray(items) ? items : [];
  if (!['KCR','IKRC','KCAC','MOB','MOC','KTCC'].includes(code)) return source.slice();
  const groups = new Map();
  source.forEach(item => {
    const round = roundName_(item && (item.round || item['라운드']), '예선');
    const unit = itemNumber_(item) || safeStr(item && item.rowIndex);
    const key = round + '::' + unit;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const keep = new Set();
  groups.forEach(rows => {
    let selected = rows;
    if (code === 'KCR') selected = latestOfficialJudgeRows_(rows);
    else if (code === 'IKRC') selected = ikrcOfficialPanelRows_(rows).rows;
    else if (code === 'KCAC') selected = kcacSubmissionGroups_(rows).flat();
    else if (code === 'MOB') selected = mobDedupOfficialRows_(rows);
    else {
      const latest = latestOfficialItem_(rows);
      selected = latest ? [latest] : [];
    }
    selected.forEach(item => keep.add(item));
  });
  return source.filter(item => keep.has(item));
}
function mobRoleCategoryForItem_(item) {
  const role = safeStr(item && (item['역할'] || item['Role'] || item['JudgeRole'] || item['심사역할'] || item['심사위원역할'] || item.role || item.judgeRole || item._col5));
  if (/헤드|head/i.test(role)) return 'head';
  const techRole = /테크|기술|technical|tech\b|\btech|technical\s*judge|t\s*judge|\bT[0-9]?\b/i.test(role) && !/센서|감각|sensory|sensor|sens\b|\bsens|s\s*judge|\bS[0-9]?\b/i.test(role);
  const sensoryRole = /센서|감각|sensory|sensor|sens\b|\bsens|s\s*judge|\bS[0-9]?\b/i.test(role) && !/테크|기술|technical|tech\b|\btech|technical\s*judge|t\s*judge|\bT[0-9]?\b/i.test(role);
  if (techRole) return 'technical';
  if (sensoryRole) return 'sensory';
  return 'mixed';
}
function mobOfficialJudgeKey_(item) {
  item = item || {};
  const role = safeStr(item['역할'] || item.role || item['심사위원역할'] || item.judgeRole || '');
  const judge = safeStr(item['심사위원명'] || item.judgeName || item.judge || '');
  const category = mobRoleCategoryForItem_(item);
  // 같은 심사위원이 같은 참가자에게 중복 제출한 경우 최신 행만 공식 집계한다.
  // 심사위원명이 비어 있고 역할도 범용명뿐이면 임의로 합치지 않고 행 단위로 둔다.
  const normalizedRole = role.replace(/\s+/g, '').toLowerCase();
  const normalizedJudge = judge.replace(/\s+/g, '').toLowerCase();
  if (normalizedJudge || normalizedRole) return category + ':' + normalizedJudge + ':' + normalizedRole;
  return 'row:' + safeStr(item.scoreRowId || item._scoreId || item.rowIndex || Math.random());
}
function mobDedupOfficialRows_(rows) {
  const map = new Map();
  (rows || []).forEach(item => {
    const key = mobOfficialJudgeKey_(item);
    const old = map.get(key);
    if (!old) { map.set(key, item); return; }
    const oldId = Number(old.scoreRowId || old._scoreId || old.rowIndex || 0);
    const newId = Number(item.scoreRowId || item._scoreId || item.rowIndex || 0);
    const oldTime = Date.parse(old.submittedAt || old.timestamp || old['제출시간'] || '') || 0;
    const newTime = Date.parse(item.submittedAt || item.timestamp || item['제출시간'] || '') || 0;
    if (newTime > oldTime || (newTime === oldTime && newId >= oldId)) map.set(key, item);
  });
  return Array.from(map.values());
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
  const latestByJudge = new Map();
  Array.from(map.values()).forEach(items => {
    const first = items[0] || {};
    const key = officialJudgeRoleKey_(first);
    const current = latestByJudge.get(key);
    if (!current || scoreItemIsNewer_(first, current[0])) latestByJudge.set(key, items);
  });
  return Array.from(latestByJudge.values());
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
        patternCompletion += weightedSubtotalFromSpec_(item, KCAC_FINAL_PATTERN_COMPLETION_TIE_SPEC_) || 0;
      }
      if (isSensory) {
        hasSensory = true;
        if (n !== null) sensoryTotal += n;
        sensory += weightedSubtotalFromSpec_(item, KCAC_FINAL_SENSORY_TIE_SPEC_) || 0;
        presentation += weightedSubtotalFromSpec_(item, KCAC_FINAL_PRESENTATION_TIE_SPEC_) || 0;
      }
    } else {
      completion += weightedSubtotalFromSpec_(item, KCAC_QUAL_COMPLETION_TIE_SPEC_) || 0;
      balance += weightedSubtotalFromSpec_(item, KCAC_QUAL_BALANCE_TIE_SPEC_) || 0;
    }
  });
  return { total:roundScoreValue_(total), patternTotal:roundScoreValue_(patternTotal), sensoryTotal:roundScoreValue_(sensoryTotal), completion, balance, sensory, presentation, patternCompletion, hasPattern, hasSensory, time:times.length ? Math.min(...times) : 999999 };
}
function avgFinite_(values) {
  const nums = (values || []).map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((a,b)=>a+b,0) / nums.length : 0;
}

function rankingRowId_(item) {
  const n = Number(item && (item.scoreRowId || item._scoreId || item.rowIndex || item.id || 0));
  return Number.isFinite(n) ? n : 0;
}
function rankingSubmittedMs_(item) {
  const t = Date.parse(safeStr(item && (item.submittedAt || item.timestamp || item['제출시간'] || item.createdAt || item.updatedAt || '')));
  return Number.isFinite(t) ? t : 0;
}
function latestOfficialItem_(rows) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return null;
  return list.slice().sort((a,b) => {
    const ta = rankingSubmittedMs_(a), tb = rankingSubmittedMs_(b);
    if (ta !== tb) return tb - ta;
    return rankingRowId_(b) - rankingRowId_(a);
  })[0];
}
function rankingScoreFromItem_(item) {
  const n = toNumber(item && (item['정규화점수'] ?? item['Normalized Score'] ?? item['공식점수'] ?? item['순위반영점수'] ?? item['총평가 반영점수'] ?? item['최종점수'] ?? item['총점'] ?? item.totalScore ?? item.finalScore ?? item.score));
  return n === null ? null : roundScoreValue_(n);
}
function avgRowsBy_(rows, fn) {
  const nums = (rows || []).map(fn).filter(v => v !== null && Number.isFinite(Number(v))).map(Number);
  return nums.length ? roundScoreValue_(nums.reduce((a,b)=>a+b,0) / nums.length) : null;
}
function maxRowsBy_(rows, fn) {
  const nums = (rows || []).map(fn).filter(v => v !== null && Number.isFinite(Number(v))).map(Number);
  return nums.length ? Math.max(...nums) : 0;
}
function minRowsBy_(rows, fn) {
  const nums = (rows || []).map(fn).filter(v => v !== null && Number.isFinite(Number(v))).map(Number);
  return nums.length ? Math.min(...nums) : 999999;
}
function itemOfficialDq_(item) {
  return !!(item && (item.disqualified || isDisqualifiedValue_(item['실격여부']) || isDisqualifiedValue_(item.DQ) || isDisqualifiedValue_(item.disqualifiedYn)));
}
function kcrOfficialScoreFromItem_(item) {
  const official = firstNumberFromKeys_(item, ['정규화점수','Normalized Score','공식점수','순위반영점수']);
  if (official !== null) return roundScoreValue_(official);
  return rankingScoreFromItem_(item);
}
function kbcTimePenaltyFromItem_(item) {
  return positivePenaltyValue_(firstNumberFromKeys_(item, ['시간감점','Time Penalty','Penalty']));
}
function kbcRawSubtotalFromItem_(item) {
  item = item || {};
  const directGross = firstNumberFromKeys_(item, ['감점 전 합산','감점전합산','Gross Total','Subtotal Before Penalty']);
  if (directGross !== null) return roundScoreValue_(directGross);
  const presentation = firstNumberFromKeys_(item, [
    'Service Professionalism(서비스의 전문성)',
    'Presentation & Service(프레젠테이션과 서비스 전문성)',
    'Presentation & Service',
    '프레젠테이션과 서비스 전문성',
    'Presentation Total',
    '프레젠테이션 총점',
    '프레젠테이션 합산'
  ]) || 0;
  const espresso = kbcEspressoTotalFromItem_(item) || 0;
  const signature = kbcSignatureTotalFromItem_(item) || 0;
  const machine = firstNumberFromKeys_(item, [
    'Machine & Equipment Professionalism(머신 및 기물 운용 전문성)',
    'Machine & Equipment Professionalism',
    'Machine & Equipment',
    'Machine Total',
    '기계사용 총점',
    '기계운용 총점'
  ]) || 0;
  const hasRaw = itemHasAnyScore_(item, [
    'Service Professionalism(서비스의 전문성)','Presentation & Service(프레젠테이션과 서비스 전문성)','Presentation & Service','프레젠테이션과 서비스 전문성','Presentation Total','프레젠테이션 총점','프레젠테이션 합산',
    'Espresso Total','에스프레소 합산','에스프레소 총점',
    'Espresso Taste & Design(맛과 설계) ×2','Espresso Taste & Design(맛과 설계)','Espresso Clean Cup(클린컵)','Espresso Mouthfeel(마우스필)','Espresso Flavor(플레이버)',
    'Signature Total','창작메뉴 합산','창작메뉴 총점',
    'Signature Taste & Design(맛과 설계) ×2','Signature Taste & Design(맛과 설계)','Signature Clean Cup(클린컵)','Signature Mouthfeel(마우스필)','Signature Flavor(플레이버)',
    'Machine & Equipment Professionalism(머신 및 기물 운용 전문성)','Machine & Equipment Professionalism','Machine & Equipment','Machine Total','기계사용 총점','기계운용 총점'
  ]);
  if (!hasRaw) return null;
  return roundScoreValue_(presentation + espresso + signature + machine);
}
function kbcOfficialScoreFromRows_(rows) {
  const rawAvg = avgRowsBy_(rows, kbcRawSubtotalFromItem_);
  if (rawAvg !== null) {
    const penalty = maxRowsBy_(rows, kbcTimePenaltyFromItem_);
    return roundScoreValue_(Math.max(0, rawAvg - penalty));
  }
  const avg = avgRowsBy_(rows, rankingScoreFromItem_);
  return avg === null ? 0 : avg;
}
function aggregateSimpleAverageCompetition_(code, rows, basis) {
  const score = avgRowsBy_(rows, rankingScoreFromItem_);
  return { score: score === null ? 0 : score, total: score === null ? 0 : score, basis, tie: {} };
}

const MOB_TECH_KEYS_ = ['Pre-Service Station(시연 전 작업대)','Service Station(시연 중 작업대)','Post-Service Station(시연 후 작업대)','Signature Technical Pre-Service Station(창작음료 시연 전 작업대)','Signature Technical Service Station(창작음료 시연 중 작업대)','Signature Technical Ingredient Use(부재료 사용의 적절함)','Signature Technical Post-Service Station(창작음료 시연 후 작업대)'];
const MOB_SENS_KEYS_ = ['Sweetness(스윗니스)','Flavor(플레이버)','Balance(균형)','Clean Cup(클린컵)','Mouthfeel(질감)','Professionalism(시연 전문성)'];
const MOB_CREATIVE_KEYS_ = ['Creative Form & Usability(형태와 용이성)','Creative Flavor(창작 향미)','Creative Balance(균형)','Creative Mouthfeel(질감)','Creative Professionalism(전문성과 독창성)'];
function mobComponentsFromItem_(item) {
  const disqualified = !!(item && (item.disqualified || item['실격여부'] === 'Y'));
  const techDirect = firstNumberFromKeys_(item, ['테크니컬 총점','테크니컬총점','Technical Total','TechnicalTotal']);
  const sensoryDirect = firstNumberFromKeys_(item, ['센서리 총점','센서리총점','Sensory Total','SensoryTotal']);
  const creativeDirect = firstNumberFromKeys_(item, ['창작메뉴 총점','창작메뉴총점','Creative Total','CreativeTotal']);
  const tech = disqualified ? 0 : (techDirect === null ? itemScoreSum_(item, MOB_TECH_KEYS_) : techDirect);
  const sensory = disqualified ? 0 : (sensoryDirect === null ? itemScoreSum_(item, MOB_SENS_KEYS_) : sensoryDirect);
  const creative = disqualified ? 0 : (creativeDirect === null ? itemScoreSum_(item, MOB_CREATIVE_KEYS_) : creativeDirect);
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
  const activeRows = rows.filter(item => !itemOfficialDq_(item));

  if (code === 'KCR') {
    const officialRows = latestOfficialJudgeRows_(activeRows);
    const score = avgRowsBy_(officialRows, kcrOfficialScoreFromItem_) || 0;
    return {
      score, total: score, basis: officialRows.some(item => firstNumberFromKeys_(item, ['정규화점수','Normalized Score','공식점수','순위반영점수']) !== null) ? '정규화 총점' : '항목 총점',
      tie: {
        sweetness: avgRowsBy_(officialRows, item => firstNumberFromKeys_(item, ['Sweetness(스윗니스) ×2','Sweetness(단맛) ×2','Sweetness(스윗니스)','Sweetness','스위트니스','스윗니스'])) || 0,
        overall: avgRowsBy_(officialRows, item => firstNumberFromKeys_(item, ['Overall(오버롤)','Overall(주관적 종합평가)','Overall','오버롤'])) || 0
      }
    };
  }

  if (code === 'IKRC') {
    const panel = ikrcOfficialPanelRows_(activeRows);
    const officialRows = panel.liveRows;
    if (!officialRows.length) {
      return {
        score:0,
        total:0,
        sensoryAvg:0,
        basis:'확인된 공식점수 대기',
        tie:{ flavor:0, sweetness:0, mouthfeel:0 },
        panelComplete:panel.complete,
        reviewComplete:panel.reviewComplete,
        headCount:panel.headCount,
        sensoryCount:panel.sensoryCount,
        confirmedHeadCount:panel.confirmedHeadCount,
        confirmedSensoryCount:panel.confirmedSensoryCount,
        confirmedJudgeCount:0,
        expectedJudgeCount:panel.expectedJudgeCount
      };
    }
    const sensoryAvg = avgRowsBy_(officialRows, ikrcSensoryBaseScoreFromItem_) || 0;
    const score = avgRowsBy_(officialRows, rankingScoreFromItem_) || 0;
    const liveBasis = '현재 제출 평균';
    return {
      score, total: score, sensoryAvg, basis: liveBasis + (roundName_(round, '') === '결선' && officialRows.some(item => firstNumberFromKeys_(item, ['Seed to Cup 가산점','Seed to Cup Bonus','SeedToCup Bonus','Seed to Cup(+3점)','Seed to Cup','시드투컵 가산점']) !== null) ? ' + Seed to Cup' : ''),
      panelComplete:panel.complete,
      reviewComplete:panel.reviewComplete,
      headCount:panel.headCount,
      sensoryCount:panel.sensoryCount,
      confirmedHeadCount:panel.confirmedHeadCount,
      confirmedSensoryCount:panel.confirmedSensoryCount,
      confirmedJudgeCount:panel.confirmedJudgeCount,
      expectedJudgeCount:panel.expectedJudgeCount,
      tie: {
        flavor: avgRowsBy_(officialRows, item => firstNumberFromKeys_(item, ['Flavor(플레이버) ×3','Flavor(플레이버)','Flavor','플레이버','향미'])) || 0,
        sweetness: avgRowsBy_(officialRows, item => firstNumberFromKeys_(item, ['Sweetness(스윗니스) ×2','Sweetness(단맛)','Sweetness(스윗니스)','Sweetness','스위트니스','스윗니스','단맛'])) || 0,
        mouthfeel: avgRowsBy_(officialRows, item => firstNumberFromKeys_(item, ['Mouthfeel(마우스필) ×2','Mouthfeel(질감)','Mouthfeel(마우스필)','Mouthfeel','마우스필','촉감','질감'])) || 0
      }
    };
  }

  if (code === 'KBC') {
    const score = kbcOfficialScoreFromRows_(activeRows);
    return {
      score, total: score, basis: '최종 총점 - 시간감점',
      tie: {
        espresso: avgRowsBy_(activeRows, item => kbcEspressoTotalFromItem_(item)) || 0,
        timePenalty: maxRowsBy_(activeRows, kbcTimePenaltyFromItem_),
        time: minRowsBy_(activeRows, itemEndTimeSeconds_)
      }
    };
  }

  if (code === 'MOC' || code === 'KTCC') {
    const latest = latestOfficialItem_(rows);
    const dq = latest ? itemOfficialDq_(latest) : !!g.dq;
    const score = dq ? 0 : (latest ? (rankingScoreFromItem_(latest) ?? 0) : 0);
    return {
      score, total: score, basis: '최신 공식 제출 총점', disqualified: dq,
      tie: { time: latest ? itemEndTimeSeconds_(latest) : 999999 }
    };
  }

  if (code === 'KCAC') {
    const r = roundName_(round);
    const submissionAggs = kcacSubmissionGroups_(activeRows).map(items => kcacAggregateSubmission_(items, r));
    if (r === '결선') {
      const patternAggs = submissionAggs.filter(x => x.hasPattern);
      const sensoryAggs = submissionAggs.filter(x => x.hasSensory);
      const patternTotal = avgFinite_(patternAggs.map(x => x.patternTotal));
      const sensoryTotal = avgFinite_(sensoryAggs.map(x => x.sensoryTotal));
      const score = roundScoreValue_(patternTotal + sensoryTotal) || 0;
      return {
        score, total:score, basis:'결선 최종 총점',
        tie:{
          sensory: roundScoreValue_(avgFinite_(sensoryAggs.map(x => x.sensory))) || 0,
          presentation: roundScoreValue_(avgFinite_(sensoryAggs.map(x => x.presentation))) || 0,
          patternCompletion: roundScoreValue_(avgFinite_(patternAggs.map(x => x.patternCompletion))) || 0,
          time: submissionAggs.reduce((m,x)=>Math.min(m, x.time || 999999), 999999)
        }
      };
    }
    const score = roundScoreValue_(avgFinite_(submissionAggs.map(x => x.total))) || 0;
    return {
      score, total:score, basis: submissionAggs.length > 1 ? '예선 최종 총점' : '2잔 합산점수',
      tie:{
        completion: roundScoreValue_(avgFinite_(submissionAggs.map(x => x.completion))) || 0,
        balance: roundScoreValue_(avgFinite_(submissionAggs.map(x => x.balance))) || 0,
        time: submissionAggs.reduce((m,x)=>Math.min(m, x.time || 999999), 999999)
      }
    };
  }

  if (code === 'MOB') {
    const tech = [], sensory = [], creative = [], penalties = [], times = [];
    const officialRows = mobDedupOfficialRows_(activeRows);
    officialRows.forEach(item => {
      const c = mobComponentsFromItem_(item);
      if (c.time !== 999999) times.push(c.time);
      if (c.disqualified) return;
      if (c.hasTech) tech.push(c.tech);
      if (c.hasSensory) sensory.push(c.sensory);
      if (c.hasCreative) creative.push(c.creative);
      if (c.penalty) penalties.push(c.penalty);
    });
    const sensorySum = Math.round(sumList_(sensory) * 1000) / 1000;
    const technicalSum = Math.round(sumList_(tech) * 1000) / 1000;
    const creativeSum = Math.round(sumList_(creative) * 1000) / 1000;
    if (g.dq && !activeRows.length) {
      return {
        score: 0,
        total: 0,
        basis: '실격',
        tie: { sensory: sensorySum, technical: technicalSum, creative: creativeSum, time: times.length ? Math.min(...times) : 999999 },
        disqualified: true
      };
    }
    if (tech.length || sensory.length || creative.length) {
      const timePenalty = penalties.length ? Math.max(...penalties) : 0;
      const gross = Math.round((sensorySum + technicalSum + creativeSum) * 1000) / 1000;
      const penaltyApplied = Math.round((gross - timePenalty) * 1000) / 1000;
      const score = Math.max(0, penaltyApplied);
      return {
        score: Math.round(score * 1000) / 1000,
        total: Math.round(score * 1000) / 1000,
        basis: timePenalty ? '총점 합산 - 시간감점' : '총점 합산',
        tie: { sensory: sensorySum, technical: technicalSum, creative: creativeSum, timePenalty, gross, penaltyApplied, countedRows: officialRows.length, rawRows: rows.length, time: times.length ? Math.min(...times) : 999999 }
      };
    }
  }

  const avg = avgRowsBy_(activeRows, rankingScoreFromItem_) || 0;
  Object.keys(g.tieCounts || {}).forEach(k => {
    if (k !== 'time' && g.tieCounts[k]) g.tie[k] = Math.round((g.tie[k] / g.tieCounts[k]) * 1000) / 1000;
  });
  return { score: avg, total: avg, basis: '최종 총점', tie: g.tie };
}
async function buildRankingData_(env, competitionCode) {
  const code = safeStr(competitionCode).toUpperCase();
  const cfg = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind(code).first();
  const participantRowsRaw = await env.DB.prepare('SELECT * FROM participants WHERE competition_code=? ORDER BY id ASC').bind(code).all();
  const participantRows = participantRowsRaw.results || [];
  const rowsRaw = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id ASC').bind(code).all();
  // MOB 순위는 양일 기록을 모두 유지합니다. 켈리브레이션만 제외하고
  // 실제 평가 참가자 선택 화면의 활성 날짜 제한과 분리합니다.
  const raw = code === 'MOB'
    ? (rowsRaw.results || []).filter(row => !isCalibrationMode_(row && row.mode))
    : (rowsRaw.results || []);
  const headers = mergeHeaders(code, raw);
  const participantIdx = indexParticipantIdentities_(participantRows, code);
  const ikrcSeedMap = code === 'IKRC' ? await loadIkrcSeedResultMap_(env) : null;
  const ikrcFinalizedUnits = new Set();
  if (code === 'IKRC') {
    const finalRows = await env.DB.prepare("SELECT payload_json FROM sessions WHERE kind='IKRC_STATION_FINALIZATION'").all();
    (finalRows.results || []).forEach(row => {
      const payload = parseJson(row.payload_json, {});
      const round = roundName_(payload.round, '예선');
      (Array.isArray(payload.units) ? payload.units : []).forEach(unit => ikrcFinalizedUnits.add(round + '::' + safeStr(unit)));
    });
  }
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
    if (officialReviewCompleted_(code, item)) g.reviewed++;
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
    if (code === 'MOC') {
      const latest = latestOfficialItem_(g.rows || []) || {};
      g.checkerSummary = latest['심사위원명'] || latest.judgeName || '';
      g.endTimeDisplay = latest['종료시간'] || latest['경기시간'] || '';
    }
    if (code === 'KTCC') {
      const latest = latestOfficialItem_(g.rows || []) || {};
      g.checkerSummary = latest['심사위원명'] || latest.judgeName || '';
      g.endTimeDisplay = latest['종료시간'] || latest['경기시간'] || '';
      g.tournamentSummary = [
        latest['토너먼트 단계'] || '',
        latest['매치번호'] ? ('매치 ' + latest['매치번호']) : '',
        latest['상대팀'] ? ('상대 ' + latest['상대팀']) : '',
        latest['진출판정'] || ''
      ].filter(Boolean).join(' · ');
    }
    const agg = aggregateRankingGroup_(code, g, g.round);
    // IKRC 실시간 순위는 현재 제출된 헤드·센서리 공식점수를 인원수 고정 없이 즉시 누적한다.
    if (code === 'IKRC' && (!agg || Number(agg.confirmedJudgeCount || 0) < 1)) return;
    const aggregateScore = toNumber(agg && agg.score);
    const aggregateTotal = toNumber(agg && agg.total);
    g.rankingScore = aggregateScore !== null ? roundScoreValue_(aggregateScore) : (aggregateTotal !== null ? roundScoreValue_(aggregateTotal) : 0);
    g.totalScore = aggregateTotal !== null ? roundScoreValue_(aggregateTotal) : g.rankingScore;
    if (code === 'IKRC' && agg && Object.prototype.hasOwnProperty.call(agg, 'sensoryAvg')) g.ikrcSensoryAvg = roundScoreValue_(agg.sensoryAvg);
    if (code === 'IKRC' && agg) {
      g.ikrcPanelComplete = !!agg.panelComplete;
      g.ikrcReviewComplete = !!agg.reviewComplete;
      g.ikrcHeadCount = Number(agg.headCount || 0);
      g.ikrcSensoryCount = Number(agg.sensoryCount || 0);
      g.ikrcConfirmedHeadCount = Number(agg.confirmedHeadCount || 0);
      g.ikrcConfirmedSensoryCount = Number(agg.confirmedSensoryCount || 0);
      g.ikrcConfirmedJudgeCount = Number(agg.confirmedJudgeCount || 0);
      g.ikrcExpectedJudgeCount = Number(agg.expectedJudgeCount || agg.confirmedJudgeCount || 0);
      g.ikrcFinalized = ikrcFinalizedUnits.has(roundName_(g.round, '예선') + '::' + safeStr(g.unit));
    }
    g.scoreBasis = officialRankingBasisLabel_(code, agg && agg.basis);
    g.tie = agg.tie || g.tie;
    if (agg && Object.prototype.hasOwnProperty.call(agg, 'disqualified')) g.dq = !!agg.disqualified;
    if (!byRound[g.round]) byRound[g.round] = [];
    byRound[g.round].push(g);
  });
  const ranking = [];
  Object.keys(byRound).forEach(round => {
    const list = byRound[round];
    list.sort((a,b) => {
      if (a.dq !== b.dq) return a.dq ? 1 : -1;
      const scoreA = a.rankingScore, scoreB = b.rankingScore;
      if (scoreA !== scoreB) return scoreB - scoreA;
      const t = compareTie_(code, a, b, round); if (t !== 0) return t;
      return String(a.unit).localeCompare(String(b.unit), 'ko');
    });
    list.forEach((g, idx) => ranking.push({
      rank: g.dq ? '실격' : idx + 1,
      totalInRound: list.length,
      unit: g.unit, unitDisplay: g.unit, round,
      playerNameSummary: g.name || '', nameSummary: g.name || '', playerAffiliationSummary: g.affiliation || '', teamNameSummary: g.teamName || '', teamSummary: g.team || '',
      totalScore: g.rankingScore, avgScore: code === 'IKRC' && g.ikrcSensoryAvg !== undefined ? g.ikrcSensoryAvg : g.rankingScore, score: g.rankingScore, rankingScore: g.rankingScore,
      panelComplete:code === 'IKRC' ? !!g.ikrcPanelComplete : undefined,
      reviewComplete:code === 'IKRC' ? !!g.ikrcReviewComplete : undefined,
      finalized:code === 'IKRC' ? !!g.ikrcFinalized : undefined,
      headCount:code === 'IKRC' ? g.ikrcHeadCount : undefined,
      sensoryCount:code === 'IKRC' ? g.ikrcSensoryCount : undefined,
      confirmedHeadCount:code === 'IKRC' ? g.ikrcConfirmedHeadCount : undefined,
      confirmedSensoryCount:code === 'IKRC' ? g.ikrcConfirmedSensoryCount : undefined,
      confirmedJudgeCount:code === 'IKRC' ? g.ikrcConfirmedJudgeCount : undefined,
      expectedJudgeCount:code === 'IKRC' ? g.ikrcExpectedJudgeCount : undefined,
      scoreBasis: g.scoreBasis || '최종 총점',
      reviewedCount: g.reviewed, totalCount: g.rows.length,
      disqualified: !!g.dq, disqualificationReason: Array.from(new Set(g.reasons)).join(' / '),
      tieBreakRule: tieRuleLabel_(code, round), tie: g.tie,
      checkerSummary: g.checkerSummary || '', endTimeDisplay: g.endTimeDisplay || '', tournamentSummary: g.tournamentSummary || '',
      tieBreakSummary: rankingTieBreakSummary_(code, g.tie),
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
  const countableRows = officialScoreItemsForOutput_(code, data.rows.filter(item => shouldCountItemInRanking_(code, item)));
  const rows = countableRows.filter(item => { const sameUnit = itemNumber_(item) === targetUnit; const itemRound = roundName_(item.round || item['라운드'], targetRound); const sameRound = !targetRound || !itemRound || itemRound === targetRound; return sameUnit && sameRound; });
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
  const cfg = await env.DB.prepare('SELECT debriefing FROM competitions WHERE code=?').bind(code).first();
  if (!cfg) return { success: false, message: '선택한 대회를 찾을 수 없습니다.' };
  if (!cfg.debriefing && safeStr(env.KCL_BYPASS_DEBRIEF_LOCK).toLowerCase() !== 'true') {
    return { success: false, message: '아직 디브리핑 공개 전입니다. 운영팀의 공개 이후 다시 확인해주세요.' };
  }
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

async function getRegistryLiveState(env, competitionCode, actorArg, knownRevision) {
  const actor = await getActor(env, actorArg);
  if (!actor) return { success:false, message:'관리자가 등록한 최신 로그인 정보가 확인되지 않습니다. 다시 로그인해주세요.' };
  const revisionRow = await env.DB.prepare('SELECT setting_value, updated_at FROM system_settings WHERE setting_key=?')
    .bind(REGISTRY_REVISION_SETTING_KEY).first();
  const revision = safeStr(revisionRow && revisionRow.setting_value || '0');
  const code = safeStr(competitionCode).toUpperCase();
  const response = {
    success:true,
    actor,
    revision,
    updatedAt:safeStr(revisionRow && revisionRow.updated_at),
    participantChanged:false
  };
  if (!code || !COMPETITION_CODES.includes(code) || !hasAccess(actor, code)) return response;
  if (safeStr(knownRevision) === revision) return response;
  const assignments = await getParticipantAssignments(env, code, actor);
  if (!assignments || !assignments.success) return Object.assign(response, assignments || {});
  return Object.assign(response, assignments, { actor, revision, participantChanged:true });
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
  const cfg = await env.DB.prepare('SELECT * FROM competitions WHERE code=?').bind(code).first();
  if (!cfg) return { success: false, message: '선택한 대회를 찾을 수 없습니다.' };
  if (!cfg.debriefing && safeStr(env.KCL_BYPASS_DEBRIEF_LOCK).toLowerCase() !== 'true') {
    return { success: false, message: '아직 디브리핑 공개 전입니다. 운영팀의 공개 이후 다시 확인해주세요.' };
  }
  const row = await env.DB.prepare(`SELECT * FROM otps WHERE competition_code=? AND name=? AND phone=? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1`)
    .bind(code, name, phone, nowIso()).first();
  if (!row) return { success: false, message: '유효한 인증번호가 없습니다.' };
  if (safeStr(row.otp) !== safeStr(otp)) return { success: false, message: '인증번호가 일치하지 않습니다.' };
  await env.DB.prepare('UPDATE otps SET used_at=? WHERE id=?').bind(nowIso(), row.id).run();
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
  let scoreItems = scoreRows.flatMap(r => rowToReviewItems_(r, code, headers, cfg && cfg.current_round));
  scoreItems = officialScoreItemsForOutput_(code, scoreItems.filter(item => shouldCountItemInRanking_(code, item)));
  const rankingData = await buildRankingData_(env, code);
  let rankInfos = rankingData.ranking.filter(r => ids.includes(safeStr(r.unit)) || scoreItems.some(s => itemNumber_(s) === safeStr(r.unit)));
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
function _intensityText_(value) {
  const labels = { 1:'매우 약함', 2:'약함', 3:'약간 약함', 4:'중간', 5:'약간 강함', 6:'강함', 7:'매우 강함' };
  return labels[parseInt(value, 10)] || '-';
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
  return { success: true, comments: (comments || []).filter(Boolean).slice(0,2) };
}
function _commentVariationKey_(payload, code) {
  payload = payload || {};
  return [
    code || '', payload.variationSeed || '', payload.judgeName || '', payload.sampleNo || payload.cupNo || payload.participantNo || payload.label || '',
    payload.totalScore || payload.subtotal || '', JSON.stringify(payload.scores || payload.tags || {})
  ].map(safeStr).join('|');
}
function _commentHash_(value) {
  const text = safeStr(value);
  let hash = 2166136261;
  for (let i=0;i<text.length;i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
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
  if (s.includes('>')) s = s.split('>').pop().trim();
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
function _optionSet(lines, variationKey='') {
  const uniq = [];
  (lines || []).forEach(s => {
    const line = safeStr(s).replace(/\s+/g,' ').replace(/\.\./g,'.').replace(/\s+([,.])/g,'$1').trim();
    if (line && !uniq.includes(line)) uniq.push(line);
  });
  if (!uniq.length || !variationKey) return _result(uniq);
  const hash = _commentHash_(variationKey);
  const ordered = uniq.slice(hash % uniq.length).concat(uniq.slice(0, hash % uniq.length));
  if (((hash >>> 3) & 1) && ordered.length > 1) ordered.reverse();
  const intros = [
    '',
    '점수와 관찰 기록을 함께 보면, ',
    '항목별 평가 흐름을 기준으로, ',
    '이번 심사 기록을 종합하면, ',
    '선택된 감각 단서와 점수를 연결하면, ',
    '전체 평가 맥락에서 살펴보면, ',
    '세부 항목의 강약을 반영하면, ',
    '기록된 스마트태그를 점수와 함께 해석하면, ',
    '평가 시점의 기록을 기준으로, ',
    '제출된 점수 분포를 바탕으로, ',
    '선택된 특성의 연결 관계를 보면, ',
    '세부 관찰 결과를 정리하면, ',
    '컵과 수행의 전체 흐름을 확인하면, ',
    '동일 기준으로 점수와 표현을 대조하면, ',
    '심사 근거를 중심으로 살펴보면, ',
    '평가 항목 사이의 관계를 보면, '
  ];
  return _result(ordered.map((line, index) => {
    const intro = intros[(hash + index * 7) % intros.length];
    return intro + line;
  }));
}

function _sensoryOptionSet_(lines, variationKey='') {
  const uniq = [];
  (lines || []).forEach(line => {
    const text = safeStr(line).replace(/\s+/g, ' ').replace(/\.\./g, '.').replace(/\s+([,.])/g, '$1').trim();
    if (text && !uniq.includes(text)) uniq.push(text);
  });
  if (uniq.length < 2 || !variationKey) return _result(uniq);
  const hash = _commentHash_(variationKey);
  const firstIndex = hash % uniq.length;
  const step = 1 + ((hash >>> 5) % (uniq.length - 1));
  const secondIndex = (firstIndex + step) % uniq.length;
  return _result([uniq[firstIndex], uniq[secondIndex]]);
}

function generateCuppingComment(payload) {
  payload = payload || {};
  const tags = payload.tags || {};
  const sensoryItems = [
    {name:'Flavor', score:payload.flavor},
    {name:'Aftertaste', score:payload.aftertaste},
    {name:'Acidity', score:payload.acidity},
    {name:'Sweetness', score:payload.sweetness},
    {name:'Mouthfeel', score:payload.mouthfeel}
  ];
  const flavorTags = _tagList_(tags, 'flavor', 3);
  const aftertasteTags = _tagList_(tags, 'aftertaste', 3);
  const acidityTags = _tagList_(tags, 'acidity', 3);
  const sweetnessTags = _tagList_(tags, 'sweetness', 3);
  const mouthfeelTags = _tagList_(tags, 'mouthfeel', 3);

  function intensityAdjective(value) {
    const labels = {1:'매우 약한', 2:'약한', 3:'다소 약한', 4:'중간', 5:'다소 강한', 6:'강한', 7:'매우 강한'};
    return labels[parseInt(value, 10)] || '';
  }
  function qualityLevel(score) {
    const value = _num(score);
    if (value >= 4.2) return 0;
    if (value >= 3.6) return 1;
    if (value >= 3.0) return 2;
    if (value >= 2.4) return 3;
    return 4;
  }
  function qualityText(kind, score) {
    const phrases = {
      flavor:[
        '향미의 구분과 선명도가 높습니다',
        '향미가 비교적 명확하게 구분됩니다',
        '주요 향미는 확인되지만 세부 구분은 다소 흐립니다',
        '향미의 선명도가 다소 낮게 나타납니다',
        '향미가 명확하게 구분되지 않습니다'
      ],
      aftertaste:[
        '마무리가 깨끗하고 안정적입니다',
        '여운과 마무리가 비교적 자연스럽습니다',
        '마무리의 정돈감이 다소 부족합니다',
        '연결과 마무리가 다소 거칠게 나타납니다',
        '지속성과 마무리의 완성도가 충분히 형성되지 않았습니다'
      ],
      acidity:[
        '단맛과 향미 사이에서 조화롭게 연결됩니다',
        '컵의 구조 안에서 비교적 안정적으로 연결됩니다',
        '기본 구조는 확인되지만 다른 요소와의 연결은 다소 약합니다',
        '다른 요소와 충분히 조화를 이루지 못합니다',
        '산미의 질과 연결성이 충분히 형성되지 않았습니다'
      ],
      sweetness:[
        '향미를 안정적으로 받치고 지속성도 좋습니다',
        '향미를 비교적 안정적으로 뒷받침합니다',
        '향미를 받치는 힘이 크지 않습니다',
        '선명도와 지속성이 다소 낮습니다',
        '존재감과 지속성이 충분하지 않습니다'
      ],
      mouthfeel:[
        '질감의 밀도와 정돈감이 좋습니다',
        '질감이 비교적 매끄럽고 안정적입니다',
        '기본 촉감이 확인되지만 질감의 세부 정돈은 다소 부족합니다',
        '질감의 균일성과 정돈감이 다소 낮습니다',
        '질감이 거칠거나 비어 있는 인상으로 남습니다'
      ]
    };
    return phrases[kind][qualityLevel(score)];
  }
  function joinSensoryTags(list) {
    const values = (list || []).filter(Boolean);
    if (values.length < 2) return values[0] || '';
    const beforeLast = values.slice(0, -1).join(', ');
    const code = beforeLast.charCodeAt(beforeLast.length - 1);
    const hasBatchim = code >= 0xAC00 && code <= 0xD7A3 && ((code - 0xAC00) % 28) !== 0;
    return beforeLast + (hasBatchim ? '과 ' : '와 ') + values[values.length - 1];
  }
  function nounFromTags(list, suffix, fallback, usePossessive) {
    if (!list.length) return fallback;
    const labels = joinSensoryTags(list);
    return usePossessive ? `${labels}의 ${suffix}` : `${labels} ${suffix}`;
  }
  function subject(text) { return text + _subjectParticle_(text); }
  function topic(text) { return text + _topicParticle_(text); }
  function observationSentences(text) {
    return _briefComments(text, 3).map(entry => {
      let sentence = safeStr(entry).replace(/^[^:：]{1,24}[:：]\s*/, '').replace(/[.!?]+$/, '').trim();
      if (!sentence) return '';
      sentence = sentence
        .replace(/남음$/, '남습니다')
        .replace(/됨$/, '됩니다')
        .replace(/함$/, '합니다')
        .replace(/짐$/, '집니다')
        .replace(/음$/, '습니다');
      if (!/(?:습니다|됩니다|합니다|집니다|입니다|다)$/.test(sentence)) sentence += '입니다';
      return sentence + '.';
    }).filter(Boolean).join(' ');
  }

  const flavorNoun = nounFromTags(flavorTags, '향미', '주요 향미', true);
  const acidityNoun = nounFromTags(acidityTags, '인상의 산미', '산미');
  const sweetnessNoun = nounFromTags(sweetnessTags, '인상의 단맛', '단맛');
  const mouthfeelNoun = nounFromTags(mouthfeelTags, '질감', '마우스필');
  const aftertasteNoun = aftertasteTags.length ? `${aftertasteTags.join(', ')} 특성이 남는 여운` : '여운';
  const flavorIntensity = intensityAdjective(payload.flavorIntensity);
  const acidityIntensity = intensityAdjective(payload.acidityIntensity);
  const sweetnessIntensity = intensityAdjective(payload.sweetnessIntensity);
  const mouthfeelIntensity = intensityAdjective(payload.mouthfeelIntensity);
  const aftertastePersistence = intensityAdjective(payload.aftertastePersistence);

  const flavorSentence = `${topic(flavorNoun)} ${flavorIntensity ? flavorIntensity + ' 강도로 ' : ''}감지되며, ${qualityText('flavor', payload.flavor)}.`;
  const balanceSentence = `${topic(acidityNoun)} ${acidityIntensity ? acidityIntensity + ' 강도로 ' : ''}나타나며, ${qualityText('acidity', payload.acidity)}. ${topic(sweetnessNoun)} ${sweetnessIntensity ? sweetnessIntensity + ' 강도로 ' : ''}감지되며, ${qualityText('sweetness', payload.sweetness)}.`;
  const finishSentence = `${topic(mouthfeelNoun)} ${mouthfeelIntensity ? mouthfeelIntensity + ' 강도로 ' : ''}느껴지며, ${qualityText('mouthfeel', payload.mouthfeel)}. ${topic(aftertasteNoun)} ${aftertastePersistence ? aftertastePersistence + ' 수준으로 ' : ''}이어지고, ${qualityText('aftertaste', payload.aftertaste)}.`;

  const hl = _lowHighScore(sensoryItems);
  const high = hl.high ? _areaKorean_(hl.high.name) : '';
  const low = hl.low && hl.low !== hl.high ? _areaKorean_(hl.low.name) : '';
  const spread = hl.high && hl.low ? _num(hl.high.score) - _num(hl.low.score) : 0;
  const axis = high && low && spread >= 0.4
    ? `${high}${_topicParticle_(high)} 상대적으로 가장 안정적이고, ${low}${_topicParticle_(low)} 가장 제한적으로 평가되었습니다.`
    : '센서리 항목 사이의 완성도 차이는 크지 않게 평가되었습니다.';
  const overallScore = _num(payload.overall) || _avg(sensoryItems.map(item => item.score));
  const overallText = overallScore >= 4.2
    ? '종합하면 향미의 구분, 균형, 질감과 마무리가 선명하게 연결되는 컵입니다.'
    : overallScore >= 3.6
      ? '종합하면 주요 향미와 구조가 비교적 안정적으로 이어지는 컵입니다.'
      : overallScore >= 3.0
        ? '종합하면 기본 향미는 확인되지만 일부 요소의 선명도와 연결은 다소 약한 컵입니다.'
        : overallScore >= 2.4
          ? '종합하면 향미의 구분과 요소 간 균형에 보완이 필요한 컵입니다.'
          : '종합하면 향미의 선명도와 구조적 연결이 충분히 형성되지 않은 컵입니다.';
  const manualText = observationSentences(payload.attributeComments);
  const evidence = manualText ? manualText + ' ' : '';
  const firstImpression = `첫 인상에서 ${subject(flavorNoun)} ${flavorIntensity ? flavorIntensity + ' 강도로 ' : ''}드러나며, ${qualityText('flavor', payload.flavor)}.`;
  const middleStructure = `중반부에는 ${subject(acidityNoun)} ${acidityIntensity ? acidityIntensity + ' 강도로 ' : ''}나타나고 ${subject(sweetnessNoun)} ${sweetnessIntensity ? sweetnessIntensity + ' 강도로 ' : ''}함께 감지됩니다. ${topic(acidityNoun)} ${qualityText('acidity', payload.acidity)}. ${topic(sweetnessNoun)} ${qualityText('sweetness', payload.sweetness)}.`;
  const finishStructure = `후반부에는 ${subject(mouthfeelNoun)} ${mouthfeelIntensity ? mouthfeelIntensity + ' 강도로 ' : ''}느껴지고 ${subject(aftertasteNoun)} ${aftertastePersistence ? aftertastePersistence + ' 수준으로 ' : ''}이어집니다. ${topic(mouthfeelNoun)} ${qualityText('mouthfeel', payload.mouthfeel)}. ${topic(aftertasteNoun)} ${qualityText('aftertaste', payload.aftertaste)}.`;

  return _sensoryOptionSet_([
    `${flavorSentence} ${balanceSentence} ${finishSentence} ${evidence}${axis} ${overallText}`,
    `향미 프로파일의 중심에는 ${subject(flavorNoun)} 놓이며${flavorIntensity ? ' ' + flavorIntensity + ' 강도로' : ''} 나타납니다. ${qualityText('flavor', payload.flavor)}. ${balanceSentence} ${finishSentence} ${evidence}${axis} ${overallText}`,
    `${firstImpression} ${middleStructure} ${finishStructure} ${evidence}${axis} ${overallText}`,
    `향미 전개는 ${flavorNoun}에서 시작해 산미와 단맛, 질감과 여운으로 이어집니다. ${flavorSentence} ${balanceSentence} ${finishSentence} ${evidence}${axis} ${overallText}`
  ], _commentVariationKey_(payload, 'KCR'));
}

function generateKbcComment(payload) {
  payload = payload || {};
  const presentation = _num(payload.presentationVal);
  const espressoVals = Array.isArray(payload.espressoVals) ? payload.espressoVals.map(_num) : [];
  const sigVals = Array.isArray(payload.sigVals) ? payload.sigVals.map(_num) : [];
  const machine = _num(payload.machineVal);
  const isMain = !!payload.isMain;
  const legacy = [
    {id:'kbc-presentation', label:'서비스 전문성', section:'서비스', score:presentation, weight:1},
    {id:'kbc-espresso-taste', label:'에스프레소 맛과 설계', section:'에스프레소', score:espressoVals[0], weight:2},
    {id:'kbc-espresso-clean', label:'에스프레소 클린컵', section:'에스프레소', score:espressoVals[1], weight:1},
    {id:'kbc-espresso-mouth', label:'에스프레소 마우스필', section:'에스프레소', score:espressoVals[2], weight:1},
    {id:'kbc-espresso-flavor', label:'에스프레소 플레이버', section:'에스프레소', score:espressoVals[3], weight:1},
    {id:'kbc-signature-taste', label:'창작음료 맛과 설계', section:'창작음료', score:sigVals[0], weight:2},
    {id:'kbc-signature-clean', label:'창작음료 클린컵', section:'창작음료', score:sigVals[1], weight:1},
    {id:'kbc-signature-mouth', label:'창작음료 마우스필', section:'창작음료', score:sigVals[2], weight:1},
    {id:'kbc-signature-flavor', label:'창작음료 플레이버', section:'창작음료', score:sigVals[3], weight:1},
    {id:'kbc-machine', label:'머신 및 기물 운용 전문성', section:'운영', score:machine, weight:1}
  ].filter(item => isMain || item.section !== '창작음료');
  const sourceItems = Array.isArray(payload.evaluatedItems) && payload.evaluatedItems.length ? payload.evaluatedItems : legacy;
  const items = sourceItems.map((item, index) => {
    item = item || {};
    const fallback = legacy[index] || {};
    const score = _num(item.score !== undefined ? item.score : fallback.score);
    const weight = Math.max(1, _num(item.weight || fallback.weight || 1));
    const rawTags = Array.isArray(item.tags) ? item.tags : (item.tags ? String(item.tags).split(/[,;\n]/) : []);
    const tags = Array.from(new Set(rawTags.map(_cleanTagText_).filter(Boolean)));
    return {
      id:safeStr(item.id || fallback.id),
      label:safeStr(item.label || fallback.label || `평가 항목 ${index + 1}`),
      section:safeStr(item.section || fallback.section || '평가'),
      score,
      rating:safeStr(item.rating || _toneByScore_(score, 5)),
      weight,
      weightedScore:_num(item.weightedScore !== undefined ? item.weightedScore : score * weight),
      tags,
      comment:safeStr(item.comment).replace(/\s+/g, ' ').trim()
    };
  });
  const detailSentences = items.map(item => {
    let sentence = `${item.label}${_topicParticle_(item.label)} ${_fmt(item.score)}점(${item.rating})`;
    if (item.weight > 1) sentence += `, 가중 반영 ${_fmt(item.weightedScore)}점`;
    sentence += '으로 평가되었습니다.';
    if (item.tags.length) sentence += ` 선택 스마트태그는 ${item.tags.join(', ')}입니다.`;
    if (item.comment) sentence += ` 심사위원 직접 기록은 “${item.comment}”입니다.`;
    return sentence;
  });
  const sectionOrder = ['서비스','에스프레소','창작음료','운영'];
  const sectionText = sectionOrder.map(section => {
    const detail = items.filter(item => item.section === section).map(item => detailSentences[items.indexOf(item)]);
    return detail.length ? `${section} 영역 평가: ${detail.join(' ')}` : '';
  }).filter(Boolean).join(' ');
  const overallAvg = _avg(items.map(item => item.score));
  const scoreItems = items.map(item => ({name:item.label, score:item.score}));
  const spread = _lowHighScore(scoreItems);
  const high = spread.high ? spread.high.name : '';
  const low = spread.low && spread.low !== spread.high ? spread.low.name : '';
  const comparison = high && low
    ? `항목별 비교에서는 ${high} 점수가 상대적으로 가장 높고, ${low} 점수가 상대적으로 가장 낮게 평가되었습니다.`
    : '항목 간 점수 차이는 크지 않게 기록되었습니다.';
  const subtotal = _num(payload.subtotalScore);
  const timePenalty = Math.max(0, _num(payload.timePenalty));
  const total = payload.totalScore !== undefined && payload.totalScore !== null ? _num(payload.totalScore) : Math.max(0, subtotal - timePenalty);
  const totalText = `항목 합계 ${_fmt(subtotal)}점${timePenalty ? `에서 시간감점 ${_fmt(timePenalty)}점을 적용해 ` : '이며, '}최종 ${_fmt(total)}점으로 기록되었습니다.`;
  const conclusion = `전 항목 평균은 ${_fmt(overallAvg)}점이며, ${comparison} 종합적으로 서비스 전달, 음료 완성도${isMain ? ', 창작음료 설계' : ''}, 장비 운용의 연결성을 함께 반영한 결과입니다.`;
  return _sensoryOptionSet_([
    `${sectionText} ${totalText} ${conclusion}`,
    `KBC 수행의 모든 평가 근거를 항목별로 정리했습니다. ${sectionText} ${comparison} ${totalText} 전체 수행은 ${_toneByScore_(overallAvg, 5)} 수준으로 평가됩니다.`,
    `점수, 점수 수준, 선택 스마트태그와 직접 기록을 함께 반영하면 다음과 같습니다. ${sectionText} ${totalText} ${conclusion}`
  ], _commentVariationKey_(payload, 'KBC'));
}

function _kcacTagEvidence_(payload) {
  payload = payload || {};
  const explicit = payload.smartTagPolarity || {};
  let positive = _tags(explicit.positive, 8).map(_cleanTagText_).filter(Boolean);
  let refinement = _tags(explicit.refinement, 8).map(_cleanTagText_).filter(Boolean);
  const custom = _tags(explicit.custom, 8).map(_cleanTagText_).filter(Boolean);

  if (!positive.length && !refinement.length) {
    _flatTagList_(payload.smartTags || {}, 20).forEach(tag => {
      if (/보완|부족|불균형|비대칭|이탈|흐림|탁함|거침|낮음|끊김|번짐|불명확|과도|과대|과소|지연|미흡|미구현|불안정|결함|충돌|떫|탄\s*맛|쓴맛|드라이|수렴|오염|누락|실패|약함/i.test(tag)) {
        refinement.push(tag);
      } else if (/긍정|우수|안정|조화|선명|명확|깔끔|유지|균일|완성|크리미|실키|부드러|정돈|깨끗|충족/i.test(tag)) {
        positive.push(tag);
      }
    });
  }

  positive = Array.from(new Set(positive)).slice(0, 5);
  refinement = Array.from(new Set(refinement)).slice(0, 5);
  return { positive, refinement, custom };
}
function _kcacTone_(average, evidence) {
  const avg = _num(average);
  const positiveCount = (evidence.positive || []).length;
  const refinementCount = (evidence.refinement || []).length;
  if (avg < 1.8) return '개선이 필요한';
  if (avg < 2.6) return '보완이 필요한';
  if (refinementCount > 0 && refinementCount >= positiveCount) return '보완 여지가 있는';
  if (avg < 3.4 || refinementCount > positiveCount) return '강점과 보완점이 함께 확인되는';
  if (avg < 4.0) return '안정적인';
  if (avg < 4.6) return '뚜렷하고 완성도 높은';
  return '매우 선명하고 완성도 높은';
}
function _kcacEvidenceSentence_(evidence) {
  const positive = _joinWithComma((evidence.positive || []).slice(0, 3));
  const refinement = _joinWithComma((evidence.refinement || []).slice(0, 3));
  const custom = _joinWithComma((evidence.custom || []).slice(0, 2));
  if (positive && refinement) return `강점 관찰로 ${positive}, 보완 관찰로 ${refinement}${_subjectParticle_(refinement)} 기록되었습니다.`;
  if (refinement) return `보완 관찰로 ${refinement}${_subjectParticle_(refinement)} 기록되어 긍정적으로만 해석하지 않았습니다.`;
  if (positive) return `강점 관찰로 ${positive}${_subjectParticle_(positive)} 기록되었습니다.`;
  if (custom) return `추가 관찰로 ${custom}${_subjectParticle_(custom)} 기록되었습니다.`;
  return '선택된 스마트태그가 없어 점수 흐름을 중심으로 해석했습니다.';
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
  const isSensory = /sensory|맛|질감/i.test(type);
  const hl = _lowHighScore(scoreItems);
  const high = hl.high ? _areaKorean_(hl.high.name) : '';
  const low = hl.low && hl.low !== hl.high ? _areaKorean_(hl.low.name) : '';
  const balance = high && low ? `${high}${_subjectParticle_(high)} 가장 두드러졌고, ${low}${_topicParticle_(low)} 상대적으로 낮게 평가되었습니다.` : '항목 간 편차는 크지 않게 기록되었습니다.';
  const evidence = _kcacTagEvidence_({ smartTags, smartTagPolarity:payload.smartTagPolarity });
  const tone = _kcacTone_(avg, evidence);
  const evidenceText = _kcacEvidenceSentence_(evidence);
  if (isSensory) {
    return _optionSet([
      `${label}은 ${milk ? milk + ' 조건에서 ' : ''}맛의 균형과 질감을 중심으로 평가되었습니다. 전체 인상은 ${tone} 수준입니다. ${evidenceText}`,
      `센서리 관점에서는 맛의 균형과 촉감의 연결성을 확인했습니다. ${balance} ${evidenceText}`,
      `평균 ${_fmt(avg)}점의 항목 점수와 선택된 관찰 근거를 함께 반영하면 ${tone} 결과입니다. ${evidenceText}`
    ], _commentVariationKey_(payload, 'KCAC'));
  }
  return _optionSet([
    `${label}은 ${milk ? milk + ' 조건에서 ' : ''}${pattern}의 완성도, 표면 품질, 위치와 비율을 중심으로 평가되었습니다. 전체적인 시각 완성도는 ${tone} 편입니다. ${evidenceText}`,
    `패턴 평가는 중심축, 대칭, 리프 간격, 라인의 선명도와 표면 정리감을 기준으로 진행되었습니다. ${balance} ${evidenceText}`,
    `평균 ${_fmt(avg)}점의 항목 점수와 선택된 관찰 근거를 함께 반영하면 ${tone} 결과입니다. ${evidenceText}`
  ], _commentVariationKey_(payload, 'KCAC'));
}

function generateMobComment(payload) {
  payload = payload || {};
  const menu = safeStr(payload.menu || '브루잉');
  const techAvg = _avg(payload.techVals || []);
  const sensAvg = _avg(payload.sensVals || []);
  const sigAvg = _avg(payload.sigVals || []);
  const overallAvg = _avg([techAvg, sensAvg, sigAvg].filter(v => v > 0));
  const comments = _briefComments(payload.attributeComments, 2);
  const tagSummary = _tagSummary_(payload.tags, '추출과 향미 특성');
  const isCreative = /창작|creative|signature/i.test(menu) || sigAvg > 0;
  const techText = techAvg ? `기술 수행은 ${_toneByScore_(techAvg, 5)} 수준으로 기록되었고, 준비 과정과 서비스 동선이 추출 결과에 반영되었습니다` : '기술 수행보다 센서리와 메뉴 설계 항목이 중심으로 평가되었습니다';
  const sensText = sensAvg ? `센서리 항목은 ${_toneByScore_(sensAvg, 5)} 흐름을 보이며, 단맛·플레이버·균형·클린컵·질감의 연결성이 평가에 반영되었습니다` : '센서리 항목은 제출 데이터 기준으로 별도 점수 흐름이 확인되지 않았습니다';
  const sigText = isCreative ? (sigAvg ? `창작 요소는 ${_toneByScore_(sigAvg, 5)} 완성도로 기록되며, 형태와 용이성, 향미, 균형, 전문성의 연결성이 함께 평가되었습니다` : '창작 메뉴는 설계 의도와 실제 향미의 연결성이 평가 기준으로 작용했습니다') : '기본 브루잉 메뉴에서는 추출 설계와 서비스 설명의 일관성이 평가 기준으로 작용했습니다';
  return _optionSet([
    `${menu} 평가는 추출 설계, 서비스 흐름, 향미 표현의 연결성을 중심으로 진행되었습니다. ${techText}. ${sensText}.`,
    `스마트태그 기준으로는 ${tagSummary}이 확인됩니다. ${sigText}. ${comments.length ? '세부 코멘트에서는 ' + comments.join(' / ') + '가 함께 기록되었습니다.' : '컵의 의도와 실제 인상이 종합 평가에 반영되었습니다.'}`,
    `유효 항목 평균 ${_fmt(overallAvg)}점의 흐름에서 추출 일관성, 향미 균형, 설명의 명확성을 함께 확인했습니다. 전체 수행은 ${_toneByScore_(overallAvg, 5)} 수준으로 평가됩니다.`
  ], _commentVariationKey_(payload, 'MOB'));
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
  const avg = _avg(items.map(x=>x.score));
  const prefix = sample ? `Sample ${sample}은 ` : '해당 샘플은 ';
  return _optionSet([
    `${prefix}${flavor} 계열의 향미가 첫인상을 형성하고, ${clean}한 인상이 컵의 완성도에 반영되었습니다. 단맛은 ${sweet} 방향으로 나타났으며, 산미는 ${acidity}, 마우스필은 ${mouthfeel} 특성으로 기록되었습니다.`,
    `로스팅 결과는 향미의 선명도, 후반부 클린함, 단맛 지속성의 균형을 중심으로 평가되었습니다. 향미 강도는 ${_intensityText_(intensities.flavor)} 수준으로 기록되며, 전체적으로 ${_toneByScore_(avg, 10)} 샘플로 평가됩니다.`,
    `항목 평균 ${_fmt(avg)}점에서 ${axis} 종합 평가는 단맛과 산미, 질감의 연결성이 로스팅 의도와 컵의 실제 인상에서 어떻게 드러났는지를 반영합니다.`
  ], _commentVariationKey_(payload, 'IKRC'));
}
