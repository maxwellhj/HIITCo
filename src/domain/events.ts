import { dateKey, shiftDate } from "./attendance";

export interface ClubEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  bring: string;
  bookingUrl?: string;
}

export function monthStart(date: string) {
  return date.slice(0, 7) + "-01";
}
export function moveMonth(date: string, offset: number) {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1, 12))
    .toISOString()
    .slice(0, 10);
}
/** Monday-first calendar cells. All values are NZ calendar dates, not instants. */
export function calendarDays(month: string): (string | null)[] {
  const start = monthStart(month);
  const weekday = (new Date(start + "T12:00:00Z").getUTCDay() + 6) % 7;
  const end = moveMonth(start, 1);
  const cells: (string | null)[] = Array.from({ length: weekday }, () => null);
  for (let day = start; day < end; day = shiftDate(day, 1)) cells.push(day);
  while (cells.length % 7) cells.push(null);
  return cells;
}
export function upcomingEvents(
  events: readonly ClubEvent[],
  today = dateKey(new Date()),
) {
  return events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type EventResponseStatus = "going" | "maybe" | "cant_attend";
export interface EventResponse {
  eventId: string;
  status: EventResponseStatus;
  updatedAt: string;
}
export const eventResponseLabels: Record<EventResponseStatus, string> = {
  going: "Going",
  maybe: "Maybe",
  cant_attend: "Can’t attend",
};
