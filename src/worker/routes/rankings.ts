import { AppContext, competitionByCode, getSession } from "../db/d1";
import { compareRankingRows, RankingRow } from "../domain/ranking/compareRankingRows";
import { accumulateTieBreaks, getTieRule } from "../domain/ranking/tieRules";
import { normalizeCompetitionRound } from "../domain/scoring/common";
import { mobCreativeScoreHeaders, mobSensoryScoreHeaders, mobTechnicalScoreHeaders } from "../domain/scoring/mob";
import { safeStr } from "../utils/validation";

export async function getRanking(ctx: AppContext, competitionCode: unknown, actorTokenOrInfo?: any) {
  const token = actorTokenOrInfo && typeof actorTokenOrInfo === "object" ? actorTokenOrInfo.judgeToken || actorTokenOrInfo.token : actorTokenOrInfo;
  const session = await getSession(ctx, token);
  if (!session) return { success: false, message: "로그인 세션이 만료되었습니다. 다시 로그인해주세요." };
  const comp = await competitionByCode(ctx, competitionCode);
  if (!comp) return { success: false, message: "대회 설정을 찾을 수 없습니다." };
  const code = safeStr(comp.code).toUpperCase();
  const round = normalizeCompetitionRound(code, comp.current_round || "", "예선");
  const rows = await ctx.env.DB.prepare(
    `SELECT id, participant_key, participant_name, team_name, round, judge_name, judge_role, mode,
            total_score, final_score, review_status, disqualified, raw_json
       FROM submissions
      WHERE competition_id = ? AND round = ?
      ORDER BY id`
  ).bind(comp.id, round).all<any>();
  const latest = new Map<string, any>();
  for (const row of rows.results || []) {
    if (shouldSkipRankingSubmission(code, row)) continue;
    latest.set(latestSubmissionKey(code, row), row);
  }
  const groups = new Map<string, RankingRow & { maxScore: number; reviewedCount: number; unitDisplay?: string }>();
  for (const row of latest.values()) {
    const unit = safeStr(row.participant_key) || "-";
    const score = Number(row.final_score ?? row.total_score);
    const group = groups.get(unit) || {
      unit,
      round,
      rankingScore: 0,
      totalScore: 0,
      avgScore: 0,
      maxScore: Number.NEGATIVE_INFINITY,
      judgeCount: 0,
      reviewedCount: 0,
      disqualified: false,
      tie: {},
      unitDisplay: displayUnit(row)
    };
    if (Number.isFinite(score)) {
      group.totalScore = roundNumber(Number(group.totalScore || 0) + score);
      group.maxScore = Math.max(group.maxScore, score);
      group.judgeCount = Number(group.judgeCount || 0) + 1;
    }
    group.reviewedCount += row.review_status === "검수완료" ? 1 : 0;
    group.disqualified = !!group.disqualified || !!row.disqualified;
    const values = submissionValuesForTie(code, row.raw_json);
    accumulateTieBreaks(group, values.headers, values.row, code, round, score);
    groups.set(unit, group);
  }
  const ranking: RankingRow[] = Array.from(groups.values()).map((group) => {
    const judgeCount = Number(group.judgeCount || 0);
    const avgScore = judgeCount ? roundNumber(Number(group.totalScore || 0) / judgeCount) : 0;
    const rankingScore = rankingScoreForGroup(code, Number(group.totalScore || 0), avgScore, group.maxScore);
    const { maxScore: _maxScore, ...publicGroup } = group;
    return {
      ...publicGroup,
      rankingScore,
      avgScore
    };
  });
  ranking.sort((a, b) => compareRankingRows(a, b, comp.code));
  let rank = 0;
  const total = ranking.filter((r) => !r.disqualified).length;
  const output = ranking.map((r) => {
    if (r.disqualified) return { ...r, rank: "실격", rankText: "실격", totalInRound: total };
    rank++;
    return { ...r, unitDisplay: (r as any).unitDisplay || r.unit, rank, rankText: `전체 ${total}명/팀 중 ${rank}위`, totalInRound: total, scoreBasis: scoreBasisLabel(code) };
  });
  return {
    success: true,
    compName: comp.name,
    compCode: comp.code,
    currentRound: round,
    unitLabel: "식별자",
    tieBreakRule: getTieRule(comp.code, round).label,
    ranking: output,
    warning: "현재 라운드 기준으로 최신 제출값을 집계합니다. KCR 결선 정규화 지수처럼 규정집에 내부 산식 확인이 필요한 항목은 운영 확정 산식과 대조가 필요합니다."
  };
}

function shouldSkipRankingSubmission(code: string, row: any): boolean {
  const mode = safeStr(row.mode).toLowerCase();
  const role = safeStr(row.judge_role).toLowerCase();
  if (/켈리브레이션|calibration|calib/.test(mode)) return true;
  if ((code === "IKRC" || code === "MOB") && (/헤드/.test(role) || /head/.test(role))) return true;
  return false;
}

function latestSubmissionKey(code: string, row: any): string {
  const parsed = parseSubmissionRaw(row.raw_json);
  const slot = code === "KCAC" ? kcacSubmissionSlot(parsed) : "";
  return [
    safeStr(row.participant_key),
    safeStr(row.round),
    safeStr(row.judge_name),
    safeStr(row.judge_role),
    safeStr(row.mode),
    slot
  ].join("||");
}

function kcacSubmissionSlot(parsed: { data: unknown[]; extraFields: Record<string, unknown> }): string {
  const data = parsed.data || [];
  return [
    data[2],
    data[3],
    data[4],
    parsed.extraFields["패턴종류"]
  ].map(safeStr).join("|");
}

