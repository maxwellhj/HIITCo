import { validDate } from "./training";
import { weekKey } from "./attendance";
import type { ClubEvent } from "./events";
import type { DailyVisits } from "./gymmasterVisits";
import type { MemberCheckin } from "./checkinTimes";
export interface ClubContent {
  weeklyTarget: number;
  events: ClubEvent[];
}
export function parseClubEvent(value: unknown): ClubEvent {
  if (!value || typeof value !== "object") throw Error("Invalid event");
  const e = value as Record<string, unknown>;
  if (
    typeof e.id !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(e.id) ||
    typeof e.title !== "string" ||
    !e.title.trim() ||
    e.title.length > 120 ||
    typeof e.description !== "string" ||
    !e.description.trim() ||
    e.description.length > 3000 ||
    typeof e.date !== "string" ||
    !validDate(e.date) ||
    typeof e.time !== "string" ||
    (e.time !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)) ||
    typeof e.bookingUrl !== "string" ||
    e.bookingUrl.length > 2000
  )
    throw Error("Invalid event");
  if (e.bookingUrl.trim()) {
    const u = new URL(e.bookingUrl.trim());
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      throw Error("Invalid booking URL");
  }
  return {
    id: e.id,
    title: e.title.trim(),
    description: e.description.trim(),
    date: e.date,
    time: e.time,
    bookingUrl: e.bookingUrl.trim(),
    location: "",
    bring: "",
  };
}
export function trainingDays(
  rows: DailyVisits[] | null,
  checkins: MemberCheckin[] | null,
  today: string,
) {
  const start = weekKey(today),
    dates = new Set<string>();
  for (const row of rows ?? [])
    if (row.date >= start && row.date <= today && row.visits > 0)
      dates.add(row.date);
  for (const row of checkins ?? [])
    if (row.date >= start && row.date <= today) dates.add(row.date);
  return dates.size;
}
export function eventTimeLabel(time: string) {
  if (!time) return "No set time";
  if (!/^\d{2}:\d{2}$/.test(time)) return time;
  return new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(new Date("2000-01-01T" + time + ":00Z"));
}
