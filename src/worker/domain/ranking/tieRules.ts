import { formatSeconds } from "../../utils/time";
import { safeStr } from "../../utils/validation";
import {
  headerIdx,
  headerMap,
  isCalibrationModeValue,
  isHeadRoleValue,
  normalizeCompetitionRound,
  rowScoreExactHeaders,
  rowScoreFirst,
  rowScoreSum,
  rowTimeSeconds,
  Row
} from "../scoring/common";
import { kbcEspressoScoreInRow } from "../scoring/kbc";
import { mobCreativeScoreHeaders, mobSensoryScoreHeaders, mobTechnicalScoreHeaders } from "../scoring/mob";

export type TieOrderItem = { key: string; dir: 1 | -1; label: string };
export type TieRule = { label: string; order: TieOrderItem[] };
export type RankingTie = Record<string, number>;

export function getTieRule(competitionCode: string, round?: unknown): TieRule {
  const code = safeStr(competitionCode).toUpperCase();
  const r = normalizeCompetitionRound(code, round, "");
  if (code === "KCR") return { label: "총점 → 스위트니스 → 오버롤", order: [{ key: "sweetness", dir: -1, label: "스위트니스" }, { key: "overall", dir: -1, label: "오버롤" }] };
  if (code === "IKRC") return { label: "총점 → Flavor(플레이버) → Sweetness(스윗니스) → Mouthfeel(마우스필)", order: [{ key: "flavor", dir: -1, label: "Flavor(플레이버)" }, { key: "sweetness", dir: -1, label: "Sweetness(스윗니스)" }, { key: "mouthfeel", dir: -1, label: "Mouthfeel(마우스필)" }] };
  if (code === "KCAC") {
    if (r === "결선") return { label: "총점 → 센서리 합산 → 프레젠테이션 → 패턴/디자인완성도 → 경기시간", order: [{ key: "sensory", dir: -1, label: "센서리 합산" }, { key: "presentation", dir: -1, label: "프레젠테이션" }, { key: "patternCompletion", dir: -1, label: "패턴/디자인완성도" }, { key: "time", dir: 1, label: "경기시간" }] };
    return { label: "총점 → 패턴완성도 합산 → 패턴균형 합산 → 경기시간", order: [{ key: "patternCompletion", dir: -1, label: "패턴완성도 합산" }, { key: "patternBalance", dir: -1, label: "패턴균형 합산" }, { key: "time", dir: 1, label: "경기시간" }] };
  }
  if (code === "MOB") {
    if (r === "본선" || r === "결선") return { label: "총점 → 센서리 → 테크니컬 → 창작음료 → 경기시간", order: [{ key: "sensory", dir: -1, label: "센서리" }, { key: "technical", dir: -1, label: "테크니컬" }, { key: "creative", dir: -1, label: "창작음료" }, { key: "time", dir: 1, label: "경기시간" }] };
    return { label: "총점 → 센서리 → 테크니컬 → 경기시간", order: [{ key: "sensory", dir: -1, label: "센서리" }, { key: "technical", dir: -1, label: "테크니컬" }, { key: "time", dir: 1, label: "경기시간" }] };
  }
  if (code === "MOC" || code === "KTCC") return { label: "총점 → 종료시간", order: [{ key: "time", dir: 1, label: "종료시간" }] };
  if (code === "KBC") return { label: "총점 평균 → 에스프레소 점수 평균", order: [{ key: "espresso", dir: -1, label: "에스프레소 점수 평균" }] };
  return { label: "총점", order: [] };
}

function addTie(group: { tie?: RankingTie }, key: string, value: unknown) {
  if (!group.tie) group.tie = {};
  if (group.tie[key] == null) group.tie[key] = 0;
  group.tie[key] += Number(value) || 0;
  group.tie[key] = Math.round(group.tie[key] * 1000) / 1000;
}

function setMinTie(group: { tie?: RankingTie }, key: string, value: unknown) {
  if (!group.tie) group.tie = {};
  const val = Number(value) || 0;
  if (group.tie[key] == null || val < group.tie[key]) group.tie[key] = val;
}