function parseSubmissionRaw(raw: unknown): { data: unknown[]; extraFields: Record<string, unknown> } {
  if (!raw) return { data: [], extraFields: {} };
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw as any;
    return {
      data: Array.isArray(parsed?.data) ? parsed.data : [],
      extraFields: parsed?.extraFields && typeof parsed.extraFields === "object" ? parsed.extraFields : {}
    };
  } catch {
    return { data: [], extraFields: {} };
  }
}

function submissionValuesForTie(code: string, raw: unknown): { headers: string[]; row: unknown[] } {
  const parsed = parseSubmissionRaw(raw);
  const rawHeaders = knownRawHeadersForCode(code, parsed.data.length);
  const headers = rawHeaders.slice();
  const row = parsed.data.slice();
  for (const [key, value] of Object.entries(parsed.extraFields)) {
    headers.push(key);
    row.push(value);
  }
  return { headers, row };
}

function knownRawHeadersForCode(code: string, length: number): string[] {
  const headers: Record<string, string[]> = {
    KCR: ["참가자번호", "프로세스", "Flavor", "Flavor Intensity", "Aftertaste", "Aftertaste Persistence", "Acidity", "Acidity Intensity", "Body", "Body Intensity", "Sweetness", "Sweetness Intensity", "Overall", "Overall Comment", "총점", "실격여부", "실격사유", "검수상태"],
    KCAC: ["참가자번호", "선수명", "우유구분", "평가구분", "제품명", "Pattern Completion", "Pattern Symmetry & Balance", "Surface Quality", "Position & Proportion", "Pattern Definition", "Theme Expression", "Technical Execution", "Cleanliness", "Taste Balance", "Mouthfeel", "Presentation", "Surface Quality", "Position & Proportion", "Design Completion", "소계", "감점", "총점", "검수자", "코멘트", "실격여부", "실격사유", "검수상태"],
    IKRC: ["샘플번호", "Flavor(플레이버)", "Flavor Intensity", "Clean Cup(클린컵)", "Clean Cup Intensity", "Sweetness(스윗니스)", "Sweetness Intensity", "Acidity(산미)", "Acidity Intensity", "Mouthfeel(마우스필)", "Mouthfeel Intensity", "코멘트", "총점", "실격여부", "검수상태"],
    MOB: ["참가자번호", "메뉴"]
      .concat(mobTechnicalScoreHeaders().slice(0, 3))
      .concat(mobSensoryScoreHeaders())
      .concat(mobCreativeScoreHeaders())
      .concat(["총점", "코멘트", "실격여부", "실격사유", "검수상태"])
  };
  const base = (headers[code] || []).slice();
  while (base.length < length) base.push(`_col${base.length}`);
  return base;
}

function rankingScoreForGroup(code: string, totalScore: number, avgScore: number, maxScore: number): number {
  if (code === "KBC" || code === "IKRC" || code === "KCR") return avgScore;
  if (code === "KCAC" || code === "MOB") return roundNumber(totalScore);
  return Number.isFinite(maxScore) ? roundNumber(maxScore) : roundNumber(totalScore);
}

function scoreBasisLabel(code: string): string {
  if (code === "KBC" || code === "IKRC" || code === "KCR") return "현재 라운드 평균";
  if (code === "KCAC" || code === "MOB") return "현재 라운드 합산";
  return "현재 라운드 최신 제출";
}

function displayUnit(row: any): string {
  const name = safeStr(row.participant_name);
  const team = safeStr(row.team_name);
  const unit = safeStr(row.participant_key) || "-";
  if (team && team !== unit) return `${unit} · ${team}`;
  if (name && name !== unit) return `${unit} · ${name}`;
  return unit;
}

function roundNumber(value: number): number {
  return Number((Math.round((Number(value) || 0) * 1000) / 1000).toFixed(3));
}

export async function getRankingDetail(ctx: AppContext, competitionCode: unknown, unit: unknown, round: unknown, actorTokenOrInfo?: any) {
  const token = actorTokenOrInfo && typeof actorTokenOrInfo === "object" ? actorTokenOrInfo.judgeToken || actorTokenOrInfo.token : actorTokenOrInfo;
  const session = await getSession(ctx, token);
  if (!session) return { success: false, message: "로그인 세션이 만료되었습니다. 다시 로그인해주세요." };
  const comp = await competitionByCode(ctx, competitionCode);
  if (!comp) return { success: false, message: "대회 설정을 찾을 수 없습니다." };
  const detailRound = normalizeCompetitionRound(comp.code, safeStr(round) || comp.current_round || "", "예선");
  const rows = await ctx.env.DB.prepare(`SELECT * FROM submissions WHERE competition_id = ? AND participant_key = ? AND round = ? ORDER BY id`).bind(comp.id, safeStr(unit), detailRound).all<any>();
  return {
    success: true,
    compCode: comp.code,
    compName: comp.name,
    unitLabel: "식별자",
    unit: safeStr(unit),
    unitDisplay: safeStr(unit),
    round: detailRound,
    headers: ["제출시간", "심사위원명", "총점", "검수상태"],
    rows: (rows.results || []).map((r) => ({ rowIndex: r.legacy_row_index || r.id, "제출시간": r.submitted_at, "심사위원명": r.judge_name, "총점": r.final_score ?? r.total_score ?? "", status: r.review_status })),
    scores: [],
    totalScore: 0,
    avgScore: 0,
    reviewedCount: 0,
    totalCount: rows.results?.length || 0,
    warning: "MVP 상세 디브리핑은 표준 컬럼 중심입니다. 동적 평가 컬럼 복원은 CSV import 매핑 이후 확장 TODO입니다."
  };
}

export async function createRankingDetailPdf() {
  return { success: false, message: "PDF 서버 생성은 2차 구현 예정입니다. 브라우저 인쇄 기능을 사용해주세요." };
}
