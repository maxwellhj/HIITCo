import { useEffect, useRef, useState } from "react";
import { X, ArrowRight, Target, ChevronDown } from "lucide-react";
import { dateKey } from "../domain/attendance";
import { habitScheduled, parseGoals, type GoalsLog } from "../domain/goals";
import { memberApi, MemberApiError } from "./api";
export function HomeHabits() {
  const [data, setData] = useState<{ log: GoalsLog; revision: number } | null>(
      null,
    ),
    [today, setToday] = useState(dateKey(new Date())),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const pending = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    const load = async () => {
      if (pending.current) return;
      try {
        const r = await memberApi("goals", undefined, abort.signal);
        const log = parseGoals(r.log, dateKey(new Date()));
        if (!Number.isSafeInteger(r.revision) || (r.revision as number) < 0)
          throw Error();
        if (!abort.signal.aborted && !pending.current) {
          setData((current) =>
            current && current.revision > (r.revision as number)
              ? current
              : {
                  log,
                  revision: r.revision as number,
                },
          );
          setError("");
        }
      } catch {
        if (!abort.signal.aborted)
          setError("Daily habits are temporarily unavailable.");
      }
    };
    void load();
    const refresh = () => {
      setToday(dateKey(new Date()));
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      abort.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [retry]);
  async function toggle(goalId: string, habitId: string, checked: boolean) {
    if (!data || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const log = {
      goals: data.log.goals.map((g) =>
        g.id !== goalId
          ? g
          : {
              ...g,
              habits: g.habits.map((h) =>
                h.id !== habitId
                  ? h
                  : {
                      ...h,
                      completed: checked
                        ? [...h.completed, today]
                        : h.completed.filter((d) => d !== today),
                    },
              ),
            },
      ),
    };
    try {
      const r = await memberApi("goals", { log, revision: data.revision });
      setData({ log, revision: r.revision as number });
    } catch (e) {
      setError(
        e instanceof MemberApiError && e.status === 409
          ? "Your habits changed on another device. Refresh before trying again."
          : "Couldn’t save this habit. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function dismissIntro() {
    if (!data || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      // Persist the first-use decision using the account log's revision, without creating a goal.
      const result = await memberApi("goals", {
        log: data.log,
        revision: data.revision,
      });
      setData({ log: data.log, revision: result.revision as number });
    } catch (e) {
      setError(
        e instanceof MemberApiError && e.status === 409
          ? "Your goals changed on another device. Refresh habits and try again."
          : "Couldn’t dismiss the banner. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const habits =
    data?.log.goals.flatMap((g) =>
      g.createdDate <= today
        ? g.habits
            .filter((h) => habitScheduled(h, today))
            .map((h) => ({ goal: g, habit: h }))
        : [],
    ) ?? [];
  const totalHabits = data?.log.goals.some((g) => g.habits.length);
  return (
    <>
      {data && !error && data.revision === 0 && data.log.goals.length === 0 && (
        <div className="goals-intro-banner">
          <a href="#progress/goals">
            <Target size={22} />
            <span>Explore our new goals and habits feature here.</span>
            <ArrowRight size={18} />
          </a>
          <button
            className="icon-button"
            aria-label="Dismiss goals banner"
            disabled={busy}
            onClick={() => void dismissIntro()}
          >
            <X size={18} />
          </button>
        </div>
      )}
      <details className="card home-fold home-habits" open>
        <summary>
          Today’s habits
          <span className="small muted">
            {data
              ? `${habits.filter(({ habit }) => habit.completed.includes(today)).length}/${habits.length}`
              : ""}
          </span>
          <ChevronDown size={18} />
        </summary>
        {error && (
          <p className="error" role="alert">
            {error}{" "}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setRetry((v) => v + 1)}
            >
              Refresh habits
            </button>
          </p>
        )}
        {!data && !error ? (
          <p role="status">Loading your habits…</p>
        ) : habits.length ? (
          habits.map(({ goal, habit }) => (
            <label
              className={`habit-check ${habit.completed.includes(today) ? "habit-complete" : ""}`}
              key={`${goal.id}:${habit.id}`}
            >
              <input
                type="checkbox"
                checked={habit.completed.includes(today)}
                disabled={busy}
                onChange={(e) =>
                  void toggle(goal.id, habit.id, e.target.checked)
                }
              />
              <span>
                <span className="habit-title">{habit.title}</span>
                <small>{goal.title}</small>
              </span>
            </label>
          ))
        ) : (
          data && (
            <p className="small muted">
              {totalHabits
                ? "No habits scheduled for today."
                : "Add daily habits in Progress → Goals."}
            </p>
          )
        )}
      </details>
    </>
  );
}
