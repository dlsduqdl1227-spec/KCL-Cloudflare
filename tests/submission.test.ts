import { describe, expect, it } from "vitest";
import { disqualifiedFlag, findTotalCandidate } from "../src/worker/routes/scores";

describe("score submission helpers", () => {
  it("treats explicit non-disqualified values as false", () => {
    expect(disqualifiedFlag("N")).toBe(false);
    expect(disqualifiedFlag("false")).toBe(false);
    expect(disqualifiedFlag("정상")).toBe(false);
    expect(disqualifiedFlag("Y")).toBe(true);
    expect(disqualifiedFlag("실격")).toBe(true);
  });

  it("uses explicit total fields before scanning raw values", () => {
    expect(findTotalCandidate("MOB", ["12", "브루잉"], { "총점": 31.4 })).toBe(31.4);
    expect(findTotalCandidate("KBC", ["7"], { "최종점수": 42.2, "총점": 41 })).toBe(42.2);
  });

  it("does not mistake MOB time penalty for final score", () => {
    const mobData = [
      "7", "브루잉",
      1, 1, 1,
      2, 2, 2, 2, 2, 2,
      0, 0, 0, 0, 0,
      23.6, "comment", "N", "", "미검수",
      "", "", "", "", "", "", "", "", "", "", "", "", "", "",
      6, "10분 05초"
    ];
    expect(findTotalCandidate("MOB", mobData, {})).toBe(23.6);
  });

  it("uses fixed totals for MOC and KTCC before end-time values", () => {
    expect(findTotalCandidate("MOC", ["12", "S1+S2", 4, 1, 5, "04분 58초"], {})).toBe(5);
    expect(findTotalCandidate("KTCC", ["3", "팀3", "", "", 2, "", "", 2, "", "", 2, 8, "07분 50초"], {})).toBe(8);
  });
});
