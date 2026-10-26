import { describe, it, expect } from "vitest";
import { eventCalendarFile, googleCalendarUrl } from "./eventCalendar";
const event = {
  id: "event-1",
  title: "Club, BBQ; & crew",
  description: "Train together.\nBring friends.",
  date: "2026-10-30",
  time: "18:30",
  location: "HIIT Co.",
  bring: "",
  bookingUrl: "https://example.com/book?a=1&b=2",
};
describe("personal calendar exports", () => {
  it("creates an editable Google event in NZ wall time with booking details", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.searchParams.get("ctz")).toBe("Pacific/Auckland");
    expect(url.searchParams.get("dates")).toBe(
      "20261030T183000/20261030T183000",
    );
    expect(url.searchParams.get("text")).toBe(event.title);
    expect(url.searchParams.get("details")).toContain(event.bookingUrl);
  });
  it("creates a NZ timezone iCalendar event without inventing an end time", () => {
    const value = eventCalendarFile(event, new Date("2026-10-26T04:00:00Z"));
    expect(value).toContain(
      "DTSTART;TZID=Pacific/Auckland:20261030T183000\r\n",
    );
    expect(value).toContain("TZOFFSETTO:+1300");
    expect(value).toContain("DTSTAMP:20261026T040000Z");
    expect(value).not.toContain("DTEND");
    expect(value).toContain("SUMMARY:Club\\, BBQ\\; & crew");
    expect(value).toContain("UID:event-1@hiitco.maxwellhj.workers.dev");
  });
  it("uses an exclusive next-day end for all-day events across years", () => {
    const allDay = { ...event, date: "2026-12-31", time: "" };
    expect(new URL(googleCalendarUrl(allDay)).searchParams.get("dates")).toBe(
      "20261231/20270101",
    );
    const text = eventCalendarFile(allDay);
    expect(text).toContain("DTSTART;VALUE=DATE:20261231");
    expect(text).toContain("DTEND;VALUE=DATE:20270101");
    expect(text).not.toContain("BEGIN:VTIMEZONE");
  });
  it("escapes injected lines and folds UTF-8 content within 75 octets", () => {
    const text = eventCalendarFile({
      ...event,
      title: "Title\nATTENDEE:evil",
      description: "語".repeat(200),
    });
    expect(text).not.toContain("\r\nATTENDEE:");
    expect(text).toContain("SUMMARY:Title\\nATTENDEE:evil");
    for (const line of text.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
