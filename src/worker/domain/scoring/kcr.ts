import { headerIdx, headerIdxFirstFilled, headerMap, num, roundTotal, Row } from "./common";

export function kcrSweetnessScoreHeaderNames(): string[] {
  return [
    "Sweetness(스위트니스) ×2", "Sweetness(스위트니스) x2", "Sweetness(스위트니스)",
    "Sweetness(스윗니스) ×2", "Sweetness(스윗니스) x2", "Sweetness(스윗니스)",
    "Sweetness", "스위트니스", "스윗니스", "단맛"
  ];
}

export function recalcKcrTotalInRow(headers: string[], row: Row): number | null {
  const map = headerMap(headers || []);
  const fields = [
    { names: ["Flavor(플레이버)", "Flavor"], weight: 1 },
    { names: ["Aftertaste(에프터테이스트)", "Aftertaste"], weight: 1 },
    { names: ["Acidity(산미)", "Acidity"], weight: 1 },
    { names: ["Body(바디)", "Body"], weight: 1 },
    { names: kcrSweetnessScoreHeaderNames(), weight: 2 },
    { names: ["Overall(주관적 종합평가)", "Overall"], weight: 1 }
  ];
  let total = 0;
  fields.forEach((field) => {
    const idx = headerIdxFirstFilled(headers, row, field.names, -1);
    if (idx >= 0 && idx < row.length && String(row[idx] ?? "").trim() !== "") total += num(row[idx]) * field.weight;
  });
  total = roundTotal(total);
  const totalIdx = headerIdx(map, ["총점", "Total"], -1);
  if (totalIdx >= 0) {
    while (row.length <= totalIdx) row.push("");
    row[totalIdx] = total;
  }
  return total;
}
