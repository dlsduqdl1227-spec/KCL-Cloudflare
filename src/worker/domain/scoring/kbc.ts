import { elapsedSecondsFromValue } from "../../utils/time";
import { safeStr } from "../../utils/validation";
import { headerIdx, headerMap, isMainOrFinalRound, num, roundTotal, rowTimeSeconds, Row } from "./common";

export function competitionTimeLimitSeconds(competitionCode: string, round?: unknown): number {
  const code = safeStr(competitionCode).toUpperCase();
  if (code === "MOC") return isMainOrFinalRound(round) ? 360 : 300;
  if (code === "KBC") return isMainOrFinalRound(round) ? 600 : 420;
  return 480;
}

export function kbcPresentationLimitSeconds(round?: unknown): number {
  return isMainOrFinalRound(round) ? 600 : 420;
}

export function kbcDisqualificationLimitSeconds(round?: unknown): number {
  return kbcPresentationLimitSeconds(round) + 60;
}

export function kbcTimePenaltyPointsFromSeconds(sec: unknown, round?: unknown): number {
  const n = Number(sec);
  if (!Number.isFinite(n) || n >= 999999) return 0;
  const base = kbcPresentationLimitSeconds(round);
  const dq = kbcDisqualificationLimitSeconds(round);
  if (n <= base) return 0;
  if (n >= dq) return 0;
  return Math.max(0, Math.ceil((n - base) / 5));
}

export function kbcIsTimeDisqualifiedBySeconds(sec: unknown, round?: unknown): boolean {
  const n = Number(sec);
  if (!Number.isFinite(n) || n >= 999999) return false;
  return n >= kbcDisqualificationLimitSeconds(round);
}

export function ktccIsTimeDisqualifiedByRow(headers: string[], row: Row, competitionCode = "", round?: unknown): boolean {
  const map = headerMap(headers || []);
  const timeIdx = headerIdx(map, ["종료시간", "경기시간", "소요시간", "시연시간"], -1);
  if (timeIdx < 0) return false;
  const sec = elapsedSecondsFromValue(row[timeIdx]);
  if (sec == null) return false;
  if (safeStr(competitionCode).toUpperCase() === "KBC") return kbcIsTimeDisqualifiedBySeconds(sec, round);
  return sec > competitionTimeLimitSeconds(competitionCode, round);
}

export function kbcSubtotalScoreInRow(headers: string[], row: Row): number {
  const map = headerMap(headers || []);
  const fields = [
    { names: ["Presentation & Service(프레젠테이션과 서비스 전문성)", "Presentation & Service"], weight: 1 },
    { names: ["Espresso Taste & Design(맛과 설계) ×2", "Espresso Taste & Design"], weight: 2 },
    { names: ["Espresso Clean Cup(클린컵)", "Espresso Clean Cup"], weight: 1 },
    { names: ["Espresso Mouthfeel(마우스필)", "Espresso Mouthfeel"], weight: 1 },
    { names: ["Espresso Flavor(플레이버)", "Espresso Flavor"], weight: 1 },
    { names: ["Signature Taste & Design(맛과 설계) ×2", "Signature Taste & Design"], weight: 2 },
    { names: ["Signature Clean Cup(클린컵)", "Signature Clean Cup"], weight: 1 },
    { names: ["Signature Mouthfeel(마우스필)", "Signature Mouthfeel"], weight: 1 },
    { names: ["Signature Flavor(플레이버)", "Signature Flavor"], weight: 1 },
    { names: ["Machine & Equipment Professionalism(머신 및 기물 운용 전문성)", "Machine & Equipment Professionalism"], weight: 1 }
  ];
  let total = 0;
  fields.forEach((field) => {
    const idx = headerIdx(map, field.names, -1);
    if (idx >= 0 && idx < row.length && safeStr(row[idx]) !== "") total += num(row[idx]) * field.weight;
  });
  return roundTotal(total);
}

export function kbcEspressoScoreInRow(headers: string[], row: Row): number {
  const map = headerMap(headers || []);
  return roundTotal(
    num(row[headerIdx(map, ["Espresso Taste & Design(맛과 설계) ×2", "Espresso Taste & Design"], -1)]) * 2 +
    num(row[headerIdx(map, ["Espresso Clean Cup(클린컵)", "Espresso Clean Cup"], -1)]) +
    num(row[headerIdx(map, ["Espresso Mouthfeel(마우스필)", "Espresso Mouthfeel"], -1)]) +
    num(row[headerIdx(map, ["Espresso Flavor(플레이버)", "Espresso Flavor"], -1)])
  );
}

export function recalcKbcTotalInRow(headers: string[], row: Row, round?: unknown): number | null {
  const map = headerMap(headers || []);
  let total = kbcSubtotalScoreInRow(headers, row);
  const timeSec = rowTimeSeconds(headers, row);
  const penalty = kbcTimePenaltyPointsFromSeconds(timeSec, round);
  const penaltyIdx = headerIdx(map, ["시간감점", "Time Penalty", "Penalty"], -1);
  if (penaltyIdx >= 0) {
    while (row.length <= penaltyIdx) row.push("");
    row[penaltyIdx] = penalty || "";
  }
  total = Math.max(0, roundTotal(total - penalty));
  const espressoIdx = headerIdx(map, ["Espresso Total"], -1);
  if (espressoIdx >= 0) {
    while (row.length <= espressoIdx) row.push("");
    row[espressoIdx] = kbcEspressoScoreInRow(headers, row);
  }
  const sigIdx = headerIdx(map, ["Signature Total"], -1);
  if (sigIdx >= 0) {
    while (row.length <= sigIdx) row.push("");
    const sigBaseIdx = headerIdx(map, ["Signature Taste & Design(맛과 설계) ×2", "Signature Taste & Design"], -1);
    if (sigBaseIdx >= 0 && safeStr(row[sigBaseIdx]) !== "") {
      row[sigIdx] = roundTotal(
        num(row[sigBaseIdx]) * 2 +
        num(row[headerIdx(map, ["Signature Clean Cup(클린컵)", "Signature Clean Cup"], -1)]) +
        num(row[headerIdx(map, ["Signature Mouthfeel(마우스필)", "Signature Mouthfeel"], -1)]) +
        num(row[headerIdx(map, ["Signature Flavor(플레이버)", "Signature Flavor"], -1)])
      );
    } else {
      row[sigIdx] = "";
    }
  }
  const totalIdx = headerIdx(map, ["총점", "Total"], -1);
  if (totalIdx >= 0) {
    while (row.length <= totalIdx) row.push("");
    row[totalIdx] = total;
  }
  return total;
}
