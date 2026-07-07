import { elapsedSecondsFromValue, elapsedTimeText } from "../../utils/time";
import { safeStr } from "../../utils/validation";

export type Row = unknown[];

export function num(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isNaN(value) ? 0 : value;
  const n = Number(safeStr(value).replace(/,/g, "").replace(/점/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

export function headerMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = safeStr(h).replace(/\s/g, "").toLowerCase();
    if (key) map[key] = i;
  });
  return map;
}

export function headerIdx(map: Record<string, number>, names: string[], fallback = -1): number {
  for (const name of names) {
    const key = safeStr(name).replace(/\s/g, "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  }
  return fallback;
}

export function headerIdxFirstFilled(headers: string[], row: Row, names: string[], fallback = -1): number {
  const map = headerMap(headers || []);
  let first = -1;
  for (const name of names || []) {
    const idx = headerIdx(map, [name], -1);
    if (idx < 0) continue;
    if (first < 0) first = idx;
    if (idx < (row || []).length && safeStr(row[idx]) !== "") return idx;
  }
  return first >= 0 ? first : fallback;
}

export function normHeader(h: unknown): string {
  return safeStr(h).replace(/\s/g, "").replace(/[()[\]{}·_\-/]/g, "").toLowerCase();
}

export function headerMatches(h: unknown, names: string[]): boolean {
  const nh = normHeader(h);
  return names.some((name) => {
    const n = normHeader(name);
    return !!n && nh.includes(n);
  });
}

export function shouldSkipScoreAggregateHeader(h: unknown): boolean {
  const nh = normHeader(h);
  return /코멘트|comment|사유|reason|상태|status|서명|signature|시간|time|확인|검수/.test(nh);
}

export function rowScoreSum(headers: string[], row: Row, names: string[]): number {
  let sum = 0;
  headers.forEach((h, i) => {
    if (!shouldSkipScoreAggregateHeader(h) && headerMatches(h, names)) sum += num(row[i]);
  });
  return Math.round(sum * 1000) / 1000;
}

export function rowScoreFirst(headers: string[], row: Row, names: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (!shouldSkipScoreAggregateHeader(headers[i]) && headerMatches(headers[i], names)) return num(row[i]);
  }
  return 0;
}

export function rowScoreExactHeaders(headers: string[], row: Row, names: string[]): number {
  const map = headerMap(headers || []);
  let sum = 0;
  for (const name of names || []) {
    const idx = headerIdx(map, [name], -1);
    if (idx >= 0 && idx < row.length) sum += num(row[idx]);
  }
  return Math.round(sum * 1000) / 1000;
}

export function roundScore02(n: unknown): number | "" {
  const v = Number(n);
  if (Number.isNaN(v)) return "";
  return Number((Math.round(v * 5 + 1e-8) / 5).toFixed(2));
}

export function roundTotal(n: unknown): number {
  let v = Number(n);
  if (Number.isNaN(v)) v = 0;
  return Number((Math.round(v * 5 + 1e-8) / 5).toFixed(2));
}

export function roundAverageScore(n: unknown): number {
  let v = Number(n);
  if (Number.isNaN(v)) v = 0;
  return Number((Math.round(v * 100 + 1e-8) / 100).toFixed(2));
}

export function addScores(a: unknown, b: unknown): number {
  return roundTotal(roundTotal(a) + roundTotal(b));
}

export function scoreText(value: unknown, digits = 2): string {
  const n = Number(value);
  if (Number.isNaN(n)) return safeStr(value);
  return n.toFixed(digits).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export function normalizeRoundName(round: unknown, fallback = "결과"): string {
  const r = safeStr(round || fallback || "결과");
  if (r.includes("예선")) return "예선";
  if (r.includes("본선")) return "본선";
  if (r.includes("결선")) return "결선";
  if (/8강|4강|준결|결승|1\s*[·.,/-]?\s*2위전|3\s*[·.,/-]?\s*4위전|토너먼트|tournament/i.test(r)) return "결선";
  return r || "결과";
}

export function normalizeKcacRoundName(round: unknown, fallback = ""): string {
  const raw = safeStr(round || fallback || "");
  if (/결선|본선|본\/?결선|final|main/i.test(raw)) return "결선";
  return "예선";
}

export function normalizeCompetitionRound(competitionCode: unknown, round: unknown, fallback = "예선"): string {
  const code = safeStr(competitionCode).toUpperCase();
  const raw = safeStr(round || fallback || "");
  const value = raw || safeStr(fallback) || "예선";
  if (/예선|\?덉꽑|qual|prelim/i.test(value)) return "예선";
  if (code === "KCAC") {
    return /결선|본선|본\/?결선|寃곗꽑|蹂몄꽑|final|main/i.test(value) ? "결선" : "예선";
  }
  if (code === "KTCC") return "결선";
  if (code === "KCR" || code === "IKRC" || code === "MOB") {
    return /결선|본선|寃곗꽑|蹂몄꽑|final|main|토너먼트|tournament|8강|4강|준결|결승/i.test(value) ? "결선" : "예선";
  }
  if (/본선|蹂몄꽑|main/i.test(value)) return "본선";
  if (/결선|寃곗꽑|final|토너먼트|tournament|8강|4강|준결|결승/i.test(value)) return "결선";
  return value;
}

export function isMainOrFinalRound(round: unknown): boolean {
  const raw = safeStr(round || "");
  return /본선|결선|蹂몄꽑|寃곗꽑|main|final/i.test(raw);
}

export function isTimeHeader(h: unknown): boolean {
  return /종료시간|경기시간|소요시간|시연시간/i.test(safeStr(h));
}

export function rowTimeSeconds(headers: string[], row: Row): number {
  const names = ["경기시간", "종료시간", "소요시간", "시연시간", "제출시간초"];
  for (let i = 0; i < headers.length; i++) {
    if (!headerMatches(headers[i], names)) continue;
    const sec = elapsedSecondsFromValue(row[i]);
    if (sec != null) return sec;
  }
  return 999999;
}

export function elapsedTextForCell(value: unknown): string {
  return elapsedTimeText(value);
}

export function isDisqualifiedValue(value: unknown): boolean {
  const s = safeStr(value).replace(/\s/g, "").toLowerCase();
  if (!s) return false;
  return s === "실격" || s === "dq" || s === "disqualified" || s === "disqualify" ||
    s === "true" || s === "y" || s === "yes" || s === "1" || s === "x";
}

export function getDisqualificationHeaderIndexes(headers: string[]) {
  const map = headerMap(headers || []);
  return {
    dq: headerIdx(map, ["실격여부", "DQ", "Disqualified"], -1),
    reason: headerIdx(map, ["실격사유", "실격이유", "DQ Reason", "Disqualification Reason"], -1)
  };
}

export function getDisqualificationInfo(headers: string[], row: Row) {
  const info = { disqualified: false, reason: "" };
  for (let i = 0; i < headers.length; i++) {
    const h = safeStr(headers[i]);
    const v = row[i];
    const hv = h.replace(/\s/g, "").toLowerCase();
    if (/실격사유|실격이유|dqreason|disqualificationreason|disqualifiedreason/.test(hv)) {
      if (safeStr(v)) info.reason = safeStr(v);
      continue;
    }
    if (/실격여부|실격|dq|disqualified|disqualification/.test(hv)) {
      if (isDisqualifiedValue(v)) {
        info.disqualified = true;
        if (!info.reason && safeStr(v) && !/^(true|y|yes|1|x)$/i.test(safeStr(v))) info.reason = safeStr(v);
      }
    }
    if (/감점|페널티|penalty/i.test(h) && Number(v) >= 999) {
      info.disqualified = true;
      if (!info.reason) info.reason = "시간초과 또는 규정상 실격 감점";
    }
  }
  return info;
}

export function isCalibrationModeValue(value: unknown): boolean {
  const s = safeStr(value).replace(/\s/g, "").toLowerCase();
  return /켈리브레이션|캘리브레이션|calibration|calib/.test(s);
}

export function isHeadRoleValue(value: unknown): boolean {
  return /헤드|head/i.test(safeStr(value));
}

export function rowHasData(row: Row): boolean {
  return (row || []).some((v) => safeStr(v) !== "");
}
