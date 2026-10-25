import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil, Trash2, X } from "lucide-react";
import { Card } from "../components/UI";
import { dateKey, formatDate, shiftDate, weekKey } from "../domain/attendance";
import {
  chowChallenge,
  parseChowLog,
  type ChowChallenge,
  type ChowLogData,
} from "../domain/chow";
import {
  parsePublishedWorkout,
  type PublishedWorkout,
} from "../domain/publishedWorkouts";
import { memberApi, MemberApiError } from "./api";
const number = (value: number) =>
  value.toLocaleString("en-NZ", { maximumFractionDigits: 2 });
export function ChowScores({
  source,
  initialStation = 1,
}: {
  source?: PublishedWorkout;
  initialStation?: number;
}) {
  const [data, setData] = useState<ChowLogData | null>(null),
    [catalog, setCatalog] = useState<ChowChallenge[]>([]),
    [block, setBlock] = useState(source?.block ?? ""),
    [station, setStation] = useState(initialStation),
    [archive, setArchive] = useState<string | null>(null),
    [feedError, setFeedError] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState(false),
    [score, setScore] = useState(""),
    [date, setDate] = useState(dateKey(new Date())),
    [editing, setEditing] = useState<string | null>(null),
    [deleting, setDeleting] = useState<string | null>(null);
  const revision = useRef(0),
    controller = useRef<AbortController | null>(null),
    today = dateKey(new Date());
  const selected = archive
    ? data?.challenges.find((c) => c.id === archive)
    : catalog.find((c) => c.station === station);
  function reset() {
    setScore("");
    setDate(today);
    setEditing(null);
    setDeleting(null);
    setError("");
    setNotice("");
  }
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    setData(null);
    setError("");
    setFeedError("");
    const week = weekKey(dateKey(new Date()));
    void Promise.allSettled([
      memberApi("chow", undefined, abort.signal),
      source
        ? Promise.resolve({ workout: source })
        : memberApi(`workouts?date=${week}`, undefined, abort.signal),
    ])
      .then(async ([records, feed]) => {
        if (records.status !== "fulfilled") throw Error();
        const log = await parseChowLog(records.value.log, dateKey(new Date()));
        if (
          !Number.isSafeInteger(records.value.revision) ||
          Number(records.value.revision) < 0
        )
          throw Error();
        let choices: ChowChallenge[] = [],
          name = "",
          message = "";
        try {
          if (feed.status !== "fulfilled") throw Error();
          const workout =
            source ?? parsePublishedWorkout(feed.value.workout, week);
          name = workout.block;
          if (!workout.blockBeginning || !workout.blockChows) throw Error();
          choices = await Promise.all(
            workout.blockChows
              .filter((c) => c.workout)
              .map((c) =>
                chowChallenge({
                  block: workout.block,
                  weekBeginning: workout.weekBeginning,
                  programWeek: workout.programWeek,
                  station: c.station,
                  workout: c.workout!,
                  blockScoped: true,
                  blockStart: workout.blockBeginning,
                }),
              ),
          );
        } catch {
          message =
            "The block’s CHOW list is unavailable. You can still view your saved challenges below.";
        }
        if (!abort.signal.aborted) {
          revision.current = Number(records.value.revision);
          setData(log);
          setCatalog(choices);
          setBlock(name);
          setFeedError(message);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            "We couldn’t load your CHOW scores. Your saved scores have not been changed.",
          );
      });
    return () => abort.abort();
  }, [source, attempt]);
  async function save(next: ChowLogData) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const log = await parseChowLog(next, today);
      const result = await memberApi(
        "chow",
        { log, revision: revision.current },
        controller.current?.signal,
      );
      if (result.revision !== revision.current + 1) throw Error();
      revision.current = Number(result.revision);
      setData(log);
      return true;
    } catch (err) {
      setError(
        err instanceof MemberApiError && err.status === 409
          ? "Your scores changed in another window. Close and reopen CHOW before saving again."
          : err instanceof MemberApiError && err.status === 401
            ? "Please sign in again before saving."
            : "Couldn’t save your score. Your entry is still here; please try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="chow-state">
        <h2>{error ? "CHOW scores unavailable" : "Loading CHOWs…"}</h2>
        {error && (
          <>
            <p role="alert" className="error">
              {error}
            </p>
            <button
              className="primary"
              onClick={() => setAttempt((v) => v + 1)}
            >
              Try again
            </button>
          </>
        )}
      </div>
    );
  const related = new Set(
    selected
      ? data.challenges
          .filter(
            (c) =>
              c.id === selected.id ||
              (!c.blockScoped &&
                selected.blockScoped &&
                c.block === selected.block &&
                c.station === selected.station &&
                c.workout === selected.workout &&
                c.weekBeginning >= selected.blockStart!),
          )
          .map((c) => c.id)
      : [],
  );
  if (selected) related.add(selected.id);
  const history = data.scores
    .filter((s) => related.has(s.challengeId))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
  const sets = history.filter((s) => s.unit === "sets"),
    best = sets.length ? Math.max(...sets.map((s) => s.score)) : null,
    last = sets[0];
  const minimum = selected
      ? selected.blockScoped
        ? selected.blockStart!
        : selected.weekBeginning
      : today,
    maximum =
      selected &&
      !selected.blockScoped &&
      shiftDate(selected.weekBeginning, 6) < today
        ? shiftDate(selected.weekBeginning, 6)
        : today;
  return (
    <div className="chow-scores chow-compact">
      {!source && (
        <a className="text-button" href="#log">
          <ArrowLeft size={15} />
          Exercise log
        </a>
      )}
      <h2>
        CHOW
        {(selected?.block ?? block)
          ? ` · ${selected?.block ?? block}`
          : " scores"}
      </h2>
      <label className="chow-station-label">
        Station
        <select
          aria-label="CHOW station"
          value={archive ? "archive" : station}
          disabled={busy}
          onChange={(e) => {
            setArchive(null);
            setStation(Number(e.target.value));
            reset();
          }}
        >
          {archive && (
            <option value="archive">Saved Station {selected?.station}</option>
          )}
          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
            <option
              key={n}
              value={n}
              disabled={!catalog.some((c) => c.station === n)}
            >
              Station {n}
              {catalog.some((c) => c.station === n) ? "" : " — not set yet"}
            </option>
          ))}
        </select>
      </label>
      {feedError && <p className="small muted">{feedError}</p>}
      {selected ? (
        <>
          <div className="chow-instructions">
            <h3>Challenge details</h3>
            <p className="chow-workout">{selected.workout}</p>
          </div>
          <div className="chow-quick-stats">
            <span>
              Last<strong>{last ? `${number(last.score)} sets` : "—"}</strong>
            </span>
            <span>
              Best
              <strong>{best === null ? "—" : `${number(best)} sets`}</strong>
            </span>
          </div>
          <fieldset disabled={busy} className="chow-fieldset">
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const value = score.trim() === "" ? NaN : Number(score);
                setError("");
                if (
                  !Number.isFinite(value) ||
                  value < 0 ||
                  value > 1000000 ||
                  Math.abs(value * 100 - Math.round(value * 100)) > 0.000001
                ) {
                  setError(
                    "Enter your total sets, with up to two decimal places.",
                  );
                  return;
                }
                if (date < minimum || date > maximum) {
                  setError("Choose a valid attempt date, today or earlier.");
                  return;
                }
                const old = data.scores.find((s) => s.id === editing);
                const record = {
                  id: editing ?? crypto.randomUUID(),
                  challengeId: old?.challengeId ?? selected.id,
                  date,
                  score: value,
                  unit: "sets" as const,
                  createdAt: old?.createdAt ?? new Date().toISOString(),
                };
                const next: ChowLogData = {
                  version: 1,
                  challenges:
                    data.challenges.some((c) => c.id === selected.id) || old
                      ? data.challenges
                      : [...data.challenges, selected],
                  scores: editing
                    ? data.scores.map((s) => (s.id === editing ? record : s))
                    : [...data.scores, record],
                };
                if (await save(next)) {
                  setScore("");
                  setEditing(null);
                  setNotice("CHOW score saved.");
                }
              }}
            >
              <div className="chow-entry-row">
                <label>
                  Sets
                  <input
                    aria-label="CHOW sets"
                    type="number"
                    required
                    min="0"
                    max="1000000"
                    step="0.01"
                    inputMode="decimal"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder="e.g. 8"
                  />
                </label>
                <button className="primary" disabled={minimum > today}>
                  {busy ? "Saving…" : editing ? "Update" : "Save"}
                </button>
              </div>
              <details className="chow-date">
                <summary>
                  {formatDate(date, { day: "numeric", month: "short" })} ·
                  change date
                </summary>
                <label>
                  Attempt date
                  <input
                    type="date"
                    min={minimum}
                    max={maximum}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              </details>
              {editing && (
                <button type="button" className="text-button" onClick={reset}>
                  Cancel edit
                </button>
              )}
            </form>
          </fieldset>
          {notice && (
            <p role="status" className="chow-feedback">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <details className="chow-attempts">
            <summary>Previous attempts ({history.length})</summary>
            {!history.length ? (
              <p className="small muted">No attempts yet.</p>
            ) : (
              history.map((s) => (
                <div className="chow-attempt" key={s.id}>
                  <span>
                    <strong>
                      {number(s.score)} {s.unit}
                    </strong>
                    <small>
                      {formatDate(s.date)}
                      {s.unit !== "sets" ? " · previous scoring format" : ""}
                    </small>
                  </span>
                  <div>
                    {s.unit === "sets" && (
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label={`Edit score ${s.score} sets`}
                        onClick={() => {
                          setEditing(s.id);
                          setScore(String(s.score));
                          setDate(s.date);
                          setError("");
                          setNotice("");
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    <button
                      className="icon-button"
                      disabled={busy}
                      aria-label={`Delete score ${s.score} ${s.unit}`}
                      onClick={() => setDeleting(s.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {deleting === s.id && (
                    <div className="chow-delete">
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setDeleting(null)}
                      >
                        Keep
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await save({
                              ...data,
                              scores: data.scores.filter((r) => r.id !== s.id),
                            })
                          ) {
                            setDeleting(null);
                            if (editing === s.id) reset();
                            setNotice("Score deleted.");
                          }
                        }}
                      >
                        Delete score
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </details>
        </>
      ) : (
        <p className="small muted">
          This station’s CHOW hasn’t been set yet. Choose another station.
        </p>
      )}
      {data.challenges.length > 0 && (
        <details className="chow-archive">
          <summary>Saved challenges</summary>
          {data.challenges
            .slice()
            .reverse()
            .map((c) => (
              <button
                key={c.id}
                className="text-button"
                onClick={() => {
                  setArchive(c.id);
                  setScore("");
                  setEditing(null);
                  setDate(
                    c.blockScoped
                      ? today
                      : shiftDate(c.weekBeginning, 6) < today
                        ? shiftDate(c.weekBeginning, 6)
                        : today,
                  );
                  setError("");
                  setNotice("");
                }}
              >
                Station {c.station} · {c.block} ·{" "}
                {formatDate(c.blockStart ?? c.weekBeginning)}
              </button>
            ))}
        </details>
      )}
    </div>
  );
}
export function ChowDialog({
  source,
  station,
  onClose,
}: {
  source: PublishedWorkout;
  station: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current,
      trigger =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="chow-dialog"
      aria-label="CHOW scores"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <button
        className="icon-button chow-close"
        aria-label="Close CHOW scores"
        onClick={onClose}
      >
        <X size={18} />
      </button>
      <ChowScores source={source} initialStation={station} />
    </dialog>
  );
}
export function MemberChow() {
  return (
    <Card>
      <ChowScores />
    </Card>
  );
}
