import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Flame,
  LayoutDashboard,
  Search,
  X,
} from "lucide-react";
import { containDialog } from "../components/dialog";
import { Card } from "../components/UI";
import { attendanceStats, formatDate } from "../domain/attendance";
import type { DemoData } from "../domain/models";
export function Staff({
  data,
  onSave,
  onPreview,
}: {
  data: DemoData;
  onSave: (id: string, target: number) => Promise<void>;
  onPreview: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [target, setTarget] = useState(3),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const filtered = data.members.filter((m) =>
    `${m.firstName} ${m.lastName}`.toLowerCase().includes(query.toLowerCase()),
  );
  const chosen = data.members.find((m) => m.id === selected);
  useEffect(() => {
    if (!selected) return;
    return containDialog(() => {
      if (!saving) setSelected("");
    });
  }, [selected, saving]);
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">
          <span />
          STAFF SPACE
        </div>
        <h1>A stronger club starts here.</h1>
        <p>
          A little support makes a big difference. Help each member find their
          rhythm.
        </p>
      </div>
      <div className="demo-warning">
        <LayoutDashboard size={20} />
        <div>
          <strong>Demo staff mode</strong>
          <p>
            This is an open demonstration using fictional members. There is no
            secure sign-in. Changes are saved only in this browser.
          </p>
        </div>
      </div>
      <Card className="staff-card">
        <div className="section-top">
          <h2>
            Your members <span className="count">{data.members.length}</span>
          </h2>
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search members"
              placeholder="Search members…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>This week</th>
                <th>Weekly goal</th>
                <th>Streak</th>
                <th>Last visit</th>
                <th>Lifetime</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const s = attendanceStats(m, data.attendance);
                return (
                  <tr key={m.id}>
                    <td>
                      <button
                        className="member-cell"
                        onClick={() => {
                          setSelected(m.id);
                          setTarget(m.weeklyTarget);
                          setError("");
                        }}
                      >
                        <span className="avatar">{m.initials}</span>
                        <strong>
                          {m.firstName} {m.lastName}
                        </strong>
                      </button>
                    </td>
                    <td>
                      <span
                        className={`completion ${s.completed >= m.weeklyTarget ? "met" : ""}`}
                      >
                        {s.completed} / {m.weeklyTarget}{" "}
                        <small>({s.percentage}%)</small>
                      </span>
                    </td>
                    <td>{m.weeklyTarget} workouts</td>
                    <td>
                      <Flame size={14} /> {s.streak} weeks
                    </td>
                    <td>
                      {s.lastVisit ? formatDate(s.lastVisit) : "No visits"}
                    </td>
                    <td>{s.total}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelected(m.id);
                          setTarget(m.weeklyTarget);
                          setError("");
                        }}
                      >
                        Edit goal <ChevronRight size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="state">
              <Search />
              <h3>No members found</h3>
              <p>Try a different name.</p>
              <button className="secondary" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          )}
        </div>
      </Card>
      {chosen && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="target-title"
          >
            <button
              className="icon-button modal-close"
              onClick={() => setSelected("")}
              aria-label="Close member editor"
              disabled={saving}
            >
              <X />
            </button>
            <span className="avatar">{chosen.initials}</span>
            <h2 id="target-title">A goal for {chosen.firstName}.</h2>
            <p>
              Set a realistic weekly attendance target. Changes update the
              member’s home and progress screens immediately.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                setError("");
                try {
                  await onSave(chosen.id, target);
                  setSelected("");
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Could not save. Please try again.",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              <label className="field-label">
                Workouts per week
                <input
                  autoFocus
                  type="number"
                  min="1"
                  max="7"
                  step="1"
                  required
                  value={Number.isNaN(target) ? "" : target}
                  onChange={(e) => setTarget(e.target.valueAsNumber)}
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={saving}>
                {saving ? "Saving…" : "Save weekly target"}
                <Check size={18} />
              </button>
            </form>
            <button
              className="secondary"
              disabled={saving}
              onClick={() => onPreview(chosen.id)}
            >
              View member dashboard <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </>
  );
}
