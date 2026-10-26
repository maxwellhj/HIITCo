import { describe, it, expect } from "vitest";
import { parseClubEvent, trainingDays, eventTimeLabel } from "./club";
const event = {
  id: "event-1",
  title: " Club social ",
  description: "Meet the team.",
  date: "2026-10-30",
  time: "18:30",
  bookingUrl: "https://example.com/book",
};
describe("club events and training-day goals", () => {
  it("accepts date-only events and safe booking links", () => {
    expect(
      parseClubEvent({ ...event, time: "", bookingUrl: "" }),
    ).toMatchObject({ title: "Club social", time: "", bookingUrl: "" });
    expect(eventTimeLabel("18:30")).toMatch(/6:30\s*pm/i);
    expect(eventTimeLabel("")).toBe("No set time");
  });
  it("rejects impossible dates, invalid times and active/credential URLs", () => {
    for (const values of [
      { date: "2026-02-30" },
      { time: "24:00" },
      { bookingUrl: "javascript:alert(1)" },
      { bookingUrl: "data:text/html,test" },
      { bookingUrl: "https://user:pass@example.com" },
      { title: "   " },
    ])
      expect(() => parseClubEvent({ ...event, ...values })).toThrow();
  });
  it("counts distinct NZ training dates from counts and webhooks, never visits twice or future/previous-week days", () => {
    const rows = [
      { date: "2026-10-26", visits: 3, watervisits: 0, bookings: 0 },
      { date: "2026-10-27", visits: 0, watervisits: 0, bookings: 0 },
      { date: "2026-10-25", visits: 2, watervisits: 0, bookings: 0 },
      { date: "2026-10-30", visits: 1, watervisits: 0, bookings: 0 },
    ];
    const checkins = [
      {
        id: "1",
        date: "2026-10-26",
        localTimestamp: "2026-10-26T08:00:00",
        door: null,
      },
      {
        id: "2",
        date: "2026-10-27",
        localTimestamp: "2026-10-27T08:00:00",
        door: null,
      },
      {
        id: "3",
        date: "2026-10-27",
        localTimestamp: "2026-10-27T09:00:00",
        door: null,
      },
    ];
    expect(trainingDays(rows, checkins, "2026-10-28")).toBe(2);
    expect(trainingDays(null, null, "2026-10-28")).toBe(0);
  });
});
