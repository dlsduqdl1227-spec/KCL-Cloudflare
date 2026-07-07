import { AppContext, competitionByCode, getSession } from "../db/d1";
import { normalizeCompetitionRound } from "../domain/scoring/common";
import { safeStr } from "../utils/validation";

export async function getParticipantAssignments(ctx: AppContext, competitionCode: unknown, actorTokenOrInfo?: any) {
  const code = safeStr(competitionCode).toUpperCase();
  const token = actorTokenOrInfo && typeof actorTokenOrInfo === "object" ? actorTokenOrInfo.judgeToken || actorTokenOrInfo.token : actorTokenOrInfo;
  const session = await getSession(ctx, token);
  if (!session) return { success: false, message: "로그인 세션이 만료되었습니다. 다시 로그인해주세요." };
  const comp = await competitionByCode(ctx, code);
  if (!comp) return { success: false, message: "대회 설정을 찾을 수 없습니다." };
  const round = normalizeCompetitionRound(code, comp.current_round || "", "예선");
  const rows = await ctx.env.DB.prepare(
    `SELECT * FROM participants WHERE competition_id = ? ORDER BY COALESCE(NULLIF(prelim_cup_no, ''), unique_no, name), id`
  ).bind(comp.id).all<any>();
  const assignments = (rows.results || []).map((row) => {
    const roundCupNo = roundCupNoForParticipant(row, round);
    const number = participantNumberForRound(row, code, round);
    const displayName = code === "KTCC" ? (row.team_name || row.name) : row.name;
    return {
      rowIndex: row.legacy_row_index || row.id,
      competitionCode: code,
      number,
      numberSource: number ? "migrated" : "",
      name: displayName,
      affiliation: row.affiliation || "",
      teamName: row.team_name || "",
      teamNo: row.team_no || "",
      uniqueNo: row.unique_no || "",
      roundCupNo,
      sampleNo: row.sample_no || "",
      display: `${number ? (code === "KTCC" ? "팀 " : "참가자 ") + number : "번호 미지정"}${displayName ? " · " + displayName : ""}${row.affiliation ? " · " + row.affiliation : ""}`
    };
  });
  assignments.sort((a, b) => compareAssignmentNumbers(a.number, b.number));
  return { success: true, competitionCode: code, round, assignments };
}

function roundCupNoForParticipant(row: any, round: string): string {
  if (round === "결선") return safeStr(row.final_cup_no || row.cup_no || "");
  if (round === "본선") return safeStr(row.main_cup_no || row.cup_no || "");
  return safeStr(row.prelim_cup_no || row.cup_no || "");
}

function participantNumberForRound(row: any, competitionCode: string, round: string): string {
  const code = safeStr(competitionCode).toUpperCase();
  const roundCupNo = roundCupNoForParticipant(row, round);
  if (code === "KTCC") return safeStr(row.team_no || row.unique_no || roundCupNo || row.cup_no || "");
  return safeStr(roundCupNo || row.team_no || row.unique_no || "");
}

function compareAssignmentNumbers(a: unknown, b: unknown): number {
  const as = safeStr(a);
  const bs = safeStr(b);
  const an = Number(as);
  const bn = Number(bs);
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  return as.localeCompare(bs, "ko", { numeric: true });
}
