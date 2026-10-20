import { describe, expect, it } from "vitest";
import { memberAttendance, memberStreak } from "./attendance";
import { shiftDate } from "../domain/attendance";
const now = new Date("2026-10-21T00:00:00Z");
const row = (date: string, visits = 1) => ({
  date,
  visits,
  watervisits: 0,
  bookings: 0,
});
const zeros = (start: string, length = 7) =>
  Array.from({ length }, (_, i) => row(shiftDate(start, i), 0));
describe("streak history", () => {
  it("uses older returned attendance beyond the three displayed weeks", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row(shiftDate("2026-10-19", -7 * i)),
    );
    expect(memberStreak(rows, now)).toEqual({ count: 12, exact: false });
    expect(memberAttendance(rows, now).weeks).toHaveLength(3);
  });
  it("stops at a missing week rather than bridging unknown history", () => {
    expect(memberStreak([row("2026-10-19"), row("2026-10-05")], now)).toEqual({
      count: 1,
      exact: false,
    });
  });
});
describe("real member attendance", () => {
  it("counts visits, not bookings or water visits, in NZ Monday weeks", () => {
    const s = memberAttendance(
      [
        { ...row("2026-10-19", 2), watervisits: 1, bookings: 3 },
        row("2026-10-20", 0),
        row("2026-10-21", 1),
      ],
      now,
    );
    expect(s.monday).toBe("2026-10-19");
    expect(s.weeks[0].total).toBe(3);
    expect(s.weeks[0].complete).toBe(true);
  });
  it("does not convert missing dates into zero or claim complete weekly totals", () => {
    const s = memberAttendance([row("2026-10-19")], now);
    expect(s.weeks[0].total).toBe(1);
    expect(s.weeks[0].complete).toBe(false);
    expect(s.weeks[0].days[1].visits).toBeNull();
    expect(s.weeks[0].hasRecords).toBe(true);
  });
  it("does not invent attendance or a zero streak when no dates are returned", () => {
    const s = memberAttendance([], now);
    expect(s.streak).toBeNull();
    expect(s.streakExact).toBe(false);
    expect(s.weeks[0].hasRecords).toBe(false);
  });
  it("counts consecutive confirmed weeks as a lower bound when history runs out", () => {
    const s = memberAttendance(
      [row("2026-10-19"), row("2026-10-12"), row("2026-10-05")],
      now,
    );
    expect(s.streak).toBe(3);
    expect(s.streakExact).toBe(false);
  });
  it("uses a fully covered missed week to establish an exact streak", () => {
    const s = memberAttendance(
      [row("2026-10-19"), ...zeros("2026-10-12")],
      now,
    );
    expect(s.streak).toBe(1);
    expect(s.streakExact).toBe(true);
  });
  it("does not erase last week's streak during an unfinished current week", () => {
    const s = memberAttendance(
      [...zeros("2026-10-19", 3), row("2026-10-12"), row("2026-10-05")],
      now,
    );
    expect(s.streak).toBe(2);
    expect(s.streakExact).toBe(false);
  });
  it("keeps an unknown current week unknown even if the preceding week was missed", () => {
    const s = memberAttendance(zeros("2026-10-12"), now);
    expect(s.streak).toBeNull();
    expect(s.streakExact).toBe(false);
  });
  it("distinguishes a confirmed zero from missing attendance", () => {
    const s = memberAttendance(
      [...zeros("2026-10-19", 3), ...zeros("2026-10-12")],
      now,
    );
    expect(s.streak).toBe(0);
    expect(s.streakExact).toBe(true);
    expect(s.weeks[0].complete).toBe(true);
  });
  it("ignores future dates and uses NZ dates when UTC is still Sunday", () => {
    const s = memberAttendance(
      [row("2026-10-19"), row("2026-10-22", 100)],
      now,
    );
    expect(s.weeks[0].total).toBe(1);
    const monday = memberAttendance(
      [row("2026-10-19")],
      new Date("2026-10-18T12:00:00Z"),
    );
    expect(monday.today).toBe("2026-10-19");
    expect(monday.monday).toBe("2026-10-19");
  });
});
