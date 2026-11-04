import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Card } from "../components/UI";
import { dateKey, formatDate, shiftDate } from "../domain/attendance";
import {
  goalWeek,
  habitDays,
  habitScheduled,
  parseGoals,
  type GoalsLog,
  type MemberGoal,
} from "../domain/goals";
import { memberApi, MemberApiError } from "./api";
import "./goals.css";
export function MemberGoals() {
  const [log, setLog] = useState<GoalsLog | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<MemberGoal | null>(null),
    [day, setDay] = useState(dateKey(new Date())),
    [attempt, setAttempt] = useState(0);
  const [today, setToday] = useState(dateKey(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setToday(dateKey(new Date())), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    memberApi("goals", undefined, abort.signal)
      .then((r) => {
        if (!abort.signal.aborted) {
          setLog(parseGoals(r.log, dateKey(new Date())));
          setRevision(r.revision as number);
          setError("");
        }
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError("Couldn’t load your goals. Please try again.");
      });
    return () => abort.abort();
  }, [attempt]);
  async function save(next: GoalsLog) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const r = await memberApi("goals", { log: next, revision });
      setLog(next);
      setRevision(r.revision as number);
      return true;
    } catch (e) {
      setError(
        e instanceof MemberApiError && e.status === 409
          ? "Your goals changed on another device. Reload goals before trying again."
          : e instanceof MemberApiError && e.status === 401
            ? "Please sign in again to save your goals."
            : "Couldn’t save your changes. Please try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const week = goalWeek(day);
  return (
    <div className="member-goals">
      {error && (
        <div role="alert" className="error">
          {error}{" "}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setAttempt((v) => v + 1)}
          >
            Reload goals
          </button>
        </div>
      )}
      {!log && !error && <p role="status">Loading your goals…</p>}
      {log?.goals.map((goal) => (
        <Card key={goal.id} className="goal-card">
          <div className="section-top">
            <h2>{goal.title}</h2>
            <button
              className="icon-button"
              aria-label={`Edit ${goal.title}`}
              disabled={busy}
              onClick={() => setEditor(structuredClone(goal))}
            >
              <Pencil size={17} />
            </button>
          </div>
          <p className="small muted">
            Target:{" "}
            {formatDate(goal.targetDate, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          {goal.habits.length > 0 && (
            <>
              <div className="goal-date">
                <button
                  className="icon-button"
                  aria-label="Previous day"
                  onClick={() => setDay(shiftDate(day, -1))}
                >
                  <ChevronLeft size={18} />
                </button>
                <label>
                  Habit day
                  <input
                    type="date"
                    value={day}
                    max={today}
                    onChange={(e) => {
                      if (e.target.value && e.target.value <= today)
                        setDay(e.target.value);
                    }}
                  />
                </label>
                <button
                  className="icon-button"
                  aria-label="Next day"
                  disabled={day >= today}
                  onClick={() => setDay(shiftDate(day, 1))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="habit-week" aria-label="Select habit date">
                {week.map((d, i) => (
                  <button
                    key={d}
                    aria-pressed={day === d}
                    disabled={d > today}
                    onClick={() => setDay(d)}
                  >
                    <span>{habitDays[i]}</span>
                    <small>{Number(d.slice(-2))}</small>
                  </button>
                ))}
              </div>
              {goal.habits.map((h) => {
                const available =
                  day >= goal.createdDate && habitScheduled(h, day);
                return (
                  <label
                    className={`habit-check ${available ? "" : "habit-off"}`}
                    key={h.id}
                  >
                    <input
                      type="checkbox"
                      checked={h.completed.includes(day)}
                      disabled={busy || !available || day > today}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        void save({
                          goals: log.goals.map((g) =>
                            g.id !== goal.id
                              ? g
                              : {
                                  ...g,
                                  habits: g.habits.map((item) =>
                                    item.id !== h.id
                                      ? item
                                      : {
                                          ...item,
                                          completed: checked
                                            ? [...item.completed, day]
                                            : item.completed.filter(
                                                (d) => d !== day,
                                              ),
                                        },
                                  ),
                                },
                          ),
                        });
                      }}
                    />
                    <span>
                      {h.title}
                      <small>
                        {day < goal.createdDate
                          ? "Before this goal started"
                          : !available
                            ? "Not scheduled for this day"
                            : h.completed.includes(day)
                              ? "Completed"
                              : "Not completed"}
                      </small>
                    </span>
                  </label>
                );
              })}
            </>
          )}
        </Card>
      ))}
      {log && (
        <button
          className="goal-add"
          aria-label="Add a goal"
          disabled={busy || log.goals.length >= 50}
          onClick={() =>
            setEditor({
              id: crypto.randomUUID(),
              title: "",
              targetDate: "",
              createdDate: today,
              habits: [],
            })
          }
        >
          <Plus size={22} />
        </button>
      )}
      {editor && log && (
        <GoalEditor
          goal={editor}
          busy={busy}
          error={error}
          onClose={() => setEditor(null)}
          onSave={async (goal) => {
            if (
              await save({
                goals: log.goals.some((g) => g.id === goal.id)
                  ? log.goals.map((g) => (g.id === goal.id ? goal : g))
                  : [...log.goals, goal],
              })
            )
              setEditor(null);
          }}
          onDelete={
            log.goals.some((g) => g.id === editor.id)
              ? async () => {
                  if (
                    confirm("Delete this goal and its habit history?") &&
                    (await save({
                      goals: log.goals.filter((g) => g.id !== editor.id),
                    }))
                  )
                    setEditor(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
function GoalEditor({
  goal,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  goal: MemberGoal;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (goal: MemberGoal) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(goal),
    [validation, setValidation] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return createPortal(
    <dialog
      className="chow-dialog goal-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.habits.some((h) => !h.days.length)) {
            setValidation("Choose at least one day for each habit.");
            return;
          }
          setValidation("");
          void onSave({
            ...draft,
            title: draft.title.trim(),
            habits: draft.habits.map((h) => ({ ...h, title: h.title.trim() })),
          });
        }}
      >
        <div className="section-top">
          <h2>{onDelete ? "Edit goal" : "Set a goal"}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close goal editor"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <label>
          Goal title
          <input
            autoFocus
            required
            maxLength={160}
            value={draft.title}
            placeholder="Lose 10 kilos"
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label>
          Target achievement date
          <input
            type="date"
            required
            value={draft.targetDate}
            onChange={(e) => setDraft({ ...draft, targetDate: e.target.value })}
          />
        </label>
        <div className="section-top">
          <h3>
            Habits{" "}
            <span className="small muted">
              (optional · {draft.habits.length}/5)
            </span>
          </h3>
          <button
            type="button"
            className="text-button"
            disabled={busy || draft.habits.length >= 5}
            onClick={() =>
              setDraft({
                ...draft,
                habits: [
                  ...draft.habits,
                  {
                    id: crypto.randomUUID(),
                    title: "",
                    days: [0, 1, 2, 3, 4, 5, 6],
                    completed: [],
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            Add habit
          </button>
        </div>
        {draft.habits.map((h, index) => (
          <fieldset key={h.id}>
            <legend>Habit {index + 1}</legend>
            <div className="goal-habit-title">
              <input
                aria-label={`Habit ${index + 1} title`}
                required
                maxLength={120}
                value={h.title}
                placeholder="10,000 steps"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    habits: draft.habits.map((v) =>
                      v.id === h.id ? { ...v, title: e.target.value } : v,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove habit ${index + 1}`}
                disabled={busy}
                onClick={() =>
                  setDraft({
                    ...draft,
                    habits: draft.habits.filter((v) => v.id !== h.id),
                  })
                }
              >
                <X size={17} />
              </button>
            </div>
            <div
              className="habit-days"
              role="group"
              aria-label={`Days for habit ${index + 1}`}
            >
              {habitDays.map((name, i) => (
                <button
                  type="button"
                  key={name}
                  aria-pressed={h.days.includes(i)}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      habits: draft.habits.map((v) =>
                        v.id === h.id
                          ? {
                              ...v,
                              days: v.days.includes(i)
                                ? v.days.filter((d) => d !== i)
                                : [...v.days, i],
                            }
                          : v,
                      ),
                    })
                  }
                >
                  {name}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        {(validation || error) && (
          <p className="error" role="alert">
            {validation || error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save goal"}
        </button>
        {onDelete && (
          <button
            type="button"
            className="text-button error"
            disabled={busy}
            onClick={() => void onDelete()}
          >
            Delete goal
          </button>
        )}
      </form>
    </dialog>,
    document.body,
  );
}
