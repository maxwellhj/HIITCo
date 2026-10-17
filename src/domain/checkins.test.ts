import { describe, expect, it } from "vitest";
import {
  attendanceStats,
  attendanceVisits,
  dateKey,
  formatDate,
  visitsOnDay,
  weekKey,
  shiftDate,
} from "./attendance";
import type { AttendanceEvent, MemberProfile } from "./models";
const member: MemberProfile = {
  id: "one",
  firstName: "Sarah",
  lastName: "Demo",
  initials: "SD",
  weeklyTarget: 3,
  historyComplete: true,
};
const now = new Date("2026-10-18T10:00:00Z");
const events: AttendanceEvent[] = [
  {
    id: "late",
    memberId: "one",
    occurredAt: "2026-10-12T05:00:00Z",
    source: "demo",
    reference: "DEMO-2",
  },
  {
    id: "midnight",
    memberId: "one",
    occurredAt: "2026-10-11T11:30:00Z",
    source: "demo",
    reference: "DEMO-1",
  },
];
describe("club sign-in history", () => {
  it("shows all times on the NZ visit date in chronological order and retains references", () => {
    const visits = visitsOnDay(events, "one", "2026-10-12", now);
    expect(visits.map((v) => v.id)).toEqual(["midnight", "late"]);
    expect(visits[0].reference).toBe("DEMO-1");
    expect(
      formatDate(visits[0].occurredAt, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
    ).toMatch(/12:30.*am/);
    expect(
      formatDate(visits[1].occurredAt, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
    ).toMatch(/6:00.*pm/);
    expect(visitsOnDay(events, "one", "2026-10-11", now)).toEqual([]);
    expect(attendanceStats(member, events, now).completed).toBe(visits.length);
  });
  it("uses the same deduplication and exclusions as the attendance summary", () => {
    const input = [
      ...events,
      events[0],
      { ...events[0], id: "other", memberId: "two" },
      { ...events[0], id: "future", occurredAt: "2026-10-19T07:30:00+13:00" },
      { ...events[0], id: "invalid", occurredAt: "bad" },
    ];
    expect(attendanceVisits(input, "one", now)).toHaveLength(2);
    expect(attendanceStats(member, input, now).total).toBe(2);
  });
  it("handles winter midnight and previous-week boundaries across years", () => {
    const winter: AttendanceEvent[] = [
      { id: "winter", memberId: "one", occurredAt: "2026-07-05T12:30:00Z" },
    ];
    expect(visitsOnDay(winter, "one", "2026-07-06", now)).toHaveLength(1);
    expect(dateKey(winter[0].occurredAt)).toBe("2026-07-06");
    const week = weekKey("2027-01-01");
    expect(week).toBe("2026-12-28");
    expect(shiftDate(week, -7)).toBe("2026-12-21");
    expect(shiftDate(week, -14)).toBe("2026-12-14");
    expect(visitsOnDay(events, "absent", "2026-10-12", now)).toEqual([]);
  });
});