export function accumulateTieBreaks(group: { tie?: RankingTie }, headers: string[], row: Row, competitionCode: string, round?: unknown, _totalVal?: unknown) {
  const code = safeStr(competitionCode).toUpperCase();
  const r = normalizeCompetitionRound(code, round, "");
  if (code === "KCR") {
    addTie(group, "sweetness", rowScoreFirst(headers, row, ["스위트니스", "스윗니스", "단맛", "Sweetness"]));
    addTie(group, "overall", rowScoreFirst(headers, row, ["오버롤", "Overall"]));
  } else if (code === "IKRC") {
    addTie(group, "flavor", rowScoreFirst(headers, row, ["Flavor(플레이버)", "Flavor", "플레이버", "향미"]));
    addTie(group, "sweetness", rowScoreFirst(headers, row, ["Sweetness(스윗니스)", "Sweetness", "스위트니스", "스윗니스", "단맛"]));
    addTie(group, "mouthfeel", rowScoreFirst(headers, row, ["Mouthfeel(마우스필)", "Mouthfeel(질감)", "Mouthfeel", "마우스필", "촉감", "질감"]));
  } else if (code === "KCAC") {
    if (r === "결선") {
      addTie(group, "sensory", rowScoreSum(headers, row, ["맛의균형", "질감", "촉감", "Texture", "Mouthfeel", "TasteBalance", "센서리"]));
      addTie(group, "presentation", rowScoreSum(headers, row, ["프레젠테이션", "Presentation"]));
      addTie(group, "patternCompletion", rowScoreSum(headers, row, ["디자인완성도", "DesignCompletion", "패턴완성도", "PatternCompletion"]));
    } else {
      addTie(group, "patternCompletion", rowScoreSum(headers, row, ["패턴완성도", "PatternCompletion"]));
      addTie(group, "patternBalance", rowScoreSum(headers, row, ["패턴균형", "PatternBalance", "PatternSymmetry", "Balance"]));
    }
    setMinTie(group, "time", rowTimeSeconds(headers, row));
  } else if (code === "MOB") {
    addTie(group, "sensory", rowScoreExactHeaders(headers, row, mobSensoryScoreHeaders()));
    addTie(group, "technical", rowScoreExactHeaders(headers, row, mobTechnicalScoreHeaders()));
    addTie(group, "creative", rowScoreExactHeaders(headers, row, mobCreativeScoreHeaders()));
    setMinTie(group, "time", rowTimeSeconds(headers, row));
  } else if (code === "KBC") {
    addTie(group, "espresso", kbcEspressoScoreInRow(headers, row));
  } else if (code === "MOC" || code === "KTCC") {
    setMinTie(group, "time", rowTimeSeconds(headers, row));
  }
}

export function competitionUsesAverageRanking(competitionCode: string): boolean {
  const code = safeStr(competitionCode).toUpperCase();
  return code === "KBC" || code === "IKRC";
}

export function shouldCountRowInRanking(competitionCode: string, headers: string[], row: Row): boolean {
  const code = safeStr(competitionCode).toUpperCase();
  const map = headerMap(headers || []);
  const modeIdx = headerIdx(map, ["모드", "Mode"], 6);
  const roleIdx = headerIdx(map, ["역할", "Role"], 5);
  const mode = modeIdx >= 0 ? row[modeIdx] : "";
  const role = roleIdx >= 0 ? row[roleIdx] : "";
  if (isCalibrationModeValue(mode)) return false;
  if ((code === "IKRC" || code === "MOB") && isHeadRoleValue(role)) return false;
  return true;
}

export function tieBreakSummary(tie: RankingTie | undefined, competitionCode: string, round?: unknown): string {
  const rule = getTieRule(competitionCode, round);
  const parts: string[] = [];
  for (const o of rule.order || []) {
    const v = tie && tie[o.key] != null ? tie[o.key] : "";
    if (v === "" || v === 999999) continue;
    parts.push(`${o.label} ${typeof v === "number" ? Math.round(v * 100) / 100 : v}`);
  }
  return parts.join(" · ");
}

export { formatSeconds };
