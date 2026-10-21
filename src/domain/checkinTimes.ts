export interface MemberCheckin {
  id: string;
  date: string;
  localTimestamp: string;
  door: string | null;
}
export function parseCheckinTimes(value: unknown): MemberCheckin[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw Error("Invalid check-ins");
  const ids = new Set<string>();
  return value
    .map((item: unknown) => {
      if (!item || typeof item !== "object") throw Error();
      const r = item as Record<string, unknown>;
      if (
        typeof r.id !== "string" ||
        !/^[1-9][0-9]{0,15}$/.test(r.id) ||
        ids.has(r.id) ||
        typeof r.localTimestamp !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?$/.test(
          r.localTimestamp,
        ) ||
        r.date !== r.localTimestamp.slice(0, 10) ||
        !(
          r.door === null ||
          (typeof r.door === "string" && r.door.length <= 120)
        )
      )
        throw Error("Invalid check-in");
      const date = new Date(r.localTimestamp + "Z");
      if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== r.date
      )
        throw Error();
      ids.add(r.id);
      return {
        id: r.id,
        date: r.date as string,
        localTimestamp: r.localTimestamp,
        door: r.door as string | null,
      };
    })
    .sort(
      (a, b) =>
        a.localTimestamp.localeCompare(b.localTimestamp) ||
        a.id.localeCompare(b.id),
    );
}
/** Format an already-NZ wall clock without applying a second timezone conversion. */
export function checkinTimeLabel(localTimestamp: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(localTimestamp + "Z"));
}
