import {
  ArrowRight,
  CalendarDays,
  Check,
  Flame,
  Target,
  Trophy,
} from "lucide-react";
import { BoxingGlove } from "../components/BoxingGlove";
import { clubEvents, eventsAreDemo } from "../data/events";
import { upcomingEvents } from "../domain/events";
import { Card } from "../components/UI";
import { attendanceStats, formatDate, shiftDate } from "../domain/attendance";
import type { DemoData, MemberProfile } from "../domain/models";

export function HomePage({
  member,
  data,
}: {
  member: MemberProfile;
  data: DemoData;
}) {
  const s = attendanceStats(member, data.attendance);
  const remaining = Math.max(0, member.weeklyTarget - s.completed);
  const nextEvent = upcomingEvents(clubEvents, s.today)[0];
  return (
    <div className="home-overview">
      <Card className="weekly-goal">
        <div className="section-top">
          <h2>
            <Target size={19} /> Your weekly goal
          </h2>
          <span className="pill">THIS WEEK</span>
        </div>
        <div className="goal-focus">
          <div
            className="progress-ring"
            style={{
              background: `conic-gradient(var(--blue) ${Math.min(s.percentage, 100)}%, var(--ring-track) 0)`,
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
          <p className="goal-message" role="status">
            {remaining === 0
              ? "Ring complete. Weekly goal achieved!"
              : `${remaining === 1 ? "One" : remaining} more workout${remaining === 1 ? "" : "s"} to complete your ring.`}
          </p>
        </div>
        <div className="week-days">
          {["M", "T", "W", "T", "F", "S", "S"].map((dayLabel, i) => {
            const day = shiftDate(s.currentWeek, i);
            const attended = s.days.has(day);
            return (
              <div
                key={day}
                className={`${day === s.today ? "today" : ""} ${attended ? "attended" : ""}`}
              >
                <span>{dayLabel}</span>
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
            {formatDate(s.currentWeek)} –{" "}
            {formatDate(shiftDate(s.currentWeek, 6))}
          </span>
          <span>Mon – Sun · NZ time</span>
        </div>
      </Card>
      <div className="home-summary">
        <Card className="summary-card">
          <h2>
            <Flame size={17} /> Weekly streak
          </h2>
          <div className="summary-value">
            {s.streak}
            <span>{s.streak === 1 ? "week" : "weeks"}</span>
          </div>
          <p>{s.streak ? "Keep showing up." : "Start with your next visit."}</p>
        </Card>
        <Card className="summary-card">
          <h2>
            <Trophy size={17} /> Next milestone
          </h2>
          <div className="summary-value">
            {s.next}
            <span>workouts</span>
          </div>
          <div
            className="progress-track"
            role="img"
            aria-label={`${s.total} lifetime workouts, ${s.next - s.total} to the next milestone`}
          >
            <div style={{ width: `${s.milestoneProgress}%` }} />
          </div>
          <p>
            {s.next - s.total} to go · {s.total} completed
          </p>
        </Card>
      </div>
      <a className="home-library-button" href="#skills">
        <BoxingGlove size={25} />
        <span>
          Skills Library<small>Box · Lift · Sweat</small>
        </span>
        <ArrowRight size={18} />
      </a>
      <Card className="club-events">
        <h2>
          <CalendarDays size={18} /> Upcoming club events
        </h2>
        {nextEvent ? (
          <a className="home-next-event" href="#events">
            <span>
              <strong>{nextEvent.title}</strong>
              <small>
                {formatDate(nextEvent.date)} · {nextEvent.time}
                {eventsAreDemo ? " · Demo event" : ""}
              </small>
            </span>
            <ArrowRight size={17} />
          </a>
        ) : (
          <p>No upcoming events just yet.</p>
        )}
        <a className="text-button" href="#events">
          View calendar <ArrowRight size={15} />
        </a>
      </Card>
      <div className="home-details">
        <p>
          Last club visit:{" "}
          <strong>
            {s.lastVisit
              ? formatDate(s.lastVisit, { day: "numeric", month: "short" })
              : "No visits yet"}
          </strong>
        </p>
        <a href="#progress">
          View progress <ArrowRight size={16} />
        </a>
      </div>
    </div>
  );
}
