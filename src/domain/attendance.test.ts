import { describe, expect, it } from "vitest";
import {
  attendanceStats,
  dateKey,
  weekKey,
  milestones,
  validateTarget,
} from "./attendance";
import type { AttendanceEvent, MemberProfile } from "./models";
const member: MemberProfile = {
  id: "one",
  firstName: "Test",
  lastName: "Member",
  initials: "TM",
  weeklyTarget: 3,
  historyComplete: true,
};
const events = (dates: string[]): AttendanceEvent[] =>
  dates.map((date, i) => ({
    id: String(i),
    memberId: "one",
    occurredAt: date,
  }));
const now = new Date("2026-10-17T00:00:00Z");
describe("New Zealand attendance", () => {
  it("uses NZ midnight and Monday boundaries including daylight saving", () => {
    expect(dateKey("2026-10-11T11:30:00Z")).toBe("2026-10-12");
    expect(weekKey(dateKey("2026-10-11T11:30:00Z"))).toBe("2026-10-12");
    expect(dateKey("2026-07-05T12:30:00Z")).toBe("2026-07-06");
    expect(weekKey("2026-09-27")).toBe("2026-09-21");
    expect(weekKey("2026-09-28")).toBe("2026-09-28");
  });
  it("calculates visits, progress, last club visit and six-week totals consistently", () => {
    const s = attendanceStats(
      member,
      events([
        "2026-10-12T07:00:00+13:00",
        "2026-10-14T07:00:00+13:00",
        "2026-10-05T07:00:00+13:00",
      ]),
      now,
    );
    expect(s.completed).toBe(2);
    expect(s.percentage).toBe(67);
    expect(s.total).toBe(3);
    expect(s.lastVisit).toBe("2026-10-14T07:00:00+13:00");
    expect(s.chart.map((w) => w.count)).toEqual([0, 0, 0, 0, 1, 2]);
    expect(s.days.has("2026-10-14")).toBe(true);
  });
  it("keeps a streak while the current week has no visit yet", () => {
    const s = attendanceStats(
      member,
      events(["2026-10-05T07:00:00+13:00", "2026-09-28T07:00:00+13:00"]),
      now,
    );
    expect(s.streak).toBe(2);
    expect(s.longest).toBe(2);
  });
  it("counts the current week when attended and breaks after a fully missed week", () => {
    expect(
      attendanceStats(
        member,
        events(["2026-10-12T07:00:00+13:00", "2026-10-05T07:00:00+13:00"]),
        now,
      ).streak,
    ).toBe(2);
    const gap = attendanceStats(
      member,
      events(["2026-09-28T07:00:00+13:00", "2026-09-21T07:00:00+13:00"]),
      now,
    );
    expect(gap.streak).toBe(0);
    expect(gap.longest).toBe(2);
  });
  it("deduplicates event IDs, excludes other members, future and invalid visits", () => {
    const base = events(["2026-10-12T07:00:00+13:00"]);
    const s = attendanceStats(
      member,
      [
        ...base,
        ...base,
        { id: "other", memberId: "two", occurredAt: base[0].occurredAt },
        {
          id: "future",
          memberId: "one",
          occurredAt: "2026-10-18T07:00:00+13:00",
        },
        { id: "bad", memberId: "one", occurredAt: "invalid" },
      ],
      now,
    );
    expect(s.total).toBe(1);
  });
  it("handles empty and incomplete history without inventing a longest streak", () => {
    const s = attendanceStats({ ...member, historyComplete: false }, [], now);
    expect(s.streak).toBe(0);
    expect(s.total).toBe(0);
    expect(s.lastVisit).toBeNull();
    expect(s.longest).toBeNull();
    expect(s.next).toBe(50);
  });
  it("counts multiple real visits in a day as visits, not unique days", () => {
    const s = attendanceStats(
      member,
      events(["2026-10-12T07:00:00+13:00", "2026-10-12T17:00:00+13:00"]),
      now,
    );
    expect(s.completed).toBe(2);
    expect(s.days.size).toBe(1);
  });
  it("updates percentages when targets change and permits exceeding a goal", () => {
    const visits = events([
      "2026-10-12T07:00:00+13:00",
      "2026-10-14T07:00:00+13:00",
    ]);
    expect(
      attendanceStats({ ...member, weeklyTarget: 2 }, visits, now).percentage,
    ).toBe(100);
    expect(
      attendanceStats({ ...member, weeklyTarget: 1 }, visits, now).percentage,
    ).toBe(200);
  });
});
describe("targets and milestones", () => {
  it("requires whole weekly targets from one to seven", () => {
    for (const value of [0, -1, 8, 1.5, NaN, Infinity])
      expect(() => validateTarget(value)).toThrow();
    for (const value of [1, 3, 7])
      expect(() => validateTarget(value)).not.toThrow();
  });
  it("awards exact milestones and continues every hundred after 200", () => {
    expect(milestones(49)).toEqual({ achieved: [], next: 50 });
    expect(milestones(75)).toEqual({ achieved: [50, 75], next: 100 });
    expect(milestones(86).next).toBe(100);
    expect(milestones(150).next).toBe(200);
    expect(milestones(200).next).toBe(300);
    expect(milestones(1200).next).toBe(1300);
  });
});
