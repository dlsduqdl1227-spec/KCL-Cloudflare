import { safeStr } from "../../utils/validation";
import { normalizeCompetitionRound } from "../scoring/common";
import { getTieRule, competitionUsesAverageRanking } from "./tieRules";

export type RankingRow = {
  unit: string;
  round: string;
  disqualified?: boolean;
  rankingScore?: number;
  avgScore?: number;
  totalScore?: number;
  judgeCount?: number;
  tie?: Record<string, number>;
};

export function rankingPrimaryScore(row: RankingRow, competitionCode: string): number {
  if (row && row.rankingScore != null && !Number.isNaN(Number(row.rankingScore))) return Number(row.rankingScore) || 0;
  if (competitionUsesAverageRanking(competitionCode) && row && Number(row.judgeCount) > 0) return Number(row.avgScore) || 0;
  return row ? Number(row.totalScore) || 0 : 0;
}

export function compareRankingRows(a: RankingRow, b: RankingRow, competitionCode: string): number {
  if (!!a.disqualified !== !!b.disqualified) return a.disqualified ? 1 : -1;
  const aRound = normalizeCompetitionRound(competitionCode, a.round, "");
  const bRound = normalizeCompetitionRound(competitionCode, b.round, "");
  if (aRound !== bRound) {
    if (aRound === "결선") return -1;
    if (bRound === "결선") return 1;
    if (aRound === "본선") return -1;
    if (bRound === "본선") return 1;
    return aRound < bRound ? -1 : 1;
  }
  const aScore = rankingPrimaryScore(a, competitionCode);
  const bScore = rankingPrimaryScore(b, competitionCode);
  if (bScore !== aScore) return bScore - aScore;
  const rule = getTieRule(competitionCode, aRound);
  for (const item of rule.order) {
    const av = a.tie && a.tie[item.key] != null ? a.tie[item.key] : (item.dir === 1 ? 999999 : 0);
    const bv = b.tie && b.tie[item.key] != null ? b.tie[item.key] : (item.dir === 1 ? 999999 : 0);
    if (av !== bv) return item.dir === 1 ? av - bv : bv - av;
  }
  return String(a.unit).localeCompare(String(b.unit), "ko");
}

export function rankingUnitDisplay(unit: unknown): string {
  return safeStr(unit) || "-";
}
