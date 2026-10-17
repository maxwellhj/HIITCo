import { Flame, Target, TrendingUp, Trophy } from "lucide-react";
import { Card } from "../components/UI";
import { attendanceStats, formatDate } from "../domain/attendance";
import type { DemoData, MemberProfile } from "../domain/models";
export function Progress({
  member,
  data,
}: {
  member: MemberProfile;
  data: DemoData;
}) {
  const s = attendanceStats(member, data.attendance),
    max = Math.max(member.weeklyTarget, ...s.chart.map((w) => w.count), 1);
  return (
    <>
      <div className="stats-grid">
        {[
          { label: "Lifetime workouts", value: s.total, icon: Trophy },
          {
            label: "Current weekly streak",
            value: `${s.streak} weeks`,
            icon: Flame,
          },
          {
            label: "Longest weekly streak",
            value: s.longest === null ? "Not available" : `${s.longest} weeks`,
            icon: TrendingUp,
          },
          {
            label: "Weekly target",
            value: `${member.weeklyTarget} visits`,
            icon: Target,
          },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <Icon className="blue" size={22} />
            <strong>{value}</strong>
            <span>{label}</span>
          </Card>
        ))}
      </div>
      <Card className="chart-card">
        <div className="section-top">
          <div>
            <h2>Your consistency, in colour.</h2>
            <p>Weekly attendance · last six weeks</p>
          </div>
          <span className="pill">TARGET: {member.weeklyTarget} / WEEK</span>
        </div>
        <div className="chart">
          <div
            className="chart-target"
            style={{ bottom: `${(member.weeklyTarget / max) * 150 + 30}px` }}
          >
            <span>Current target</span>
          </div>
          {s.chart.map((w, i) => (
            <div className="chart-column" key={w.week}>
              <strong>{w.count}</strong>
              <div
                className={i === 5 ? "bar current" : "bar"}
                style={{ height: `${(w.count / max) * 150}px`, minHeight: 3 }}
              />
              <span>{formatDate(w.week)}</span>
            </div>
          ))}
        </div>
        <p className="small muted">
          Weeks start Monday in Pacific/Auckland. Target line shows your current
          target, not historical targets.
        </p>
      </Card>
      <Card className="achievements">
        <h2>
          <Trophy size={20} /> The milestones you’ve earned
        </h2>
        <p>Every visit is part of your story. Next up: {s.next} workouts.</p>
        <div className="badges">
          {[...s.achieved, s.next].map((n) => (
            <div
              className={`achievement ${n === s.next ? "locked" : ""}`}
              key={n}
            >
              <Trophy />
              <strong>{n}</strong>
              <span>{n === s.next ? `${n - s.total} to go` : "ACHIEVED"}</span>
            </div>
          ))}
        </div>
        {!s.achieved.length && (
          <p>Your first milestone is waiting at 50 visits. Keep showing up.</p>
        )}
      </Card>
    </>
  );
}
