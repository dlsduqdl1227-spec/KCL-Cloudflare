import { AppContext, competitionByCode, getSession } from "../db/d1";
import { normalizeCompetitionRound } from "../domain/scoring/common";
import { safeStr } from "../utils/validation";

type SubmitPayload = {
  competitionCode?: string;
  judgeToken?: string;
  token?: string;
  judgeName?: string;
  judgeRole?: string;
  playerName?: string;
  team?: string;
  judgeTeam?: string;
  teamGroup?: string;
  mode?: string;
  disqualified?: unknown;
  disqualificationReason?: unknown;
  rows?: Array<{ data?: unknown[]; extraFields?: Record<string, unknown>; disqualified?: unknown; disqualificationReason?: unknown }>;
  signatureBase64?: string;
};

export async function submitScores(ctx: AppContext, payload: SubmitPayload) {
  payload = payload || {};
  const code = safeStr(payload.competitionCode).toUpperCase();
  if (!code) return { success: false, message: "대회코드가 없습니다." };
  const session = await getSession(ctx, payload.judgeToken || payload.token);
  if (!session) return { success: false, message: "로그인 세션이 만료되었습니다. 다시 로그인해주세요." };
  const comp = await competitionByCode(ctx, code);
  if (!comp) return { success: false, message: "대회 설정을 찾을 수 없습니다." };
  if (!comp.is_active) return { success: false, message: "비활성화된 대회입니다." };
  const rows = payload.rows || [];
  if (!rows.length) return { success: false, message: "제출할 데이터가 없습니다." };
  const round = normalizeCompetitionRound(code, comp.current_round || "", "예선");

  const startResult = await ctx.env.DB.prepare(`SELECT COALESCE(MAX(legacy_row_index), 1) + 1 AS next_row FROM submissions WHERE competition_id = ?`).bind(comp.id).first<any>();
  let nextRow = Number(startResult?.next_row || 2);
  const inserted: number[] = [];
  for (const item of rows) {
    const rawData = item.data || [];
    const extra = item.extraFields || {};
    const participantKey = safeStr(firstFilled(extra, ["참가자번호", "참가자 번호", "팀번호", "팀 번호", "샘플번호", "SampleNo", "ParticipantNo", "PlayerNo"], rawData[0]));
    const participantName = safeStr(firstFilled(extra, ["선수명", "참가자명", "팀명", "이름", "Name"], payload.playerName || rawData[1]));
    const teamName = safeStr(firstFilled(extra, ["팀명", "소속", "TeamName"], ""));
    const totalCandidate = findTotalCandidate(code, rawData, extra);
    const isDisqualified = disqualifiedFlag(firstFilled(extra, ["실격여부", "DQ", "Disqualified"], item.disqualified ?? payload.disqualified));
    const dqReason = safeStr(firstFilled(extra, ["실격사유", "실격이유", "DQ Reason", "Disqualification Reason"], item.disqualificationReason ?? payload.disqualificationReason));
    const res = await ctx.env.DB.prepare(
      `INSERT INTO submissions
       (competition_id, competition_code, round, judge_name, judge_team, judge_role, mode, participant_key, participant_name, team_name, total_score, final_score,
        review_status, disqualified, disqualification_reason, signature_base64, legacy_row_index, legacy_sheet_name, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '미검수', ?, ?, ?, ?, ?, ?)`
    ).bind(
      comp.id,
      code,
      round,
      safeStr(payload.judgeName || session.name),
      safeStr(payload.team || payload.judgeTeam || payload.teamGroup || session.teamGroup),
      safeStr(payload.judgeRole || session.role),
      safeStr(payload.mode || "judge"),
      participantKey,
      participantName,
      teamName,
      totalCandidate,
      totalCandidate,
      isDisqualified ? 1 : 0,
      dqReason,
      safeStr(payload.signatureBase64).slice(0, 49000) || null,
      nextRow,
      comp.legacy_sheet_name || code,
      JSON.stringify({ data: rawData, extraFields: extra })
    ).run();
    const submissionId = Number(res.meta.last_row_id);
    inserted.push(submissionId);
    for (let i = 0; i < rawData.length; i++) {
      await ctx.env.DB.prepare(
        `INSERT INTO submission_values (submission_id, header_key, header_label, value_text, value_number, ordinal)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(submissionId, `_col${i}`, `_col${i}`, rawData[i] == null ? "" : String(rawData[i]), numericOrNull(rawData[i]), i).run();
    }
    let ordinal = rawData.length;
    for (const [key, value] of Object.entries(extra)) {
      await ctx.env.DB.prepare(
        `INSERT INTO submission_values (submission_id, header_key, header_label, value_text, value_number, value_json, ordinal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(submissionId, key, key, value == null ? "" : String(value), numericOrNull(value), typeof value === "object" ? JSON.stringify(value) : null, ordinal++).run();
    }
    nextRow++;
  }
  return {
    success: true,
    message: `${inserted.length}건 저장 완료`,
    competitionCode: code,
    round,
    sheetName: comp.legacy_sheet_name || code,
    startRow: nextRow - inserted.length,
    endRow: nextRow - 1,
    recordedAt: new Date().toISOString(),
    submissionIds: inserted,
    warning: "MVP는 제출 원본 저장을 우선합니다. 대회별 헤더 기반 서버 재계산은 domain 모듈로 분리되어 있으며 import된 헤더 매핑 검증 후 API에 더 강하게 연결해야 합니다."
  };
}

export async function submitWithSignature(ctx: AppContext, payload: SubmitPayload) {
  if (!payload || (safeStr(payload.competitionCode).toUpperCase() !== "MOC" && safeStr(payload.competitionCode).toUpperCase() !== "KTCC")) {
    return { success: false, message: "서명 제출은 MOC/KTCC에서만 사용할 수 있습니다." };
  }
  return submitScores(ctx, { ...payload, mode: payload.mode || "final" });
}

function numericOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstFilled(extra: Record<string, unknown>, keys: string[], fallback: unknown): unknown {
  for (const key of keys || []) {
    if (extra && Object.prototype.hasOwnProperty.call(extra, key) && safeStr(extra[key]) !== "") return extra[key];
  }
  return fallback;
}

export function disqualifiedFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  const s = safeStr(value).replace(/\s/g, "").toLowerCase();
  if (!s) return false;
  if (["y", "yes", "true", "1", "dq", "disqualified", "실격"].includes(s)) return true;
  if (["n", "no", "false", "0", "정상"].includes(s)) return false;
  return false;
}

export function findTotalCandidate(competitionCode: string, data: unknown[], extra: Record<string, unknown>): number | null {
  for (const key of ["최종점수", "총점", "Final Score", "FinalScore", "Total"]) {
    const n = Number(extra[key]);
    if (Number.isFinite(n)) return n;
  }
  const code = safeStr(competitionCode).toUpperCase();
  const fixedIndexes: Record<string, number[]> = {
    MOC: [4],
    KTCC: [11],
    KCAC: [21],
    MOB: [16]
  };
  for (const idx of fixedIndexes[code] || []) {
    const n = Number(data[idx]);
    if (Number.isFinite(n)) return n;
  }
  for (let i = data.length - 1; i >= 0; i--) {
    const n = Number(data[i]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
