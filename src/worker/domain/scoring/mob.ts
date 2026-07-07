import { headerIdx, headerMap, isMainOrFinalRound, rowScoreExactHeaders, roundTotal, rowTimeSeconds, Row } from "./common";

export function mobTechnicalScoreHeaders(): string[] {
  return [
    "Pre-Service Station(시연 전 작업대)",
    "Service Station(시연 중 작업대)",
    "Post-Service Station(시연 후 작업대)",
    "Signature Technical Pre-Service Station(창작음료 시연 전 작업대)",
    "Signature Technical Service Station(창작음료 시연 중 작업대)",
    "Signature Technical Ingredient Use(부재료 사용의 적절함)",
    "Signature Technical Post-Service Station(창작음료 시연 후 작업대)"
  ];
}

export function mobSensoryScoreHeaders(): string[] {
  return [
    "Sweetness(스윗니스)",
    "Flavor(플레이버)",
    "Balance(균형)",
    "Clean Cup(클린컵)",
    "Mouthfeel(질감)",
    "Professionalism(시연 전문성)"
  ];
}

export function mobCreativeScoreHeaders(): string[] {
  return [
    "Creative Form & Usability(형태와 용이성)",
    "Creative Flavor(창작 향미)",
    "Creative Balance(균형)",
    "Creative Mouthfeel(질감)",
    "Creative Professionalism(전문성과 독창성)"
  ];
}

export function mobPresentationLimitSeconds(round?: unknown): number {
  return isMainOrFinalRound(round) ? 900 : 600;
}

export function mobTimePenaltyPointsFromSeconds(sec: unknown, round?: unknown): number {
  const n = Number(sec);
  if (!Number.isFinite(n) || n >= 999999) return 0;
  const over = n - mobPresentationLimitSeconds(round);
  if (over < 1) return 0;
  if (over <= 15) return 6;
  if (over <= 30) return 24;
  if (over <= 60) return 40;
  return 0;
}

export function mobIsTimeDisqualifiedBySeconds(sec: unknown, round?: unknown): boolean {
  const n = Number(sec);
  if (!Number.isFinite(n) || n >= 999999) return false;
  return n > mobPresentationLimitSeconds(round) + 60;
}

export function mobIsTimeDisqualifiedByRow(headers: string[], row: Row, round?: unknown): boolean {
  return mobIsTimeDisqualifiedBySeconds(rowTimeSeconds(headers, row), round);
}

export function recalcMobTotalInRow(headers: string[], row: Row, round?: unknown): number | null {
  const map = headerMap(headers || []);
  const scoreHeaders = mobTechnicalScoreHeaders().concat(mobSensoryScoreHeaders(), mobCreativeScoreHeaders());
  const sum = rowScoreExactHeaders(headers, row, scoreHeaders);
  const penaltyIdx = headerIdx(map, ["시간감점", "Time Penalty", "Penalty"], -1);
  const timeSec = rowTimeSeconds(headers, row);
  let penalty = mobTimePenaltyPointsFromSeconds(timeSec, round);
  if (penaltyIdx >= 0 && timeSec < 999999) {
    while (row.length <= penaltyIdx) row.push("");
    row[penaltyIdx] = penalty || "";
  } else if (penaltyIdx >= 0 && penaltyIdx < row.length) {
    penalty = Number(row[penaltyIdx]) || 0;
  }
  const total = Math.max(0, roundTotal(sum - penalty));
  const totalIdx = headerIdx(map, ["총점", "Total"], -1);
  if (totalIdx >= 0) {
    while (row.length <= totalIdx) row.push("");
    row[totalIdx] = total;
  }
  return total;
}
