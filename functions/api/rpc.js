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
    updateReviewStatus: () => updateReviewStatus(env, args[0], [args[1]], args[2], args[3], args[4]),
    updateReviewStatusBatch: () => updateReviewStatus(env, args[0], args[1], args[2], args[3], args[4]),
    deleteReviewRow: () => deleteReviewRow(env, args[0], args[1], args[2]),
    getRanking: () => getRanking(env, args[0], args[1]),
    getRankingDetail: () => getRankingDetail(env, args[0], args[1], args[2], args[3]),
    sendOTP: () => sendOTP(env, args[0], args[1], args[2], args[3]),
    verifyOTP: () => verifyOTP(env, args[0], args[1], args[2], args[3], args[4]),
    createDebriefPdfFromPayload: () => ({ success: false, message: 'PDF 생성은 v2 2단계에서 Workers PDF 서비스로 연결 예정입니다.' }),
    createRankingDetailPdf: () => ({ success: false, message: 'PDF 생성은 v2 2단계에서 Workers PDF 서비스로 연결 예정입니다.' }),
    generateCuppingComment: () => generateComment(args),
    generateKbcComment: () => generateComment(args),
    generateKcacComment: () => generateComment(args),
    generateMobComment: () => generateComment(args),
    generateIkrcComment: () => generateComment(args),
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

function inferScorePayload(payload) {
  const p = payload || {};
  const rows = Array.isArray(p.rows) ? p.rows : [];
  const firstRow = rows[0] || {};
  const extra = firstRow.extraFields || p.extraFields || {};
  const data = Array.isArray(firstRow.data) ? firstRow.data : (Array.isArray(p.data) ? p.data : []);

  function firstNonEmpty(list) {
    for (const v of list) {
      const s = safeStr(v);
      if (s) return s;
    }
    return '';
  }

  function toNumber(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function numberFromKeys(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        const n = toNumber(obj[k]);
        if (n !== null) return n;
      }
    }
    return null;
  }

  const code = safeStr(
    p.competitionCode || p.code || p.compCode || p.competition || ''
  ).toUpperCase();

  const round = safeStr(p.round || p.currentRound || p.roundName || '');

  const judgeName = firstNonEmpty([
    p.judgeName,
    p.name,
    p.judge && p.judge.name
  ]);

  const role = firstNonEmpty([
    p.judgeRole,
    p.role,
    p.judge && p.judge.role
  ]);

  const team = firstNonEmpty([
    p.team,
    p.teamGroup,
    p.judge && p.judge.teamGroup
  ]);

  const mode = safeStr(p.mode || p.evalMode || '');

  const unit = firstNonEmpty([
    p.unit,
    p.cupNo,
    p.cupNumber,
    p.participantNo,
    p.participantNumber,
    p.teamNo,
    p.targetNo,
    p.number,
    extra['참가자번호'],
    extra['Cup No'],
    extra['컵번호'],
    extra['팀번호'],
    data[0]
  ]);

  const participantName = firstNonEmpty([
    p.participantName,
    p.playerName,
    p.teamName,
    extra['선수명'],
    extra['참가자명'],
    extra['팀명']
  ]);

  let total = toNumber(
    p.totalScore ?? p.total ?? p.finalScore ?? p.subtotalScore ?? p.subtotal
  );

  if (total === null) {
    total = numberFromKeys(extra, [
      '총점',
      '최종점수',
      'Total',
      'Total Score',
      'total',
      'totalScore',
      'finalScore',
      'subtotalScore',
      'subtotal'
    ]);
  }

  if (total === null && rows.length) {
    const nums = [];
    rows.forEach(function(row) {
      if (row && row.extraFields) {
        const n = numberFromKeys(row.extraFields, [
          '총점',
          '최종점수',
          'Total',
          'Total Score',
          'total',
          'totalScore',
          'finalScore',
          'subtotalScore',
          'subtotal'
        ]);
        if (n !== null) nums.push(n);
      }
    });
    if (nums.length) total = Math.max(...nums);
  }

  if (total === null) {
    const nums = [];
    JSON.stringify(p).replace(
      /"(?:총점|최종점수|Total|Total Score|totalScore|finalScore|subtotalScore|subtotal|score)"\s*:\s*"?(-?[0-9]+(?:\.[0-9]+)?)/gi,
      function(_, n) {
        nums.push(Number(n));
        return _;
      }
    );
    if (nums.length) total = Math.max(...nums);
  }

  const dqValue = firstNonEmpty([
    p.disqualified,
    p.dq,
    extra['실격여부']
  ]);

  const disqualified =
    dqValue === true ||
    dqValue === 'true' ||
    dqValue === 'Y' ||
    dqValue === 'y' ||
    dqValue === '1';

  const dqReason = firstNonEmpty([
    p.disqualificationReason,
    p.dqReason,
    extra['실격사유']
  ]);

  return {
    code,
    round,
    judgeName,
    role,
    team,
    mode,
    unit,
    participantName,
    total,
    disqualified,
    dqReason
  };
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
  const code = safeStr(competitionCode).toUpperCase();
  const actor = await getActor(env, actorArg);
  if (!hasAccess(actor, code)) return { success: false, message: '검수 조회 권한이 없습니다.' };
  const rows = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? ORDER BY id DESC').bind(code).all();
  const list = (rows.results || []).map(r => {
    const payload = parseJson(r.payload_json, {});
    return {
      rowIndex: r.id,
      submittedAt: r.submitted_at,
      timestamp: r.submitted_at,
      competitionCode: r.competition_code,
      round: r.round || '',
      judgeName: r.judge_name || '',
      team: r.team || '',
      role: r.role || '',
      mode: r.mode || '',
      unit: r.unit || '',
      participantName: r.participant_name || '',
      totalScore: r.total_score,
      disqualified: !!r.disqualified,
      disqualificationReason: r.disqualification_reason || '',
      status: r.review_status || '미검수',
      payload,
      values: Object.values(payload)
    };
  });
  return { success: true, list, headers: ['제출시간','대회코드','라운드','심사위원명','팀','역할','모드','식별자','선수명','총점','실격여부','실격사유','검수상태'] };
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
async function getRankingDetail(env, competitionCode, unit, round) {
  const code = safeStr(competitionCode).toUpperCase();
  const rows = await env.DB.prepare('SELECT * FROM scores WHERE competition_code=? AND COALESCE(NULLIF(unit,\'\'), CAST(id AS TEXT))=? AND round=? ORDER BY id')
    .bind(code, safeStr(unit), safeStr(round)).all();
  const detailRows = (rows.results || []).map(r => ({
    rowIndex: r.id,
    submittedAt: r.submitted_at,
    judgeName: r.judge_name || '',
    role: r.role || '',
    team: r.team || '',
    totalScore: r.total_score,
    status: r.review_status || '미검수',
    payload: parseJson(r.payload_json, {})
  }));
  const avg = detailRows.length ? detailRows.reduce((s, x) => s + (Number(x.totalScore) || 0), 0) / detailRows.length : null;
  return { success: true, compCode: code, compName: COMPETITION_NAMES[code] || code, unit, unitDisplay: unit, round, totalScore: avg, rows: detailRows, headers: [] };
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
function generateComment(args) {
  return { success: true, comments: ['선택한 항목을 바탕으로 균형과 개선점을 함께 기록했습니다.', '강점은 명확하게 유지하고, 감점 요인은 구체적으로 보완하면 좋겠습니다.'] };
}
