import {
  ArrowRight,
  Check,
  Dumbbell,
  Flame,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { Card } from "../components/UI";
import { attendanceStats, formatDate, shiftDate } from "../domain/attendance";
import type { DemoData, MemberProfile } from "../domain/models";
type Page = "home" | "workouts" | "progress" | "messages" | "staff";
export function HomePage({
  member,
  data,
  navigate,
}: {
  member: MemberProfile;
  data: DemoData;
  navigate: (p: Page) => void;
}) {
  const s = attendanceStats(member, data.attendance),
    remaining = Math.max(0, member.weeklyTarget - s.completed);
  return (
    <>
      <div className="home-grid">
        <Card className="goal-card">
          <div className="section-top">
            <h2>
              <Target size={19} /> Your weekly goal
            </h2>
            <span className="pill">THIS WEEK</span>
          </div>
          <div className="goal-body">
            <div
              className="progress-ring"
              style={{
                background: `conic-gradient(var(--blue) ${Math.min(s.percentage, 100)}%, #353d43 0)`,
              }}
              role="img"
              aria-label={`${s.completed} of ${member.weeklyTarget} workouts, ${s.percentage} percent`}
            >
              <div>
                <strong>
                  {s.completed}
                  <span> / {member.weeklyTarget}</span>
                </strong>
                <small>WORKOUTS</small>
              </div>
            </div>
            <div className="goal-copy">
              <span className="blue small-caps">
                {remaining ? "YOU’VE GOT THIS" : "GOAL ACHIEVED"}
              </span>
              <h3>
                {remaining ? (
                  <>
                    {remaining === 1 ? "One" : remaining} more.
                    <br />
                    You’re on your way.
                  </>
                ) : (
                  <>
                    That’s your goal.
                    <br />
                    Look at you go.
                  </>
                )}
              </h3>
              <p>
                {remaining
                  ? `Just ${remaining === 1 ? "one" : remaining} more workout${remaining === 1 ? "" : "s"} to hit your weekly goal.`
                  : "You showed up for yourself. Every extra visit is a bonus."}
              </p>
            </div>
          </div>
          <div className="week-days">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => {
              const day = shiftDate(s.currentWeek, i),
                attended = s.days.has(day);
              return (
                <div
                  key={i}
                  className={`${day === s.today ? "today" : ""} ${attended ? "attended" : ""}`}
                >
                  <span>{d}</span>
                  <div
                    aria-label={`${formatDate(day, { weekday: "long" })}: ${attended ? "attended" : "no visit"}`}
                  >
                    {attended ? <Check size={17} /> : Number(day.slice(-2))}
                  </div>
                  {day === s.today && <small>Today</small>}
                </div>
              );
            })}
          </div>
          <div className="card-bottom">
            <span>
              Week of {formatDate(s.currentWeek)} –{" "}
              {formatDate(shiftDate(s.currentWeek, 6))}
            </span>
            <span>Mon – Sun · NZ time</span>
          </div>
        </Card>
        <Card className="streak-card">
          <div className="section-top">
            <h2>
              <Flame size={19} /> Keep the fire going
            </h2>
            <Flame className="muted" size={22} />
          </div>
          <div className="streak-number">
            {s.streak}
            <span>week streak</span>
          </div>
          <p>
            {s.streak
              ? "A little consistency. A big difference. You’re building something good."
              : "Your next visit starts something good. We’ll see you on the floor."}
          </p>
          <div
            className="streak-weeks"
            aria-label="Attendance in the last six weeks"
          >
            {s.chart.map((w, i) => (
              <div
                key={w.week}
                className={w.count ? "lit" : ""}
                title={`Week of ${formatDate(w.week)}: ${w.count} visits`}
              >
                <Flame size={21} />
                <span>{i === 5 ? "NOW" : formatDate(w.week)}</span>
              </div>
            ))}
          </div>
          <div className="soft-note">
            <Sparkles size={16} />
            <span>One visit a week keeps your streak alive.</span>
          </div>
        </Card>
        <Card className="milestone-card">
          <div className="section-top">
            <h2>
              <Trophy size={19} /> Every workout counts
            </h2>
            <span className="pill">LIFETIME</span>
          </div>
          <div className="milestone-body">
            <div>
              <strong className="big-number">{s.total}</strong>
              <span className="muted"> workouts & counting</span>
            </div>
            <div className="milestone-medal">
              <Trophy size={28} />
              <span>{s.next}</span>
            </div>
          </div>
          <div className="progress-label">
            <span>
              Next stop: <strong>{s.next} workouts</strong>
            </span>
            <span className="blue">{s.next - s.total} to go</span>
          </div>
          <div className="progress-track">
            <div style={{ width: `${s.milestoneProgress}%` }} />
          </div>
          <p className="small">
            Every time you walk through the door, it adds up.
          </p>
        </Card>
        <Card className="last-visit">
          <div className="icon-tile">
            <Dumbbell size={23} />
          </div>
          <div>
            <span className="small-caps muted">LAST CLUB VISIT</span>
            <h3>
              {s.lastVisit
                ? formatDate(s.lastVisit, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : "Your first visit awaits"}
            </h3>
            <p>
              {s.lastVisit
                ? "Nice work showing up for yourself."
                : "Drop in during opening hours. We’ll help you get started."}
            </p>
            <span className="visit-note">
              <span className="status-dot" />{" "}
              {s.lastVisit
                ? "Club check-in · HIIT Co. Christchurch"
                : "No club check-ins yet"}
            </span>
          </div>
        </Card>
      </div>
      <div className="section-title">
        <h2>A little more from your club</h2>
        <span>GOOD ENERGY, ALL ROUND</span>
      </div>
      <div className="club-grid">
        <button
          className="feature-card workout-feature"
          onClick={() => navigate("workouts")}
        >
          <span className="small-caps">ON THE FLOOR</span>
          <div className="boxing-art" aria-hidden="true">
            <div />
            <div />
            <Zap size={66} />
          </div>
          <h3>
            Your next 30 minutes.
            <br />
            Make them count.
          </h3>
          <span>
            Explore your training <ArrowRight size={18} />
          </span>
        </button>
        <button
          className="feature-card progress-feature"
          onClick={() => navigate("progress")}
        >
          <span className="small-caps">THE BIGGER PICTURE</span>
          <TrendingUp className="feature-art" size={100} />
          <h3>
            Small steps.
            <br />
            Stronger you.
          </h3>
          <span>
            See your progress <ArrowRight size={18} />
          </span>
        </button>
        <button
          className="feature-card message-feature"
          onClick={() => navigate("messages")}
        >
          <span className="small-caps">FROM THE TEAM</span>
          <div className="quote-mark">“</div>
          <h3>
            You don’t have to be
            <br />
            great to get started.
          </h3>
          <span>
            A little encouragement <ArrowRight size={18} />
          </span>
        </button>
      </div>
    </>
  );
}
