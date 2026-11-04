import { HomeHabits } from "./HomeHabits";
import "./home.css";
import "../pages/events.css";
import { useState } from "react";
import { ArrowRight, ChevronDown, Flame, Trophy, X } from "lucide-react";
import { Card } from "../components/UI";
import { Bullseye } from "../components/Bullseye";
import { BoxingGlove } from "../components/BoxingGlove";
import { WeeklyWorkouts } from "../components/WeeklyWorkouts";
import { useClubContent } from "./useClubContent";
import { trainingDays } from "../domain/club";
import { dateKey, formatDate, weekKey } from "../domain/attendance";
import type { DailyVisits } from "../domain/gymmasterVisits";
import type { GymMasterMemberProfile } from "../domain/gymmasterProfile";
import { checkinTimeLabel, type MemberCheckin } from "../domain/checkinTimes";
import { memberAttendance, type StreakSummary } from "./attendance";
export function MemberDashboard({
  profile,
  days,
  streakSummary,
  attendanceError,
  checkins,
  checkinError,
  refresh,
  busy,
  progress = false,
  showStats = false,
}: {
  profile: GymMasterMemberProfile;
  days: DailyVisits[] | null;
  streakSummary: StreakSummary | null;
  attendanceError: string;
  checkins: MemberCheckin[] | null;
  checkinError: string;
  refresh: () => void;
  busy: boolean;
  progress?: boolean;
  showStats?: boolean;
}) {
  const { data: club } = useClubContent();
  const today = dateKey(new Date());
  const trained = trainingDays(days, checkins, today);
  const [week, setWeek] = useState(0),
    [selected, setSelected] = useState<{
      date: string;
      visits: number | null;
    } | null>(null);
  const stats =
      days === null
        ? checkins?.length
          ? memberAttendance([])
          : null
        : memberAttendance(days),
    current = stats?.weeks[0];
  const target = club?.weeklyTarget ?? null,
    total = profile.totalVisits,
    next =
      total === null
        ? null
        : ([50, 75, 100, 150, 200].find((level) => level > total) ??
          (Number.isSafeInteger((Math.floor(total / 100) + 1) * 100)
            ? (Math.floor(total / 100) + 1) * 100
            : null));
  const count = !current
    ? "—"
    : current.complete
      ? String(trained)
      : trained > 0
        ? `${trained}+`
        : "—";
  const streakCount = streakSummary ? streakSummary.count : stats?.streak;
  const streakExact = streakSummary ? streakSummary.exact : stats?.streakExact;
  const streak =
    streakCount == null ? "—" : `${streakCount}${streakExact ? "" : "+"}`;
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const selectedCheckins = selected
    ? (checkins?.filter((record) => record.date === selected.date) ?? [])
    : [];
  return (
    <div className="home-overview member-overview">
      {(progress || showStats) && (
        <div className="member-stats-dropdown" id="member-home-stats">
          <div className="home-stat-row">
            <Card className="home-stat goal-stat">
              <h2>
                <Bullseye size={18} />
                <span>Your weekly goal</span>
              </h2>
              <div
                className="progress-ring"
                style={{
                  background: `conic-gradient(var(--blue) ${Math.min(100, (target ? trained / target : 0) * 100)}%, var(--ring-track) 0)`,
                }}
                role="img"
                aria-label={
                  count === "—" || target === null
                    ? "Weekly attendance unavailable"
                    : `${count} training days recorded, weekly target ${target ?? "unavailable"}`
                }
              >
                <div>
                  <strong>
                    {count}
                    {target !== null && <span>/{target}</span>}
                  </strong>
                </div>
              </div>
              <p>
                {target === null
                  ? "Weekly target unavailable"
                  : !current
                    ? "Attendance unavailable"
                    : trained >= target
                      ? "Goal reached!"
                      : current.complete
                        ? `${target - trained} training days to go this week`
                        : "Waiting for complete data"}
              </p>
            </Card>
            <Card className="home-stat">
              <h2>
                <Flame size={17} />
                <span>Weekly streak</span>
              </h2>
              <div className="home-stat-value">
                <strong>{streak}</strong>
                <span>weeks</span>
              </div>
              <p>
                {streakCount == null
                  ? "Attendance unavailable"
                  : streakExact
                    ? "Consecutive attended weeks"
                    : "Confirmed weeks · limited history"}
              </p>
            </Card>
            <Card className="home-stat">
              <h2>
                <Trophy size={17} />
                <span>Next milestone</span>
              </h2>
              <div className="home-stat-value">
                <strong>{next ?? "—"}</strong>
                <span>visits</span>
              </div>
              <p>
                {next === null || total === null
                  ? "Total visits unavailable"
                  : `${next - total} to go · ${total} done`}
              </p>
            </Card>
          </div>
          <p className="small muted">
            Weekly target: {target ?? "—"} training days. Streaks count
            consecutive attended weeks. “+” means at least this many.
          </p>
        </div>
      )}
      {!progress && <HomeHabits />}
      {!progress && (
        <details className="card home-fold home-workout-fold">
          <summary>
            This week’s workouts
            <ChevronDown size={18} />
          </summary>
          <WeeklyWorkouts week={weekKey(today)} published />
        </details>
      )}
      <Card className="home-attendance">
        <div className="section-top">
          <button
            className="home-section-toggle"
            aria-expanded={attendanceOpen}
            aria-controls="home-attendance-content"
            onClick={() => setAttendanceOpen((v) => !v)}
          >
            Weekly club attendance
            <ChevronDown size={18} />
          </button>
          <button className="text-button" disabled={busy} onClick={refresh}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {stats && (
          <div className="member-week-tabs compact-week-tabs">
            {stats.weeks.map((w, i) => (
              <button
                key={w.start}
                className={
                  i === week && attendanceOpen ? "primary" : "secondary"
                }
                aria-expanded={i === week && attendanceOpen}
                aria-controls="home-attendance-content"
                onClick={() => {
                  setAttendanceOpen(i === week ? !attendanceOpen : true);
                  setWeek(i);
                  setSelected(null);
                }}
              >
                {["This week", "Last week", "2 weeks ago"][i]}
                <ChevronDown size={14} />
              </button>
            ))}
          </div>
        )}
        <div id="home-attendance-content" hidden={!attendanceOpen}>
          {attendanceError && (
            <p className="error" role="alert">
              {attendanceError}
            </p>
          )}
          {stats ? (
            <>
              <p className="small muted">
                Week of {formatDate(stats.weeks[week].start)} ·{" "}
                {stats.weeks[week].complete
                  ? `${stats.weeks[week].total} visits`
                  : stats.weeks[week].total > 0
                    ? `At least ${stats.weeks[week].total} visits; some dates weren’t returned`
                    : "Complete attendance not supplied"}
              </p>
              <div className="member-day-grid">
                {stats.weeks[week].days.map((day) => (
                  <button
                    className={`member-day ${(day.visits !== null && day.visits > 0) || checkins?.some((record) => record.date === day.date) ? "attended" : ""}`}
                    key={day.date}
                    disabled={day.future}
                    onClick={() => setSelected(day)}
                    aria-label={`${formatDate(day.date, { weekday: "long", day: "numeric", month: "long" })}, ${day.future ? "upcoming" : day.visits === null ? (checkins?.some((record) => record.date === day.date) ? "check-in time received; daily count pending" : "not returned") : `${day.visits} visits`}`}
                  >
                    <span>{formatDate(day.date, { weekday: "short" })}</span>
                    <small>{formatDate(day.date, { day: "numeric" })}</small>
                    <strong>
                      {day.future
                        ? "·"
                        : checkins?.some((record) => record.date === day.date)
                          ? "✓"
                          : day.visits === null
                            ? checkins?.some(
                                (record) => record.date === day.date,
                              )
                              ? "✓"
                              : "?"
                            : day.visits > 0
                              ? "✓"
                              : "0"}
                    </strong>
                  </button>
                ))}
              </div>
              {selected && (
                <div className="member-visit-detail" role="status">
                  <button
                    className="icon-button"
                    aria-label="Close visit details"
                    onClick={() => setSelected(null)}
                  >
                    <X size={16} />
                  </button>
                  <strong>
                    {formatDate(selected.date, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </strong>
                  <p>
                    {selected.visits === null
                      ? selectedCheckins.length > 0
                        ? "The daily visit count hasn’t updated for this date yet."
                        : "GymMaster didn’t return a daily count for this date. It doesn’t confirm zero visits."
                      : `GymMaster recorded ${selected.visits} ${selected.visits === 1 ? "visit" : "visits"}.`}
                  </p>
                  {selectedCheckins.length > 0 ? (
                    <>
                      {selected.visits === 0 && (
                        <p className="small muted">
                          The daily count may still be catching up to this
                          check-in.
                        </p>
                      )}
                      <p className="small muted">
                        Club check-in times · New Zealand time
                      </p>
                      <ul className="member-checkin-times">
                        {selectedCheckins.map((record) => (
                          <li key={record.id}>
                            <time dateTime={record.localTimestamp}>
                              {checkinTimeLabel(record.localTimestamp)}
                            </time>
                            <span>
                              {record.door ?? "Club check-in"}
                              <small>Ref {record.id}</small>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="small muted">
                        Only times received by this app are shown; this may not
                        be every visit.
                      </p>
                    </>
                  ) : checkinError ? (
                    <p className="error">{checkinError}</p>
                  ) : (
                    <p>
                      No check-in time has been received for this date. Older
                      visits may have a count but no arrival time.
                    </p>
                  )}
                </div>
              )}
            </>
          ) : !attendanceError ? (
            <p>Loading your attendance…</p>
          ) : (
            <p>Your total visits above remain available.</p>
          )}
          <p className="small muted">
            Weeks start Monday in New Zealand. GymMaster counts may take 10
            minutes to update. Missing dates aren’t treated as zero.
          </p>
        </div>
      </Card>
      {progress ? (
        <Card>
          <h2>Your milestones</h2>
          <p>
            {total === null || next === null
              ? "GymMaster hasn’t supplied a total visit count."
              : `${total} visits recorded. Your next milestone is ${next} visits.`}
          </p>
          <p>
            Longest streak and all-time attendance charts will need a verified
            history of visits.
          </p>
        </Card>
      ) : (
        <>
          <a className="home-library-button" href="#skills">
            <BoxingGlove size={25} />
            <span>
              Skills Library<small>Box · Lift · Sweat</small>
            </span>
            <ArrowRight size={18} />
          </a>
        </>
      )}
    </div>
  );
}
