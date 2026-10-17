import { describe, it, expect } from "vitest";
import { calendarDays, monthStart, moveMonth, upcomingEvents } from "./events";
import { createDemoEvents } from "../data/events";
describe("club calendar", () => {
  it("lays out Monday-first months including leap years", () => {
    const feb = calendarDays("2024-02-01");
    expect(feb.slice(0, 3)).toEqual([null, null, null]);
    expect(feb.filter(Boolean)).toHaveLength(29);
    expect(feb.length % 7).toBe(0);
    const monday = calendarDays("2026-06-01");
    expect(monday[0]).toBe("2026-06-01");
    expect(monday.filter(Boolean)).toHaveLength(30);
  });
  it("moves between years without skipping months or overflowing short months", () => {
    expect(monthStart("2026-12-31")).toBe("2026-12-01");
    expect(moveMonth("2026-12-31", 1)).toBe("2027-01-01");
    expect(moveMonth("2026-01-31", -1)).toBe("2025-12-01");
    expect(moveMonth("2026-01-31", 1)).toBe("2026-02-01");
  });
  it("returns upcoming events sorted by date and keeps multiple events on a day", () => {
    const events = createDemoEvents("2026-12-25");
    expect(events[1].date).toBe("2027-01-04");
    expect(events[1].date).toBe(events[2].date);
    const result = upcomingEvents([...events].reverse(), "2027-01-04");
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe("2027-01-04");
    expect(upcomingEvents(events, "2028-01-01")).toEqual([]);
  });
});
