import { describe, expect, it } from "vitest";
import { normalizeCompetitionRound, roundScore02, roundTotal } from "../src/worker/domain/scoring/common";
import { kbcIsTimeDisqualifiedBySeconds, kbcTimePenaltyPointsFromSeconds } from "../src/worker/domain/scoring/kbc";
import { mobIsTimeDisqualifiedBySeconds, mobTimePenaltyPointsFromSeconds } from "../src/worker/domain/scoring/mob";
import { recalcMocTotalInRow } from "../src/worker/domain/scoring/moc";
import { recalcKtccTotalInRow } from "../src/worker/domain/scoring/ktcc";

describe("scoring", () => {
  it("rounds score values to 0.2 increments", () => {
    expect(roundScore02(3.31)).toBe(3.4);
    expect(roundScore02(3.29)).toBe(3.2);
    expect(roundTotal(7.91)).toBe(8);
  });

  it("calculates KBC time penalty and disqualification", () => {
    expect(kbcTimePenaltyPointsFromSeconds(420, "예선")).toBe(0);
    expect(kbcTimePenaltyPointsFromSeconds(421, "예선")).toBe(1);
    expect(kbcTimePenaltyPointsFromSeconds(426, "예선")).toBe(2);
    expect(kbcIsTimeDisqualifiedBySeconds(480, "예선")).toBe(true);
    expect(kbcTimePenaltyPointsFromSeconds(600, "본선")).toBe(0);
    expect(kbcTimePenaltyPointsFromSeconds(601, "결선")).toBe(1);
    expect(kbcIsTimeDisqualifiedBySeconds(660, "결선")).toBe(true);
  });

  it("calculates MOB time penalty and disqualification", () => {
    expect(mobTimePenaltyPointsFromSeconds(600, "예선")).toBe(0);
    expect(mobTimePenaltyPointsFromSeconds(601, "예선")).toBe(6);
    expect(mobTimePenaltyPointsFromSeconds(616, "예선")).toBe(24);
    expect(mobTimePenaltyPointsFromSeconds(631, "예선")).toBe(40);
    expect(mobIsTimeDisqualifiedBySeconds(661, "예선")).toBe(true);
    expect(mobTimePenaltyPointsFromSeconds(900, "결선")).toBe(0);
    expect(mobTimePenaltyPointsFromSeconds(901, "결선")).toBe(6);
  });

  it("normalizes competition rounds by rulebook phase structure", () => {
    expect(normalizeCompetitionRound("MOB", "본선", "예선")).toBe("결선");
    expect(normalizeCompetitionRound("KCAC", "본선", "예선")).toBe("결선");
    expect(normalizeCompetitionRound("KBC", "본선", "예선")).toBe("본선");
    expect(normalizeCompetitionRound("MOC", "", "예선")).toBe("예선");
  });

  it("calculates MOC bonus and time disqualification", () => {
    const headers = ["제출시간", "대회코드", "라운드", "심사위원명", "팀", "역할", "모드", "참가자번호", "평가구분", "정답수", "가산점", "총점", "종료시간", "실격여부", "실격사유"];
    const row: any[] = ["", "MOC", "예선", "", "", "", "", "1", "S1", 4, 3, "", "04:59", "", ""];
    expect(recalcMocTotalInRow(headers, row, "예선")).toBe(5);
    expect(row[10]).toBe(1);
    const mainRow: any[] = ["", "MOC", "본선", "", "", "", "", "2", "S1", 4, 3, "", "05:59", "", ""];
    expect(recalcMocTotalInRow(headers, mainRow, "본선")).toBe(7);
    expect(mainRow[10]).toBe(3);
    row[12] = "05:01";
    recalcMocTotalInRow(headers, row, "예선");
    expect(row[13]).toBe("Y");
    expect(row[14]).toBe("시간 초과");
  });

  it("calculates KTCC bonus and disqualification", () => {
    const headers = ["제출시간", "대회코드", "라운드", "심사위원명", "팀", "역할", "모드", "팀번호", "팀명", "Section1 정답수", "Section2 정답수", "Section3 정답수", "Section3 가산점", "총점", "종료시간", "실격여부", "실격사유"];
    const row: any[] = ["", "KTCC", "예선", "", "", "", "", "1", "A", 2, 1, 2, "", "", "07:59", "", ""];
    expect(recalcKtccTotalInRow(headers, row)).toBe(7);
    expect(row[12]).toBe(2);
    row[14] = "08:01";
    expect(recalcKtccTotalInRow(headers, row)).toBe("");
    expect(row[15]).toBe("Y");
  });
});
