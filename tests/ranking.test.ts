import { describe, expect, it } from "vitest";
import { latestRankingSubmissionRows } from "../src/worker/domain/ranking/buildRanking";
import { compareRankingRows } from "../src/worker/domain/ranking/compareRankingRows";

describe("ranking", () => {
  it("keeps only latest submission by unit, round, judge and role", () => {
    const headers = ["제출시간", "대회코드", "라운드", "심사위원명", "팀", "역할", "모드", "참가자번호", "총점"];
    const data: any[][] = [
      headers,
      ["2026-01-01T00:00:00Z", "KCR", "예선", "A", "1팀", "센서리", "judge", "101", 10],
      ["2026-01-01T00:01:00Z", "KCR", "예선", "A", "1팀", "센서리", "judge", "101", 11]
    ];
    const latest = latestRankingSubmissionRows("KCR", headers, data, { idx: 7, label: "참가자번호" }, 2, "예선");
    expect(Object.values(latest)[0].rowIndex).toBe(2);
  });

  it("orders disqualified rows after qualified rows", () => {
    const rows = [
      { unit: "1", round: "예선", totalScore: 100, disqualified: true },
      { unit: "2", round: "예선", totalScore: 10, disqualified: false }
    ];
    rows.sort((a, b) => compareRankingRows(a, b, "KCR"));
    expect(rows[0].unit).toBe("2");
  });

  it("applies tie break rules", () => {
    const rows = [
      { unit: "1", round: "예선", totalScore: 10, tie: { sweetness: 3 } },
      { unit: "2", round: "예선", totalScore: 10, tie: { sweetness: 4 } }
    ];
    rows.sort((a, b) => compareRankingRows(a, b, "KCR"));
    expect(rows[0].unit).toBe("2");
  });
});
