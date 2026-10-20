export interface DailyVisits {
  date: string;
  visits: number;
  watervisits: number;
  bookings: number;
}
/** Validate documented date-only fields without converting them between timezones. */
export function parseDailyVisits(value: unknown): DailyVisits[] {
  if (!Array.isArray(value) || value.length > 10000)
    throw Error("Invalid visits");
  const dates = new Set<string>();
  return value
    .map((row: unknown) => {
      if (!row || typeof row !== "object") throw Error("Invalid visit");
      const r = row as Record<string, unknown>;
      if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date))
        throw Error("Invalid date");
      const date = new Date(r.date + "T12:00:00Z");
      if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== r.date ||
        dates.has(r.date)
      )
        throw Error("Invalid date");
      dates.add(r.date);
      const count = (v: unknown) => {
        if (typeof v === "string" && /^(0|[1-9][0-9]{0,15})$/.test(v))
          v = Number(v);
        if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)
          throw Error("Invalid count");
        return v;
      };
      const visits = count(r.visits),
        watervisits = count(r.watervisits),
        bookings = count(r.bookings);
      if (watervisits > visits) throw Error("Invalid water visits");
      return { date: r.date, visits, watervisits, bookings };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
