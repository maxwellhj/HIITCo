import { useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Dumbbell,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { MemberProfile } from "../domain/models";
import { dateKey, formatDate } from "../domain/attendance";
import {
  exerciseProgress,
  heaviestSet,
  sessionVolume,
  validateSession,
  type TrainingLogData,
  type TrainingSession,
} from "../domain/training";
import { readTrainingLog, writeTrainingLog } from "../data/training";
import { Card } from "../components/UI";
import { TrainingChart } from "../components/TrainingChart";
const number = (value: number) =>
  value.toLocaleString("en-NZ", { maximumFractionDigits: 2 });
type DraftSet = { key: string; reps: string; weight: string };
const newSet = (): DraftSet => ({
  key: crypto.randomUUID(),
  reps: "",
  weight: "",
});
function load(memberId: string) {
  try {
    return { data: readTrainingLog(memberId), error: "" };
  } catch {
    return {
      data: null,
      error:
        "We couldn’t read your saved training log. Your existing data has been left untouched. Check that browser storage is available, then try again.",
    };
  }
}
export function TrainingLog({
  member,
  initialExerciseId = null,
  accountStorage,
}: {
  member: Pick<MemberProfile, "id" | "firstName">;
  initialExerciseId?: string | null;
  accountStorage?: {
    initial: TrainingLogData;
    save: (next: TrainingLogData) => Promise<void>;
  };
}) {
  const [state, setState] = useState(() =>
    accountStorage
      ? { data: accountStorage.initial, error: "" }
      : load(member.id),
  );
  const [exerciseId, setExerciseId] = useState<string | null>(
      initialExerciseId,
    ),
    [exerciseName, setExerciseName] = useState(""),
    [adding, setAdding] = useState(false),
    [search, setSearch] = useState("");
  const [date, setDate] = useState(dateKey(new Date())),
    [sets, setSets] = useState<DraftSet[]>(() => [newSet()]),
    [editing, setEditing] = useState<string | null>(null),
    [deleting, setDeleting] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const today = dateKey(new Date()),
    data = state.data,
    exercise = data?.exercises.find((e) => e.id === exerciseId);
  async function save(next: TrainingLogData) {
    setSaving(true);
    try {
      if (accountStorage) await accountStorage.save(next);
      else writeTrainingLog(member.id, next);
      setState({ data: next, error: "" });
    } finally {
      setSaving(false);
    }
  }
  function clearForm() {
    setDate(today);
    setSets([newSet()]);
    setEditing(null);
    setError("");
  }
  function openExercise(id: string) {
    setExerciseId(id);
    clearForm();
    setNotice("");
    setDeleting(null);
  }
  if (!data)
    return (
      <Card className="state">
        <h2>Your log is unavailable</h2>
        <p role="alert">{state.error}</p>
        <button className="primary" onClick={() => setState(load(member.id))}>
          Try again
        </button>
      </Card>
    );
  const stats = exercise ? exerciseProgress(data.sessions, exercise.id) : null;
  return (
    <fieldset className="training-space training-fieldset" disabled={saving}>
      {saving && <p role="status">Saving your log…</p>}
      <p className="training-local-note">
        Your log, {member.firstName} ·{" "}
        {accountStorage
          ? "Saved securely to your member account."
          : "Saved on this device only. It won’t sync between phones or browsers yet."}
      </p>
      {notice && (
        <div className="training-notice" role="status">
          <Check size={17} />
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss log notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {!exercise || !stats ? (
        <>
          <div className="training-list-top">
            <h2>Your exercises</h2>
            <button
              className="text-button"
              onClick={() => {
                setAdding(!adding);
                setError("");
              }}
            >
              <Plus size={17} /> Add exercise
            </button>
          </div>
          {adding && (
            <Card className="add-exercise">
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  setError("");
                  const name = exerciseName.trim().replace(/\s+/g, " ");
                  if (!name || name.length > 60) {
                    setError("Use an exercise name from 1 to 60 characters.");
                    return;
                  }
                  const duplicate = data.exercises.find(
                    (e) => e.name.toLowerCase() === name.toLowerCase(),
                  );
                  if (duplicate) {
                    setAdding(false);
                    setSearch("");
                    openExercise(duplicate.id);
                    return;
                  }
                  try {
                    const id = crypto.randomUUID();
                    await save({
                      ...data,
                      exercises: [...data.exercises, { id, name }],
                    });
                    setAdding(false);
                    setExerciseName("");
                    setSearch("");
                    openExercise(id);
                  } catch (err) {
                    setError(
                      accountStorage && err instanceof Error
                        ? err.message
                        : "Couldn’t save the exercise. Your changes are still here; try again.",
                    );
                  }
                }}
              >
                <label>
                  Exercise name
                  <input
                    autoFocus
                    required
                    maxLength={60}
                    placeholder="e.g. Romanian deadlift"
                    value={exerciseName}
                    onChange={(e) => setExerciseName(e.target.value)}
                  />
                </label>
                <button className="primary">Add exercise</button>
              </form>
            </Card>
          )}
          <label className="training-search">
            Find an exercise
            <input
              type="search"
              placeholder="Search exercises…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="exercise-list">
            {data.exercises
              .filter((e) =>
                e.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((item) => {
                const s = exerciseProgress(data.sessions, item.id);
                return (
                  <button
                    className="exercise-item"
                    key={item.id}
                    onClick={() => openExercise(item.id)}
                  >
                    <span className="icon-tile">
                      <Dumbbell size={21} />
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {s.history.length
                          ? `${s.history.length} session${s.history.length === 1 ? "" : "s"} · Best set ${number(s.bestWeight)} kg`
                          : "No sessions yet · Start your log"}
                      </small>
                    </span>
                    <ChevronRight size={19} />
                  </button>
                );
              })}
          </div>
          {!data.exercises.some((e) =>
            e.name.toLowerCase().includes(search.toLowerCase()),
          ) && (
            <Card className="state">
              <h3>No matching exercises</h3>
              <p>Try another name or add your own exercise.</p>
            </Card>
          )}
        </>
      ) : (
        <>
          <button
            className="text-button training-back"
            onClick={() => {
              setExerciseId(null);
              setError("");
              setNotice("");
            }}
          >
            <ArrowLeft size={17} /> All exercises
          </button>
          <div className="exercise-heading">
            <span className="icon-tile">
              <Dumbbell size={23} />
            </span>
            <div>
              <h2>{exercise.name}</h2>
              <p>
                {stats.history.length} recorded session
                {stats.history.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="training-stats">
            <Card>
              <span>Heaviest set</span>
              <strong>
                {stats.history.length ? number(stats.bestWeight) : "—"}
                <small> kg</small>
              </strong>
            </Card>
            <Card>
              <span>Latest session volume</span>
              <strong>
                {stats.history.length ? number(stats.latestVolume) : "—"}
                <small> kg</small>
              </strong>
            </Card>
          </div>
          <Card>
            <TrainingChart points={stats.points} />
            {stats.weightChange !== null && (
              <div className="training-change">
                <span>Since your first session</span>
                <strong>
                  {stats.weightChange > 0 ? "+" : ""}
                  {number(stats.weightChange)} kg heaviest set
                </strong>
                <strong>
                  {stats.volumeChange! > 0 ? "+" : ""}
                  {number(stats.volumeChange!)} kg volume
                </strong>
              </div>
            )}
          </Card>
          <Card className="session-form-card">
            <h2>
              <Pencil size={18} />
              {editing ? "Edit session" : "Record a session"}
            </h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setError("");
                setNotice("");
                try {
                  const original = data.sessions.find((s) => s.id === editing);
                  const session: TrainingSession = {
                    id: editing ?? crypto.randomUUID(),
                    exerciseId: exercise.id,
                    date,
                    createdAt: original?.createdAt ?? new Date().toISOString(),
                    sets: sets.map((s) => ({
                      reps: s.reps.trim() === "" ? NaN : Number(s.reps),
                      weight: s.weight.trim() === "" ? NaN : Number(s.weight),
                    })),
                  };
                  validateSession(session, today);
                  await save({
                    ...data,
                    sessions: editing
                      ? data.sessions.map((s) =>
                          s.id === editing ? session : s,
                        )
                      : [...data.sessions, session],
                  });
                  clearForm();
                  setNotice(
                    editing
                      ? "Session updated. Your charts are up to date."
                      : "Session saved. Your charts are up to date.",
                  );
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Couldn’t save this session. Please try again.",
                  );
                }
              }}
            >
              <label className="session-date">
                Workout date
                <input
                  type="date"
                  required
                  max={today}
                  min="2000-01-01"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <div className="set-labels" aria-hidden="true">
                <span>Set</span>
                <span>Reps</span>
                <span>Weight (kg)</span>
                <span />
              </div>
              {sets.map((set, index) => (
                <div className="set-inputs" key={set.key}>
                  <span>{index + 1}</span>
                  <input
                    aria-label={`Set ${index + 1} reps`}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="200"
                    step="1"
                    required
                    placeholder="8"
                    value={set.reps}
                    onChange={(e) =>
                      setSets((current) =>
                        current.map((s) =>
                          s.key === set.key
                            ? { ...s, reps: e.target.value }
                            : s,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`Set ${index + 1} weight in kilograms`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="1000"
                    step="any"
                    required
                    placeholder="40"
                    value={set.weight}
                    onChange={(e) =>
                      setSets((current) =>
                        current.map((s) =>
                          s.key === set.key
                            ? { ...s, weight: e.target.value }
                            : s,
                        ),
                      )
                    }
                  />
                  <button
                    className="icon-button"
                    type="button"
                    disabled={sets.length === 1}
                    aria-label={`Remove set ${index + 1}`}
                    onClick={() =>
                      setSets((current) =>
                        current.filter((s) => s.key !== set.key),
                      )
                    }
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
              <button
                className="text-button"
                type="button"
                disabled={sets.length >= 50}
                onClick={() => setSets((current) => [...current, newSet()])}
              >
                <Plus size={17} /> Add set
              </button>
              <p className="weight-help">
                Enter the total weight lifted, including the bar. Use 0 kg for
                bodyweight-only sets; volume tracks added weight only.
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="session-form-actions">
                <button className="primary">
                  <Check size={17} />
                  {editing ? "Save changes" : "Save session"}
                </button>
                {editing && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={clearForm}
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
          </Card>
          <section
            className="session-history"
            aria-labelledby="session-history-title"
          >
            <h2 id="session-history-title">Session history</h2>
            {!stats.history.length ? (
              <p className="history-empty">
                Nothing recorded yet. Add your first set above.
              </p>
            ) : (
              <div className="session-history-list">
                {[...stats.history].reverse().map((session) => (
                  <Card key={session.id} className="session-history-card">
                    <div className="section-top">
                      <h3>
                        {formatDate(session.date, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </h3>
                      <div>
                        <button
                          className="icon-button"
                          aria-label={`Edit session from ${formatDate(session.date)}`}
                          onClick={() => {
                            setEditing(session.id);
                            setDate(session.date);
                            setSets(
                              session.sets.map((s) => ({
                                key: crypto.randomUUID(),
                                reps: String(s.reps),
                                weight: String(s.weight),
                              })),
                            );
                            setError("");
                            setNotice("");
                            document
                              .querySelector(".session-form-card")
                              ?.scrollIntoView({
                                behavior: window.matchMedia(
                                  "(prefers-reduced-motion: reduce)",
                                ).matches
                                  ? "instant"
                                  : "smooth",
                              });
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete session from ${formatDate(session.date)}`}
                          onClick={() => {
                            setDeleting(session.id);
                            setError("");
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <ol>
                      {session.sets.map((set, i) => (
                        <li key={i}>
                          <span>Set {i + 1}</span>
                          <strong>
                            {set.reps} reps × {number(set.weight)} kg
                          </strong>
                        </li>
                      ))}
                    </ol>
                    <div className="session-totals">
                      <span>
                        Heaviest: {number(heaviestSet(session.sets))} kg
                      </span>
                      <strong>
                        Volume: {number(sessionVolume(session.sets))} kg
                      </strong>
                    </div>
                    {deleting === session.id && (
                      <div className="delete-session">
                        <p>Delete this session from your log?</p>
                        <button
                          className="secondary"
                          onClick={() => setDeleting(null)}
                        >
                          Keep session
                        </button>
                        <button
                          className="primary"
                          onClick={async () => {
                            try {
                              await save({
                                ...data,
                                sessions: data.sessions.filter(
                                  (s) => s.id !== session.id,
                                ),
                              });
                              if (editing === session.id) clearForm();
                              setDeleting(null);
                              setNotice(
                                "Session deleted. Your charts are up to date.",
                              );
                            } catch (err) {
                              setError(
                                accountStorage && err instanceof Error
                                  ? err.message
                                  : "Couldn’t delete this session. Please try again.",
                              );
                            }
                          }}
                        >
                          Delete session
                        </button>
                        {error && (
                          <p className="error" role="alert">
                            {error}
                          </p>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </fieldset>
  );
}
