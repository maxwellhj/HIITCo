import { ArrowRight, CalendarDays, Flame, Trophy } from "lucide-react";
import { BoxingGlove } from "../components/BoxingGlove";
import { Bullseye } from "../components/Bullseye";
import { AttendanceWeek } from "../components/AttendanceWeek";
import { WeeklyWorkouts } from "../components/WeeklyWorkouts";
import { clubEvents, eventsAreDemo } from "../data/events";
import { upcomingEvents } from "../domain/events";
import { Card } from "../components/UI";
import { attendanceStats, formatDate } from "../domain/attendance";
import type { DemoData, MemberProfile } from "../domain/models";
export function HomePage({
  member,
  data,
}: {
  member: MemberProfile;
  data: DemoData;
}) {
  const s = attendanceStats(member, data.attendance),
    remaining = Math.max(0, member.weeklyTarget - s.completed);
  const nextEvent = upcomingEvents(clubEvents, s.today)[0];
  return (
    <div className="home-overview">
      <div className="home-stat-row">
        <Card className="home-stat goal-stat">
          <h2>
            <Bullseye size={18} />
            <span>Your weekly goal</span>
          </h2>
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
                <span>/{member.weeklyTarget}</span>
              </strong>
            </div>
          </div>
          <p role="status">
            {remaining === 0
              ? "Ring complete!"
              : `${remaining} to go this week`}
          </p>
        </Card>
        <Card className="home-stat">
          <h2>
            <Flame size={17} />
            <span>Weekly streak</span>
          </h2>
          <div className="home-stat-value">
            <strong>{s.streak}</strong>
            <span>week{s.streak === 1 ? "" : "s"}</span>
          </div>
          <p>{s.streak ? "Keep it going." : "Start this week."}</p>
        </Card>
        <Card className="home-stat">
          <h2>
            <Trophy size={17} />
            <span>Next milestone</span>
          </h2>
          <div className="home-stat-value">
            <strong>{s.next}</strong>
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
            {s.next - s.total} to go · {s.total} done
          </p>
        </Card>
      </div>
      <AttendanceWeek memberId={member.id} events={data.attendance} />
      <WeeklyWorkouts week={s.currentWeek} />
      <Card className="club-events">
        <h2>
          <CalendarDays size={17} />
          Upcoming club events
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
      <a className="home-library-button" href="#skills">
        <BoxingGlove size={25} />
        <span>
          Skills Library<small>Box · Lift · Sweat</small>
        </span>
        <ArrowRight size={18} />
      </a>
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
