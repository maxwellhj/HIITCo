import { useEffect, useState } from "react";
import { dateKey, formatDate, shiftDate, weekKey } from "../domain/attendance";
import { parseDailyVisits, type DailyVisits } from "../domain/gymmasterVisits";
const errors: Record<string, string> = {
  session_expired:
    "Your GymMaster session has expired. Disconnect and sign in again to load your visits.",
  too_many_attempts:
    "Please wait a minute before refreshing your visits again.",
  visits_format:
    "GymMaster’s attendance reply differs from the documentation. Please tell us GM-VISITS-FORMAT.",
  visits_not_available:
    "GymMaster couldn’t provide your visits. Please tell us GM-VISITS-UNAVAILABLE.",
  provider_timeout:
    "GymMaster took too long to respond. Please try again in a minute.",
};
export function GymMasterVisits() {
  const [days, setDays] = useState<DailyVisits[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setDays(null);
    setError("");
    setLoading(true);
    async function load() {
      try {
        const response = await fetch("/api/gymmaster/visits", {
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw Error(
            errors[String(body?.error)] ??
              "Couldn’t load your GymMaster visits. Please try again shortly.",
          );
        const rows = parseDailyVisits(body.days);
        if (active) setDays(rows);
      } catch (err) {
        if (active)
          setError(
            err instanceof Error ? err.message : "Couldn’t load visits.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [revision]);
  const today = dateKey(new Date()),
    monday = weekKey(today);
  return (
    <section className="gymmaster-visits" aria-labelledby="live-visits-title">
      <h3 id="live-visits-title">Your GymMaster visits</h3>
      <p>
        Real attendance for the signed-in GymMaster account. GymMaster may take
        up to 10 minutes to update these counts.
      </p>
      <p>
        Check-in times aren’t provided. A missing date means GymMaster didn’t
        return a record; it doesn’t confirm zero visits.
      </p>
      {loading ? (
        <p role="status">Loading your visits…</p>
      ) : error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : (
        days && (
          <>
            {days.length === 0 && (
              <p>No visit records were returned for these three weeks.</p>
            )}
            {[0, 1, 2].map((offset) => {
              const start = shiftDate(monday, -7 * offset);
              return (
                <div key={start} className="live-visits-week">
                  <h4>
                    {["This week", "Last week", "Two weeks ago"][offset]} ·{" "}
                    {formatDate(start + "T00:00:00Z", {
                      day: "numeric",
                      month: "short",
                    })}
                  </h4>
                  <ul>
                    {Array.from({ length: 7 }, (_, i) => {
                      const date = shiftDate(start, i),
                        row = days.find((d) => d.date === date);
                      return (
                        <li key={date}>
                          <span>
                            {formatDate(date + "T00:00:00Z", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                          <strong>
                            {date > today
                              ? "Upcoming"
                              : row
                                ? `${row.visits} ${row.visits === 1 ? "visit" : "visits"}`
                                : "Not returned"}
                          </strong>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </>
        )
      )}
      <button
        className="secondary"
        disabled={loading}
        onClick={() => setRevision((value) => value + 1)}
      >
        Refresh visits
      </button>
    </section>
  );
}
