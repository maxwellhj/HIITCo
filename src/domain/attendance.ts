import type { AttendanceEvent, MemberProfile } from "./models";
export const TIMEZONE = "Pacific/Auckland";
const DAY = 86400000;
/** A date-only NZ calendar key, independent of the machine's timezone. */
export function dateKey(date: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(date));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shiftDate(key: string, days: number) {
  return new Date(Date.parse(key + "T12:00:00Z") + days * DAY)
    .toISOString()
    .slice(0, 10);
}
export function weekKey(key: string) {
  const day = new Date(key + "T12:00:00Z").getUTCDay();
  return shiftDate(key, -((day + 6) % 7));
}
export function validateTarget(target: number) {
  if (!Number.isInteger(target) || target < 1 || target > 7)
    throw new Error("Choose a whole number from 1 to 7 workouts.");
}
export function milestones(total: number) {
  const levels = [50, 75, 100, 150, 200];
  for (let n = 300; n <= Math.max(300, total + 100); n += 100) levels.push(n);
  return {
    achieved: levels.filter((n) => n <= total),
    next: levels.find((n) => n > total)!,
  };
}
export function attendanceStats(
  member: MemberProfile,
  events: AttendanceEvent[],
  now = new Date(),
) {
  const today = dateKey(now),
    currentWeek = weekKey(today);
  // IDs identify visits: duplicate imported events do not inflate attendance.
  const visits = [
    ...new Map(
      events
        .filter(
          (e) =>
            e.memberId === member.id &&
            Number.isFinite(Date.parse(e.occurredAt)) &&
            new Date(e.occurredAt) <= now,
        )
        .map((e) => [e.id, e]),
    ).values(),
  ].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const weeks = new Map<string, number>();
  const days = new Set<string>();
  visits.forEach((v) => {
    const d = dateKey(v.occurredAt),
      w = weekKey(d);
    weeks.set(w, (weeks.get(w) || 0) + 1);
    days.add(d);
  });
  let cursor = weeks.has(currentWeek)
      ? currentWeek
      : shiftDate(currentWeek, -7),
    streak = 0;
  while (weeks.has(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -7);
  }
  let longest = 0,
    run = 0,
    previous = "";
  [...weeks.keys()].sort().forEach((w) => {
    run = previous && shiftDate(previous, 7) === w ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = w;
  });
  const completed = weeks.get(currentWeek) || 0,
    total = visits.length,
    milestone = milestones(total);
  const previousMilestone = milestone.achieved.at(-1) || 0;
  return {
    today,
    currentWeek,
    completed,
    total,
    streak,
    longest: member.historyComplete ? longest : null,
    days,
    lastVisit: visits.at(-1)?.occurredAt ?? null,
    percentage: Math.round((completed / member.weeklyTarget) * 100),
    ...milestone,
    milestoneProgress:
      ((total - previousMilestone) / (milestone.next - previousMilestone)) *
      100,
    chart: Array.from({ length: 6 }, (_, i) => {
      const week = shiftDate(currentWeek, (i - 5) * 7);
      return { week, count: weeks.get(week) || 0 };
    }),
  };
}
export function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: TIMEZONE,
    ...options,
  }).format(new Date(value.length === 10 ? value + "T12:00:00+12:00" : value));
}
