import { safeStr } from "../../utils/validation";
import { headerIdx, headerMap, isDisqualifiedValue, roundTotal, Row } from "./common";

export function getKcacHeaderIndexes(headers: string[]) {
  const map = headerMap(headers || []);
  return {
    participant: headerIdx(map, ["참가자번호", "참가자 번호", "Participant Number", "ParticipantNo", "Player Number", "PlayerNo"], -1),
    round: headerIdx(map, ["라운드", "Round"], 2),
    judge: headerIdx(map, ["심사위원명", "심사 위원명", "Judge Name", "JudgeName", "Judge"], 3),
    purpose: headerIdx(map, ["잔용도", "컵용도", "평가용도", "Purpose", "Cup Purpose"], -1),
    milk: headerIdx(map, ["우유명", "사용우유", "우유종류", "Milk", "Milk Product"], -1),
    subtotal: headerIdx(map, ["소계", "Subtotal"], -1),
    penalty: headerIdx(map, ["감점", "Penalty"], -1),
    timePenalty: headerIdx(map, ["시간감점", "시간 초과 감점", "Time Penalty", "timePenalty"], -1),
    leafPenalty: headerIdx(map, ["리프수감점", "리프 수 감점", "Leaf Penalty", "leafPenalty"], -1),
    leafCount: headerIdx(map, ["리프수", "리프 수", "잎수", "Leaf Count", "leafCount"], -1),
    patternType: headerIdx(map, ["패턴종류", "패턴 종류", "Pattern Type", "patternType"], -1),
    finalScore: headerIdx(map, ["최종점수", "Final Score", "FinalScore", "총점", "Total"], -1),
    disqualified: headerIdx(map, ["실격여부", "DQ", "Disqualified"], -1),
    disqualificationReason: headerIdx(map, ["실격사유", "실격이유", "DQ Reason", "Disqualification Reason"], -1)
  };
}

export function kcacScoreWeightForHeader(header: unknown): number {
  const h = safeStr(header).toLowerCase();
  if (!h) return 0;
  if (h.includes("예선") || h.includes("qual") || h.includes("prelim")) {
    if (h.includes("pattern completion")) return 20;
    if (h.includes("pattern balance") || h.includes("pattern symmetry")) return 10;
    if (h.includes("surface quality")) return 5;
    if (h.includes("position & proportion") || h.includes("position and proportion")) return 5;
    if (h.includes("line clarity") || h.includes("pattern definition")) return 10;
  }
  if (h.includes("theme expression")) return 10;
  if (h.includes("design completion")) return 20;
  if (h.includes("surface quality")) return 5;
  if (h.includes("position & symmetry") || h.includes("position and symmetry")) return 5;
  if (h.includes("workflow") || h.includes("technical execution")) return 10;
  if (h.includes("cleanliness")) return 10;
  if (h.includes("taste balance")) return 10;
  if (h.includes("mouthfeel") || h.includes("texture")) return 5;
  if (h.includes("presentation")) return 5;
  return 0;
}

export function kcacRowHasDq(headers: string[], row: Row, idx = getKcacHeaderIndexes(headers)) {
  if (idx.penalty >= 0 && Number(row[idx.penalty]) >= 999) return true;
  if (idx.timePenalty >= 0 && Number(row[idx.timePenalty]) >= 999) return true;
  if (idx.disqualified >= 0 && isDisqualifiedValue(row[idx.disqualified])) return true;
  return false;
}

export function kcacRowsSameScoreGroup(idx: ReturnType<typeof getKcacHeaderIndexes>, baseRow: Row, row: Row): boolean {
  if (!idx || idx.participant < 0) return false;
  const baseParticipant = safeStr(baseRow[idx.participant]);
  if (!baseParticipant) return false;
  if (safeStr(row[idx.participant]) !== baseParticipant) return false;
  if (idx.round >= 0 && safeStr(row[idx.round]) !== safeStr(baseRow[idx.round])) return false;
  return true;
}

export function recalcKcacTotalInRow(headers: string[], row: Row, forceDq = false) {
  const idx = getKcacHeaderIndexes(headers || []);
  let subtotal = 0;
  for (let i = 0; i < headers.length; i++) {
    const weight = kcacScoreWeightForHeader(headers[i]);
    if (!weight) continue;
    const raw = row[i];
    if (raw === "" || raw == null) continue;
    const score = Number(raw);
    if (Number.isNaN(score)) continue;
    subtotal += (score / 5) * weight;
  }
  subtotal = roundTotal(subtotal);

  const savedPenalty = idx.penalty >= 0 ? Number(row[idx.penalty]) || 0 : 0;
  const timePenalty = idx.timePenalty >= 0 ? Number(row[idx.timePenalty]) || 0 : 0;
  const leafPenalty = idx.leafPenalty >= 0 ? Number(row[idx.leafPenalty]) || 0 : 0;
  const hasSplitPenalty = (idx.timePenalty >= 0 && safeStr(row[idx.timePenalty]) !== "") ||
    (idx.leafPenalty >= 0 && safeStr(row[idx.leafPenalty]) !== "");
  const penalty = hasSplitPenalty ? (timePenalty >= 999 ? 999 : timePenalty + leafPenalty) : savedPenalty;
  if (idx.penalty >= 0) {
    while (row.length <= idx.penalty) row.push("");
    row[idx.penalty] = penalty;
  }

  const isDq = !!forceDq || kcacRowHasDq(headers, row, idx) || penalty >= 999;
  const finalScore = roundTotal(isDq ? 0 : Math.max(0, subtotal - penalty));
  if (idx.subtotal >= 0) {
    while (row.length <= idx.subtotal) row.push("");
    row[idx.subtotal] = subtotal;
  }
  if (idx.finalScore >= 0) {
    while (row.length <= idx.finalScore) row.push("");
    row[idx.finalScore] = finalScore;
  }
  if (idx.disqualified >= 0) {
    while (row.length <= idx.disqualified) row.push("");
    row[idx.disqualified] = isDq ? "Y" : "N";
  }
  if (idx.disqualificationReason >= 0) {
    while (row.length <= idx.disqualificationReason) row.push("");
    if (isDq && !safeStr(row[idx.disqualificationReason])) row[idx.disqualificationReason] = (timePenalty >= 999 || savedPenalty >= 999) ? "시간 초과" : "실격";
    if (!isDq && safeStr(row[idx.disqualificationReason]) === "시간 초과") row[idx.disqualificationReason] = "";
  }
  return { subtotal, finalScore, disqualified: isDq, penalty };
}

export function recalcKcacGroupRows(headers: string[], rows: Row[], targetIndex = 0): number {
  const idx = getKcacHeaderIndexes(headers || []);
  const targetRow = rows[targetIndex];
  if (!targetRow) return 0;
  let groupDq = kcacRowHasDq(headers, targetRow, idx);
  const groupRows = rows.filter((row) => kcacRowsSameScoreGroup(idx, targetRow, row));
  groupRows.forEach((row) => {
    if (kcacRowHasDq(headers, row, idx)) groupDq = true;
  });
  groupRows.forEach((row) => recalcKcacTotalInRow(headers, row, groupDq));
  return groupRows.length;
}
