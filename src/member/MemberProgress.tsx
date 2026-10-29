import { achievementExclusivity } from "../domain/control";
import { useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, Trophy, TrendingUp } from "lucide-react";
import { Card } from "../components/UI";
import { TrainingChart } from "../components/TrainingChart";
import type { ClubSticker, StickerCategory } from "../domain/control";
import { dateKey, formatDate } from "../domain/attendance";
import {
  exerciseProgress,
  parseTrainingLog,
  type TrainingLogData,
} from "../domain/training";
import { memberApi, MemberApiError } from "./api";
const number = (value: number) =>
  value.toLocaleString("en-NZ", { maximumFractionDigits: 2 });
export function TrophyRoom() {
  const [data, setData] = useState<{
      stickers: ClubSticker[];
      earnedStickerIds: string[];
    } | null>(null),
    [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [category, setCategory] = useState<"all" | StickerCategory>("all");
  useEffect(() => {
    let active = true;
    let abort: AbortController | null = null;
    const refresh = () => {
      abort?.abort();
      const current = new AbortController();
      abort = current;
      void memberApi("trophies", undefined, current.signal)
        .then((result) => {
          if (
            !Array.isArray(result.stickers) ||
            !Array.isArray(result.earnedStickerIds) ||
            result.stickers.length > 100 ||
            result.earnedStickerIds.some((id) => typeof id !== "string")
          )
            throw Error();
          if (active && abort === current && !current.signal.aborted) {
            setData(
              result as unknown as {
                stickers: ClubSticker[];
                earnedStickerIds: string[];
              },
            );
            setError("");
          }
        })
        .catch(() => {
          if (active && abort === current && !current.signal.aborted) {
            setData(null);
            setError(
              "Your Trophy Room is temporarily unavailable. Please try again.",
            );
          }
        });
    };
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15000);
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      abort?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [attempt]);
  const earned = new Set(data?.earnedStickerIds ?? []);
  const stickers = [...(data?.stickers ?? [])]
    .filter(
      (s) => category === "all" || (s.category ?? "milestones") === category,
    )
    .sort(
      (a, b) =>
        Number(earned.has(b.id)) - Number(earned.has(a.id)) ||
        a.name.localeCompare(b.name, "en-NZ", {
          sensitivity: "base",
          numeric: true,
        }) ||
        a.id.localeCompare(b.id),
    );
  return (
    <Card className="trophy-room">
      <div className="section-top">
        <h2>
          <Trophy size={19} />
          Trophy Room
        </h2>
        <span className="small muted">
          {data ? stickers.filter((s) => earned.has(s.id)).length : "—"}{" "}
          collected
        </span>
      </div>
      <div
        className="trophy-filters"
        role="group"
        aria-label="Achievement category"
      >
        {(["all", "milestones", "events"] as const).map((value) => (
          <button
            key={value}
            className={category === value ? "primary" : "secondary"}
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
          >
            {value === "all"
              ? "All"
              : value === "milestones"
                ? "Milestones"
                : "Events"}
          </button>
        ))}
      </div>
      {error ? (
        <>
          <p role="alert" className="error">
            {error}
          </p>
          <button
            className="text-button"
            onClick={() => setAttempt((v) => v + 1)}
          >
            Try again
          </button>
        </>
      ) : !data ? (
        <p role="status">Loading your stickers…</p>
      ) : stickers.length ? (
        <div className="sticker-grid">
          {stickers.map((s) => (
            <div
              key={s.id}
              className={`collectable-sticker ${earned.has(s.id) ? "earned" : "locked"}`}
            >
              {earned.has(s.id) ? (
                <img src={s.image} alt={s.name} />
              ) : (
                <div className="sticker-lock">
                  <LockKeyhole size={28} />
                </div>
              )}
              <strong>{s.name}</strong>
              <p>{s.description}</p>
              <small>{earned.has(s.id) ? "Unlocked" : "Locked"}</small>
              {achievementExclusivity(earned.has(s.id), s.unlockCount) && (
                <p className="sticker-exclusivity">
                  {achievementExclusivity(earned.has(s.id), s.unlockCount)}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="trophy-vault">
          <div className="sticker-outline" aria-hidden="true">
            <Trophy size={44} />
          </div>
          <h3>
            {category === "all"
              ? "Room for your next achievement"
              : `No ${category === "events" ? "event" : "milestone"} stickers yet`}
          </h3>
          <p>
            {category === "all"
              ? "Your earned HIIT Co. stickers will be collected here."
              : "Choose All to see the rest of your collection."}
          </p>
        </div>
      )}
    </Card>
  );
}
export function MemberProgress() {
  const [tab, setTab] = useState<"strength" | "trophies">("strength"),
    [data, setData] = useState<TrainingLogData | null>(null),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setData(null);
    void memberApi("training", undefined, controller.signal)
      .then((result) => {
        const log = parseTrainingLog(result.log, dateKey(new Date()));
        if (!controller.signal.aborted) {
          setData(log);
          const last = log.sessions
            .slice()
            .sort(
              (a, b) =>
                b.date.localeCompare(a.date) ||
                b.createdAt.localeCompare(a.createdAt),
            )[0];
          setSelected(last?.exerciseId ?? "");
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof MemberApiError && err.status === 401
              ? "Please sign in again to view your strength metrics."
              : "Your strength metrics are temporarily unavailable. Your recorded sessions have not been changed.",
          );
      });
    return () => controller.abort();
  }, [attempt]);
  const exercises =
      data?.exercises.filter((e) =>
        data.sessions.some((s) => s.exerciseId === e.id),
      ) ?? [],
    exercise = data?.exercises.find((e) => e.id === selected),
    stats =
      data && exercise ? exerciseProgress(data.sessions, exercise.id) : null;
  return (
    <div className="member-progress">
      <div
        className="progress-sections"
        role="tablist"
        aria-label="Progress sections"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? "strength"
              : event.key === "End"
                ? "trophies"
                : tab === "strength"
                  ? "trophies"
                  : "strength";
          setTab(next);
          event.currentTarget
            .querySelector<HTMLButtonElement>(
              `#${next === "strength" ? "strength-tab" : "trophy-tab"}`,
            )
            ?.focus();
        }}
      >
        <button
          role="tab"
          id="strength-tab"
          aria-selected={tab === "strength"}
          tabIndex={tab === "strength" ? 0 : -1}
          aria-controls="strength-panel"
          onClick={() => setTab("strength")}
        >
          <TrendingUp size={17} />
          Strength Metrics
        </button>
        <button
          role="tab"
          id="trophy-tab"
          aria-selected={tab === "trophies"}
          tabIndex={tab === "trophies" ? 0 : -1}
          aria-controls="trophy-panel"
          onClick={() => setTab("trophies")}
        >
          <Trophy size={17} />
          Trophy Room
        </button>
      </div>
      {tab === "strength" ? (
        <section
          id="strength-panel"
          role="tabpanel"
          aria-labelledby="strength-tab"
        >
          <Card>
            <h2>Strength Metrics</h2>
            <p className="small muted">
              Watch your weights and lifting volume grow with every recorded
              session.
            </p>
            {error ? (
              <>
                <p role="alert" className="error">
                  {error}
                </p>
                <button
                  className="text-button"
                  onClick={() => setAttempt((v) => v + 1)}
                >
                  Try again
                </button>
              </>
            ) : !data ? (
              <p role="status">Loading your strength metrics…</p>
            ) : !stats || !exercise ? (
              <div className="strength-empty">
                <TrendingUp size={34} />
                <h3>Your first session starts the story</h3>
                <p>
                  Record weights, reps and sets in Log to build your strength
                  charts.
                </p>
                <a className="primary" href="#log">
                  Open your log <ArrowRight size={16} />
                </a>
              </div>
            ) : (
              <>
                <label className="strength-picker">
                  Exercise
                  <select
                    aria-label="Strength exercise"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {exercises.map((e) => (
                      <option value={e.id} key={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="strength-metrics">
                  <div>
                    <span>Heaviest set</span>
                    <strong>
                      {number(stats.bestWeight)}
                      <small> kg</small>
                    </strong>
                  </div>
                  <div>
                    <span>Since first session</span>
                    <strong>
                      {stats.weightChange === null
                        ? "—"
                        : `${stats.weightChange > 0 ? "+" : ""}${number(stats.weightChange)}`}
                      <small>{stats.weightChange === null ? "" : " kg"}</small>
                    </strong>
                  </div>
                  <div>
                    <span>Latest volume</span>
                    <strong>
                      {number(stats.latestVolume)}
                      <small> kg</small>
                    </strong>
                  </div>
                </div>
                <TrainingChart key={exercise.id} points={stats.points} />
                <a
                  className="text-button"
                  href={`#log/${encodeURIComponent(exercise.id)}`}
                >
                  Record {exercise.name}
                  <ArrowRight size={15} />
                </a>
              </>
            )}
          </Card>
          {stats && stats.history.length > 0 && (
            <Card className="strength-recent">
              <h2>Recent sessions</h2>
              {stats.history
                .slice(-3)
                .reverse()
                .map((s) => (
                  <div key={s.id}>
                    <span>
                      {formatDate(s.date, { day: "numeric", month: "short" })}
                    </span>
                    <strong>
                      {s.sets.length} {s.sets.length === 1 ? "set" : "sets"} ·{" "}
                      {number(Math.max(...s.sets.map((set) => set.weight)))} kg
                      heaviest
                    </strong>
                  </div>
                ))}
            </Card>
          )}
        </section>
      ) : (
        <section id="trophy-panel" role="tabpanel" aria-labelledby="trophy-tab">
          <TrophyRoom />
        </section>
      )}
    </div>
  );
}
