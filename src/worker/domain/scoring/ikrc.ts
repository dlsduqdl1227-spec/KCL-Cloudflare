import { safeStr } from "../../utils/validation";
import { headerIdx, headerMap, normalizeRoundName, num, roundTotal, Row } from "./common";

export function getIkrcHeaderIndexes(headers: string[]) {
  const map = headerMap(headers || []);
  return {
    round: headerIdx(map, ["라운드", "Round"], 2),
    sampleNo: headerIdx(map, ["샘플번호", "SampleNo", "Sample No"], -1),
    flavor: headerIdx(map, ["Flavor(플레이버) ×3", "Flavor(플레이버)", "Flavor"], -1),
    cleanCup: headerIdx(map, ["Clean Cup(클린컵) ×2", "Clean Cup(클린컵)", "Clean Cup"], -1),
    sweetness: headerIdx(map, ["Sweetness(스윗니스) ×2", "Sweetness(스윗니스)", "Sweetness"], -1),
    acidity: headerIdx(map, ["Acidity(산미)", "Acidity"], -1),
    mouthfeel: headerIdx(map, ["Mouthfeel(마우스필) ×2", "Mouthfeel(마우스필)", "Mouthfeel"], -1),
    total: headerIdx(map, ["총점", "Total"], -1),
    status: headerIdx(map, ["검수상태", "ReviewStatus", "Status"], -1),
    seedBonus: headerIdx(map, ["Seed to Cup 가산점", "Seed Bonus", "SeedToCupBonus"], -1),
    finalScore: headerIdx(map, ["최종점수", "Final Score", "FinalScore"], -1)
  };
}

export function normalizeIkrcSampleNo(value: unknown): string {
  let s = safeStr(value).toUpperCase();
  if (!s) return "";
  s = s.replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const m = s.match(/^([A-Z]+)-?0*(\d+)$/i);
  if (m) return `${m[1].toUpperCase()}-${parseInt(m[2], 10)}`;
  if (/^0*\d+$/.test(s)) return String(parseInt(s, 10));
  return s;
}

export function normalizeIkrcSeedBonus(value: unknown): number {
  const n = Number(safeStr(value).replace(/점|\+/g, "").trim());
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(3, Math.round(n)));
}

export function ikrcSeedBonusFromRow(headers: string[], row: Row): number {
  const idx = getIkrcHeaderIndexes(headers || []);
  const ikrcRound = idx.round >= 0 ? normalizeRoundName(row[idx.round], "") : "";
  if (ikrcRound !== "결선") return 0;
  return idx.seedBonus >= 0 ? normalizeIkrcSeedBonus(row[idx.seedBonus]) : 0;
}

export function recalcIkrcWeightedTotalInRow(headers: string[], row: Row): number | null {
  const idx = getIkrcHeaderIndexes(headers || []);
  const required = [idx.flavor, idx.cleanCup, idx.sweetness, idx.acidity, idx.mouthfeel, idx.total];
  if (required.some((i) => i == null || i < 0)) return null;
  const total = roundTotal(
    num(row[idx.flavor]) * 3 +
    num(row[idx.cleanCup]) * 2 +
    num(row[idx.sweetness]) * 2 +
    num(row[idx.acidity]) +
    num(row[idx.mouthfeel]) * 2
  );
  row[idx.total] = total;
  const ikrcRound = idx.round >= 0 ? normalizeRoundName(row[idx.round], "") : "";
  const seedBonus = ikrcRound === "결선" && idx.seedBonus >= 0 ? normalizeIkrcSeedBonus(row[idx.seedBonus]) : 0;
  if (idx.seedBonus >= 0) {
    while (row.length <= idx.seedBonus) row.push("");
    row[idx.seedBonus] = seedBonus || "";
  }
  if (idx.finalScore >= 0) {
    while (row.length <= idx.finalScore) row.push("");
    row[idx.finalScore] = roundTotal(total + seedBonus);
  }
  return total;
}
