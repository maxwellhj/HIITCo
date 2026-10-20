import { dateKey, shiftDate, weekKey } from "../domain/attendance";
import type { DailyVisits } from "../domain/gymmasterVisits";
export function memberAttendance(rows: DailyVisits[], now = new Date()) {
  const today = dateKey(now),
    monday = weekKey(today);
  const weeks = [0, 1, 2].map((offset) => {
    const start = shiftDate(monday, -7 * offset);
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = shiftDate(start, i);
      return {
        date,
        future: date > today,
        visits: rows.find((row) => row.date === date)?.visits ?? null,
      };
    });
    const past = days.filter((day) => !day.future);
    const known = past.filter((day) => day.visits !== null);
    const total = known.reduce((sum, day) => sum + day.visits!, 0);
    return {
      start,
      days,
      total,
      hasRecords: known.length > 0,
      complete: known.length === past.length,
    };
  });
  const streak = memberStreak(rows, now);
  return {
    today,
    monday,
    weeks,
    streak: streak.count,
    streakExact: streak.exact,
  };
}
export interface StreakSummary {
  count: number | null;
  exact: boolean;
}
/** Use all returned history, without assuming omitted dates are zero. */
export function memberStreak(
  rows: DailyVisits[],
  now = new Date(),
): StreakSummary {
  const today = dateKey(now),
    monday = weekKey(today);
  const byDate = new Map(
    rows
      .filter((row) => row.date <= today)
      .map((row) => [row.date, row.visits]),
  );
  const attendedWeeks = new Set(
    rows
      .filter((row) => row.date <= today && row.visits > 0)
      .map((row) => weekKey(row.date)),
  );
  const completeZero = (start: string) =>
    Array.from({ length: 7 }, (_, i) => shiftDate(start, i))
      .filter((date) => date <= today)
      .every((date) => byDate.get(date) === 0);
  let cursor = attendedWeeks.has(monday) ? monday : shiftDate(monday, -7),
    count = 0;
  while (attendedWeeks.has(cursor)) {
    count++;
    cursor = shiftDate(cursor, -7);
  }
  const exact =
    (attendedWeeks.has(monday) || completeZero(monday)) && completeZero(cursor);
  return { count: count > 0 ? count : exact ? 0 : null, exact };
}
