import { useCallback, useEffect, useState } from "react";
import type { ClubContent } from "../domain/club";
export function useClubContent(enabled = true) {
  const [data, setData] = useState<ClubContent | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((v) => v + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true,
      controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      const abort = new AbortController();
      controller = abort;
      try {
        const r = await fetch("/api/gymmaster/club", {
          credentials: "same-origin",
          cache: "no-store",
          signal: abort.signal,
        });
        if (!r.ok) throw Error();
        const value = await r.json();
        if (
          !Number.isInteger(value.weeklyTarget) ||
          value.weeklyTarget < 1 ||
          value.weeklyTarget > 7 ||
          !Array.isArray(value.events)
        )
          throw Error();
        if (active && !abort.signal.aborted) {
          setData(value);
          setError("");
        }
      } catch {
        if (active && !abort.signal.aborted)
          setError(
            "Club updates are temporarily unavailable. Please try again.",
          );
      }
    };
    void load();
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(visible, 30000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled, attempt]);
  return { data, error, reload };
}
