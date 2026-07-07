import { safeStr } from "../../utils/validation";
import { elapsedSecondsFromValue, elapsedTimeText } from "../../utils/time";
import { headerIdx, headerMap, isDisqualifiedValue, roundTotal, Row } from "./common";
import { ktccIsTimeDisqualifiedByRow } from "./kbc";

export function getKtccHeaderIndexes(headers: string[]) {
  const map = headerMap(headers || []);
  return {
    s1: headerIdx(map, ["Section1 정답수", "섹션1 정답수", "S1 정답수"], -1),
    s2: headerIdx(map, ["Section2 정답수", "섹션2 정답수", "S2 정답수"], -1),
    s3: headerIdx(map, ["Section3 정답수", "섹션3 정답수", "S3 정답수"], -1),
    bonus: headerIdx(map, ["Section3 가산점", "가산점", "보너스", "Bonus"], -1),
    total: headerIdx(map, ["총점", "최종점수", "Total"], -1),
    endTime: headerIdx(map, ["종료시간", "경기시간", "소요시간", "시연시간"], -1),
    disqualified: headerIdx(map, ["실격여부", "DQ", "Disqualified"], -1),
    disqualificationReason: headerIdx(map, ["실격사유", "실격이유", "DQ Reason", "Disqualification Reason"], -1)
  };
}

export function ktccValueLooksElapsed(value: unknown): boolean {
  const t = safeStr(value);
  if (!t) return false;
  if (/^(18\d{2}|19\d{2}|1900)-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t)) return true;
  if (/\d+\s*분\s*\d*(?:\.\d+)?\s*초/.test(t)) return true;
  if (/^\d+\s*:\s*\d{1,2}(?:\.\d+)?(?:\s*:\s*\d{1,2}(?:\.\d+)?)?$/.test(t)) return true;
  if (elapsedSecondsFromValue(t) != null && !/^\d(\.\d+)?$/.test(t)) return true;
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (!Number.isNaN(n) && n > 0 && n < 1) return true;
    if (!Number.isNaN(n) && Math.abs(n) > 86400) return true;
  }
  return false;
}

export function ktccIsCountHeader(h: unknown): boolean {
  return /Section\s*[123].*정답수|Section[123].*정답수|섹션\s*[123].*정답수|섹션[123].*정답수|정답수/i.test(safeStr(h));
}

export function ktccSelectedCupCountFromText(value: unknown): number {
  const s = safeStr(value);
  if (!s) return 0;
  const countMatch = s.match(/(?:정답\s*)?([0-2])\s*개/);
  if (countMatch) return Math.max(0, Math.min(2, Number(countMatch[1]) || 0));
  const cupMatches = s.match(/Cup\s*\d+|컵\s*\d+|\b\d+\b/gi);
  if (!cupMatches) return 0;
  return Math.max(0, Math.min(2, cupMatches.length));
}

export function ktccNormalizeAnswerCount(value: unknown, selectionText = ""): number {
  if (ktccValueLooksElapsed(value)) return ktccSelectedCupCountFromText(selectionText);
  const raw = safeStr(value).replace(/개/g, "").trim();
  if (!raw) return ktccSelectedCupCountFromText(selectionText);
  const n = Number(raw);
  if (Number.isNaN(n)) return ktccSelectedCupCountFromText(selectionText);
  if (Math.abs(n) > 2) return ktccSelectedCupCountFromText(selectionText);
  return Math.max(0, Math.min(2, Math.round(n)));
}

export function ktccRuleBasedAnswerCount(value: unknown, selectionText = ""): number {
  return ktccNormalizeAnswerCount(value, selectionText);
}

export function ktccNormalizeBonus(value: unknown, s3Count: unknown): number {
  const n = Number(safeStr(value).replace(/점|개/g, "").trim());
  if (Number.isNaN(n) || ktccValueLooksElapsed(value) || Math.abs(n) > 2) return Number(s3Count) === 2 ? 2 : 0;
  return Math.max(0, Math.min(2, Math.round(n)));
}

export function ktccNormalizeReviewRowForDisplay(headers: string[], row: Row): Row {
  const out = row.slice();
  const idx = getKtccHeaderIndexes(headers);
  if (idx.endTime >= 0 && ktccValueLooksElapsed(out[idx.endTime])) out[idx.endTime] = elapsedTimeText(out[idx.endTime]);
  return out;
}

export function recalcKtccTotalInRow(headers: string[], row: Row): number | "" | null {
  const idx = getKtccHeaderIndexes(headers);
  const isTimeDq = ktccIsTimeDisqualifiedByRow(headers, row, "KTCC");
  const manualDq = idx.disqualified >= 0 && idx.disqualified < row.length && isDisqualifiedValue(row[idx.disqualified]);
  const manualReason = idx.disqualificationReason >= 0 && idx.disqualificationReason < row.length ? safeStr(row[idx.disqualificationReason]) : "";
  const isDq = isTimeDq || manualDq;
  if (idx.disqualified >= 0 && idx.disqualified < row.length) row[idx.disqualified] = isDq ? "Y" : "N";
  if (idx.disqualificationReason >= 0 && idx.disqualificationReason < row.length) row[idx.disqualificationReason] = isDq ? (isTimeDq ? "시간 초과" : (manualReason || "실격")) : "";
  if (isDq) {
    if (idx.bonus >= 0 && idx.bonus < row.length) row[idx.bonus] = "";
    if (idx.total >= 0 && idx.total < row.length) row[idx.total] = "";
    return "";
  }
  const map = headerMap(headers || []);
  const s1Sel = headerIdx(map, ["Section1 선택컵", "Section 1 선택컵", "섹션1 선택컵", "S1 선택컵"], -1);
  const s2Sel = headerIdx(map, ["Section2 선택컵", "Section 2 선택컵", "섹션2 선택컵", "S2 선택컵"], -1);
  const s3Sel = headerIdx(map, ["Section3 선택컵", "Section 3 선택컵", "섹션3 선택컵", "S3 선택컵"], -1);
  const s1 = Math.max(0, Math.min(2, ktccRuleBasedAnswerCount(idx.s1 >= 0 ? row[idx.s1] : "", s1Sel >= 0 ? String(row[s1Sel] || "") : "")));
  const s2 = Math.max(0, Math.min(2, ktccRuleBasedAnswerCount(idx.s2 >= 0 ? row[idx.s2] : "", s2Sel >= 0 ? String(row[s2Sel] || "") : "")));
  const s3 = Math.max(0, Math.min(2, ktccRuleBasedAnswerCount(idx.s3 >= 0 ? row[idx.s3] : "", s3Sel >= 0 ? String(row[s3Sel] || "") : "")));
  if (idx.s1 >= 0) row[idx.s1] = s1;
  if (idx.s2 >= 0) row[idx.s2] = s2;
  if (idx.s3 >= 0) row[idx.s3] = s3;
  const bonus = s3 === 2 ? 2 : 0;
  if (idx.bonus >= 0 && idx.bonus < row.length) row[idx.bonus] = bonus;
  const total = roundTotal(s1 + s2 + s3 + bonus);
  if (idx.total >= 0 && idx.total < row.length) row[idx.total] = total;
  return total;
}
