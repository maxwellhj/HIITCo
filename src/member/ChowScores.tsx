import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Pencil, Trash2, Trophy, X } from "lucide-react";
import { Card } from "../components/UI";
import { dateKey, formatDate, shiftDate } from "../domain/attendance";
import {
  bestChowScore,
  chowChallenge,
  chowUnits,
  parseChowLog,
  type ChowChallenge,
  type ChowLogData,
  type ChowUnit,
} from "../domain/chow";
import { memberApi, MemberApiError } from "./api";
export type ChowSeed = Omit<ChowChallenge, "id">;
const number = (value: number) =>
  value.toLocaleString("en-NZ", { maximumFractionDigits: 2 });
export function ChowScores({ challenge }: { challenge?: ChowSeed }) {
  const [data, setData] = useState<ChowLogData | null>(null),
    [selected, setSelected] = useState<ChowChallenge | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState(false);
  const [score, setScore] = useState(""),
    [unit, setUnit] = useState<ChowUnit>("reps"),
    [date, setDate] = useState(dateKey(new Date())),
    [editing, setEditing] = useState<string | null>(null),
    [deleting, setDeleting] = useState<string | null>(null);
  const revision = useRef(0),
    controller = useRef<AbortController | null>(null),
    today = dateKey(new Date());
  function choose(c: ChowChallenge, log: ChowLogData) {
    setSelected(c);
    setDate(
      today < shiftDate(c.weekBeginning, 6)
        ? today
        : shiftDate(c.weekBeginning, 6),
    );
    setUnit(
      log.scores.filter((s) => s.challengeId === c.id).at(-1)?.unit ?? "reps",
    );
    setScore("");
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
    void Promise.all([
      memberApi("chow", undefined, abort.signal),
      challenge ? chowChallenge(challenge) : Promise.resolve(null),
    ])
      .then(async ([result, initial]) => {
        const log = await parseChowLog(result.log, dateKey(new Date()));
        if (
          !Number.isSafeInteger(result.revision) ||
          Number(result.revision) < 0
        )
          throw Error();
        if (!abort.signal.aborted) {
          revision.current = Number(result.revision);
          setData(log);
          if (initial) choose(initial, log);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            "We couldn’t load your CHOW scores. Your saved scores have not been changed.",
          );
      });
    return () => abort.abort();
  }, [challenge, attempt]);
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
          ? "Your CHOW scores changed in another window. Close and reopen this page before saving again."
          : err instanceof MemberApiError && err.status === 401
            ? "Your session expired. Please sign in again before saving."
            : err instanceof MemberApiError && err.status === 429
              ? "Please wait a minute before saving again. Your entry is still here."
              : "Couldn’t save your CHOW score. Your entry is still here; please try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="chow-state">
        <h2>
          {error ? "CHOW scores unavailable" : "Loading your CHOW scores…"}
        </h2>
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
  const history = selected
    ? data.scores
        .filter((s) => s.challengeId === selected.id)
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            b.createdAt.localeCompare(a.createdAt),
        )
    : [];
  const best = selected ? bestChowScore(history, selected.id, unit) : null;
  return (
    <div className="chow-scores">
      {!challenge && (
        <a className="text-button" href="#log">
          <ArrowLeft size={16} />
          Exercise log
        </a>
      )}
      {!selected ? (
        <>
          <h2>CHOW scores</h2>
          <p className="small muted">
            Your challenge attempts and personal bests.
          </p>
          {data.challenges.length ? (
            data.challenges
              .slice()
              .sort(
                (a, b) =>
                  b.weekBeginning.localeCompare(a.weekBeginning) ||
                  a.station - b.station,
              )
              .map((c) => (
                <button
                  className="exercise-item"
                  key={c.id}
                  onClick={() => choose(c, data)}
                >
                  <Trophy size={20} />
                  <span>
                    <strong>
                      Station {c.station} · {c.block}
                    </strong>
                    <small>
                      Week of {formatDate(c.weekBeginning)} ·{" "}
                      {data.scores.filter((s) => s.challengeId === c.id).length}{" "}
                      attempts
                    </small>
                    <small>
                      {c.workout.replace(/\s+/g, " ").slice(0, 100)}
                      {c.workout.length > 100 ? "…" : ""}
                    </small>
                  </span>
                </button>
              ))
          ) : (
            <p>
              No CHOW scores yet. Tap a CHOW badge in your weekly workout to
              record your first attempt.
            </p>
          )}
        </>
      ) : (
        <>
          {!challenge && (
            <button
              className="text-button"
              onClick={() => {
                setSelected(null);
                setError("");
                setNotice("");
              }}
            >
              <ArrowLeft size={16} />
              All CHOWs
            </button>
          )}
          <h2>CHOW · Station {selected.station}</h2>
          <p className="small muted">
            {selected.block} · Week of {formatDate(selected.weekBeginning)}
          </p>
          <p className="chow-workout">{selected.workout}</p>
          <div className="chow-best">
            <Trophy size={20} />
            <span>
              Your best
              <strong>
                {best === null ? "No score yet" : `${number(best)} ${unit}`}
              </strong>
              <small>For this challenge in {unit}</small>
            </span>
          </div>
          <fieldset disabled={busy} className="chow-fieldset">
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setError("");
                const value = score.trim() === "" ? NaN : Number(score);
                if (
                  !Number.isFinite(value) ||
                  value < 0 ||
                  value > 1000000 ||
                  Math.abs(value * 100 - Math.round(value * 100)) > 0.000001
                ) {
                  setError(
                    "Enter a score from 0 to 1,000,000 with up to two decimal places.",
                  );
                  return;
                }
                if (
                  date > today ||
                  date < selected.weekBeginning ||
                  date > shiftDate(selected.weekBeginning, 6)
                ) {
                  setError(
                    "Choose a date in this challenge’s week, today or earlier.",
                  );
                  return;
                }
                const original = data.scores.find((s) => s.id === editing);
                const record = {
                  id: editing ?? crypto.randomUUID(),
                  challengeId: selected.id,
                  date,
                  score: value,
                  unit,
                  createdAt: original?.createdAt ?? new Date().toISOString(),
                };
                const next: ChowLogData = {
                  version: 1,
                  challenges: data.challenges.some((c) => c.id === selected.id)
                    ? data.challenges
                    : [...data.challenges, selected],
                  scores: editing
                    ? data.scores.map((s) => (s.id === editing ? record : s))
                    : [...data.scores, record],
                };
                if (await save(next)) {
                  setScore("");
                  setEditing(null);
                  setNotice(
                    editing ? "CHOW score updated." : "CHOW score saved.",
                  );
                }
              }}
            >
              <h3>{editing ? "Edit your attempt" : "Record your score"}</h3>
              <label>
                Attempt date
                <input
                  type="date"
                  required
                  min={selected.weekBeginning}
                  max={
                    today < shiftDate(selected.weekBeginning, 6)
                      ? today
                      : shiftDate(selected.weekBeginning, 6)
                  }
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <div className="chow-score-fields">
                <label>
                  Total score
                  <input
                    type="number"
                    inputMode="decimal"
                    required
                    min="0"
                    max="1000000"
                    step="0.01"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder="e.g. 120"
                  />
                </label>
                <label>
                  Unit
                  <select
                    aria-label="Score unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as ChowUnit)}
                  >
                    {chowUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="small muted">
                Record your total for the round. Higher is better; personal
                bests compare the same challenge and unit.
              </p>
              <button
                className="primary"
                disabled={today < selected.weekBeginning}
              >
                <Check size={16} />
                {busy
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Save CHOW score"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setEditing(null);
                    setScore("");
                  }}
                >
                  Cancel edit
                </button>
              )}
            </form>
          </fieldset>
          {notice && (
            <p role="status" className="training-notice">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <section className="chow-history" aria-label="CHOW attempt history">
            <h3>Your attempts</h3>
            {!history.length ? (
              <p className="small muted">
                Your first score starts your history.
              </p>
            ) : (
              history.map((s) => (
                <div className="chow-attempt" key={s.id}>
                  <span>
                    <strong>
                      {number(s.score)} {s.unit}
                    </strong>
                    <small>
                      {formatDate(s.date, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </small>
                  </span>
                  <div>
                    <button
                      className="icon-button"
                      disabled={busy}
                      aria-label={`Edit CHOW score ${number(s.score)} ${s.unit}`}
                      onClick={() => {
                        setEditing(s.id);
                        setScore(String(s.score));
                        setDate(s.date);
                        setUnit(s.unit);
                        setNotice("");
                        setError("");
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={busy}
                      aria-label={`Delete CHOW score ${number(s.score)} ${s.unit}`}
                      onClick={() => setDeleting(s.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {deleting === s.id && (
                    <div className="chow-delete">
                      <p>Delete this score?</p>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => setDeleting(null)}
                      >
                        Keep score
                      </button>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await save({
                              ...data,
                              scores: data.scores.filter(
                                (record) => record.id !== s.id,
                              ),
                            })
                          ) {
                            setDeleting(null);
                            if (editing === s.id) {
                              setEditing(null);
                              setScore("");
                            }
                            setNotice("CHOW score deleted.");
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
          </section>
          <p className="small muted">Saved to your member account.</p>
        </>
      )}
    </div>
  );
}
export function ChowDialog({
  challenge,
  onClose,
}: {
  challenge: ChowSeed;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger =
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
      aria-label={`Record CHOW score for Station ${challenge.station}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        className="icon-button chow-close"
        aria-label="Close CHOW scores"
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <ChowScores challenge={challenge} />
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
