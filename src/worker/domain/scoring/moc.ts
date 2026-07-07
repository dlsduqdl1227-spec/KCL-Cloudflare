import { safeStr } from "../../utils/validation";
import { headerIdx, headerMap, isDisqualifiedValue, isMainOrFinalRound, normalizeRoundName, num, roundTotal, Row } from "./common";
import { ktccIsTimeDisqualifiedByRow } from "./kbc";

export function recalcMocTotalInRow(headers: string[], row: Row, round?: unknown): number | null {
  const map = headerMap(headers || []);
  const correctIdx = headerIdx(map, ["정답수", "정답 수", "Correct Count", "CorrectCount", "Correct"], -1);
  const bonusIdx = headerIdx(map, ["가산점", "보너스", "Bonus"], -1);
  const totalIdx = headerIdx(map, ["총점", "최종점수", "Total"], -1);
  const correct = Math.max(0, Math.min(4, Math.round(correctIdx >= 0 ? num(row[correctIdx]) : 0)));
  const normalizedRound = normalizeRoundName(round, "예선");
  const bonusMax = isMainOrFinalRound(round) || normalizedRound === "본선" || normalizedRound === "결선" ? 3 : 1;
  const bonus = Math.max(0, Math.min(bonusMax, Math.round(bonusIdx >= 0 ? num(row[bonusIdx]) : 0)));
  if (correctIdx >= 0) row[correctIdx] = correct;
  if (bonusIdx >= 0) row[bonusIdx] = bonus;
  const total = roundTotal(correct + bonus);
  if (totalIdx >= 0) {
    while (row.length <= totalIdx) row.push("");
    row[totalIdx] = total;
  }
  const dqIdx = headerIdx(map, ["실격여부", "DQ", "Disqualified"], -1);
  const reasonIdx = headerIdx(map, ["실격사유", "실격이유", "DQ Reason", "Disqualification Reason"], -1);
  const timeDq = ktccIsTimeDisqualifiedByRow(headers, row, "MOC", round);
  const manualDq = dqIdx >= 0 && isDisqualifiedValue(row[dqIdx]);
  const isDq = timeDq || manualDq;
  const reason = reasonIdx >= 0 ? safeStr(row[reasonIdx]) : "";
  if (dqIdx >= 0) {
    while (row.length <= dqIdx) row.push("");
    row[dqIdx] = isDq ? "Y" : "N";
  }
  if (reasonIdx >= 0) {
    while (row.length <= reasonIdx) row.push("");
    row[reasonIdx] = isDq ? (timeDq ? "시간 초과" : (reason || "실격")) : "";
  }
  return total;
}
