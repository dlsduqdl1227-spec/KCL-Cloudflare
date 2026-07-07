import { AppContext, competitionByCode, getSession } from "../db/d1";
import { safeStr } from "../utils/validation";

export async function getReviewList(ctx: AppContext, competitionCode: unknown, actorTokenOrInfo?: any) {
  const code = safeStr(competitionCode).toUpperCase();
  const token = actorTokenOrInfo && typeof actorTokenOrInfo === "object" ? actorTokenOrInfo.judgeToken || actorTokenOrInfo.token : actorTokenOrInfo;
  const session = await getSession(ctx, token);
  if (!session) return { success: false, message: "로그인 세션이 만료되었습니다. 다시 로그인해주세요." };
  const comp = await competitionByCode(ctx, code);
  if (!comp) return { success: false, message: "대회 설정을 찾을 수 없습니다." };
  const rows = await ctx.env.DB.prepare(
    `SELECT * FROM submissions WHERE competition_id = ? ORDER BY id DESC LIMIT 500`
  ).bind(comp.id).all<any>();
  const headers = ["제출시간", "대회코드", "라운드", "심사위원명", "팀", "역할", "모드", "식별자", "총점", "검수상태", "실격여부", "실격사유"];
  const list = (rows.results || []).map((row) => ({
    rowIndex: row.legacy_row_index || row.id,
    submissionId: row.id,
    status: row.review_status || "미검수",
    "제출시간": row.submitted_at,
    "대회코드": row.competition_code,
    "라운드": row.round,
    "심사위원명": row.judge_name,
    "팀": row.judge_team,
    "역할": row.judge_role,
    "모드": row.mode,
    "식별자": row.participant_key,
    "총점": row.final_score ?? row.total_score ?? "",
    "검수상태": row.review_status,
    "실격여부": row.disqualified ? "Y" : "N",
    "실격사유": row.disqualification_reason || "",
    _col0: row.submitted_at,
    _col1: row.competition_code,
    _col2: row.round,
    _col3: row.judge_name,
    _col4: row.judge_team,
    _col5: row.judge_role,
    _col6: row.mode,
    _col7: row.participant_key,
    _col8: row.final_score ?? row.total_score ?? "",
    _col9: row.review_status
  }));
  return { success: true, list, headers, warning: "MVP 검수 목록은 D1 submissions 표준 컬럼 중심입니다. 대회별 동적 컬럼 노출은 CSV import header mapping 이후 확장 TODO입니다." };
}

export async function updateReviewStatus(ctx: AppContext, competitionCode: unknown, rowIndex: unknown, status: unknown, _actorRole?: unknown, actorTokenOrInfo?: any) {
  return updateReviewRow(ctx, competitionCode, rowIndex, {}, status, _actorRole, actorTokenOrInfo);
}

export async function updateReviewRow(ctx: AppContext, competitionCode: unknown, rowIndex: unknown, updates: Record<string, unknown> = {}, status?: unknown, _actorRole?: unknown, actorTokenOrInfo?: any) {
  const token = actorTokenOrInfo && typeof actorTokenOrInfo === "object" ? actorTokenOrInfo.judgeToken || actorTokenOrInfo.token : actorTokenOrInfo;
  const session = await getSession(ctx, token);
  if (!session) return { success: false, message: "로그인 세션이 만료되었습니다. 다시 로그인해주세요." };
  const comp = await competitionByCode(ctx, competitionCode);
  if (!comp) return { success: false, message: "대회 설정을 찾을 수 없습니다." };
  const idx = Number(rowIndex);
  const row = await ctx.env.DB.prepare(
    `SELECT * FROM submissions WHERE competition_id = ? AND (legacy_row_index = ? OR id = ?)`
  ).bind(comp.id, idx, idx).first<any>();
  if (!row) return { success: false, message: "수정할 제출 데이터를 찾을 수 없습니다." };
  const newStatus = safeStr(status) || row.review_status || "미검수";
  await ctx.env.DB.prepare(
    `UPDATE submissions SET review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(newStatus, row.id).run();
  await ctx.env.DB.prepare(
    `INSERT INTO review_events (submission_id, actor_name, event_type, old_status, new_status, updates_json)
     VALUES (?, ?, 'update', ?, ?, ?)`
  ).bind(row.id, safeStr(session.name), row.review_status || "", newStatus, JSON.stringify(updates || {})).run();
  return { success: true, warning: "MVP는 상태 저장을 우선 구현했습니다. 대회별 동적 컬럼 수정/서버 재계산 연결은 TODO입니다." };
}

export async function updateReviewStatusBatch(ctx: AppContext, competitionCode: unknown, rowIndexes: unknown[] = [], status: unknown, actorRole?: unknown, actorTokenOrInfo?: any) {
  let updated = 0;
  for (const rowIndex of rowIndexes || []) {
    const res = await updateReviewStatus(ctx, competitionCode, rowIndex, status, actorRole, actorTokenOrInfo);
    if (res.success) updated++;
  }
  if (!updated) return { success: false, message: "변경 가능한 행이 없습니다." };
  return { success: true, updated };
}

export async function deleteReviewRow(ctx: AppContext, competitionCode: unknown, rowIndex: unknown, _actorRole?: unknown, actorTokenOrInfo?: any) {
  const token = typeof actorTokenOrInfo === "object" ? actorTokenOrInfo.judgeToken || actorTokenOrInfo.token : actorTokenOrInfo;
  const session = await getSession(ctx, token);
  if (!session) return { success: false, message: "로그인 세션이 만료되었습니다. 다시 로그인해주세요." };
  if (safeStr(session.accountType || session.type).toUpperCase() !== "ADMIN") return { success: false, message: "삭제는 관리자 권한에서만 가능합니다." };
  const comp = await competitionByCode(ctx, competitionCode);
  if (!comp) return { success: false, message: "대회 설정을 찾을 수 없습니다." };
  const idx = Number(rowIndex);
  const row = await ctx.env.DB.prepare(`SELECT id FROM submissions WHERE competition_id = ? AND (legacy_row_index = ? OR id = ?)`).bind(comp.id, idx, idx).first<any>();
  if (!row) return { success: false, message: "삭제할 행을 찾을 수 없습니다." };
  await ctx.env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(row.id).run();
  return { success: true };
}
