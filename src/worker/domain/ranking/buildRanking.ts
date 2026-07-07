import { timeValue } from "../../utils/time";
import { safeStr } from "../../utils/validation";
import { headerIdx, headerMap, normalizeRoundName, rowHasData, Row } from "../scoring/common";
import { ktccNormalizeReviewRowForDisplay } from "../scoring/ktcc";
import { shouldCountRowInRanking } from "./tieRules";

export type UnitInfo = { unit: string; displayUnit?: string; rowNumber?: number };

export function rankingLatestSubmissionKey(competitionCode: string, _headers: string[], row: Row, unitInfo: UnitInfo, round: string): string {
  const code = safeStr(competitionCode).toUpperCase();
  if (code === "KCAC") return "";
  const unit = safeStr(unitInfo && unitInfo.unit);
  if (!unit) return "";
  const judge = safeStr(row && row[3]) || "심사위원";
  const role = safeStr(row && row[5]);
  return [unit, safeStr(round), judge, role].join("||");
}

export function getUnitColumnMeta(headers: string[]) {
  const possible = ["고유번호", "선수고유번호", "참가자번호", "선수번호", "PlayerID", "ParticipantID", "예선컵번호", "본선컵번호", "결선컵번호", "컵번호", "샘플번호", "팀번호"];
  let idx = 7;
  let label = "";
  for (const h of possible) {
    const found = headers.indexOf(h);
    if (found >= 0) {
      idx = found;
      label = h;
      break;
    }
  }
  return { idx, label: label || headers[7] || "식별자" };
}

export function rankingUnitInfoForRow(competitionCode: string, headers: string[], row: Row, rowNumber: number, unitMeta = getUnitColumnMeta(headers)): UnitInfo {
  const code = safeStr(competitionCode).toUpperCase();
  let unit = safeStr(row[unitMeta.idx]);
  if (code === "MOC") {
    const map = headerMap(headers || []);
    const participantIdx = headerIdx(map, ["참가자번호", "참가자 번호", "선수번호", "선수 번호", "ParticipantNo", "PlayerNo"], -1);
    if (participantIdx >= 0) unit = safeStr(row[participantIdx]);
    if (unit) return { unit, displayUnit: unit, rowNumber };
    return { unit: `__ROW__${rowNumber}`, displayUnit: `행${rowNumber}`, rowNumber };
  }
  return { unit, displayUnit: unit, rowNumber };
}

export function latestRankingSubmissionRows(
  competitionCode: string,
  headers: string[],
  data: Row[],
  unitMeta = getUnitColumnMeta(headers),
  roundIdx = 2,
  defaultRound = "본선"
): Record<string, { rowIndex: number; order: number }> {
  const latest: Record<string, { rowIndex: number; order: number }> = {};
  const code = safeStr(competitionCode).toUpperCase();
  if (code === "KCAC") return latest;
  for (let i = 1; i < (data || []).length; i++) {
    let row = data[i];
    if (!rowHasData(row)) continue;
    if (code === "KTCC") row = ktccNormalizeReviewRowForDisplay(headers, row);
    if (!shouldCountRowInRanking(competitionCode, headers, row)) continue;
    const unitInfo = rankingUnitInfoForRow(competitionCode, headers, row, i + 1, unitMeta);
    const round = normalizeRoundName(row[roundIdx], defaultRound || "본선");
    const key = rankingLatestSubmissionKey(competitionCode, headers, row, unitInfo, round);
    if (!key) continue;
    const order = timeValue(row[0]) || i;
    if (!latest[key] || order >= latest[key].order) latest[key] = { rowIndex: i, order };
  }
  return latest;
}
