import { useState } from "react";
import { CalendarDays, Check, Clock, X } from "lucide-react";
import { Card } from "./UI";
import {
  attendanceVisits,
  dateKey,
  formatDate,
  shiftDate,
  weekKey,
} from "../domain/attendance";
import type { AttendanceEvent } from "../domain/models";
export function AttendanceWeek({
  memberId,
  events,
}: {
  memberId: string;
  events: AttendanceEvent[];
}) {
  const today = dateKey(new Date()),
    currentWeek = weekKey(today);
  const [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<string | null>(null);
  const week = shiftDate(currentWeek, -offset * 7);
  const visits = attendanceVisits(events, memberId);
  const weekVisits = visits.filter(
    (v) => weekKey(dateKey(v.occurredAt)) === week,
  );
  const selectedVisits = selected
    ? visits.filter((v) => dateKey(v.occurredAt) === selected)
    : [];
  return (
    <Card className="home-attendance">
      <div className="section-top">
        <h2>
          <CalendarDays size={16} />
          Club sign-ins
        </h2>
        <span>
          {formatDate(week)} – {formatDate(shiftDate(week, 6))}
        </span>
      </div>
      <div
        className="attendance-weeks"
        role="group"
        aria-label="Attendance week"
      >
        {["This week", "Last week", "2 weeks ago"].map((label, i) => (
          <button
            key={label}
            aria-pressed={offset === i}
            onClick={() => {
              setOffset(i);
              setSelected(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="attendance-days"
        role="group"
        aria-label="Daily club sign-ins"
      >
        {["M", "T", "W", "T", "F", "S", "S"].map((label, i) => {
          const day = shiftDate(week, i),
            count = weekVisits.filter(
              (v) => dateKey(v.occurredAt) === day,
            ).length;
          return (
            <button
              key={day}
              className={`${count ? "attended" : ""} ${day === today ? "today" : ""}`}
              aria-pressed={selected === day}
              aria-current={day === today ? "date" : undefined}
              aria-label={`${formatDate(day, { weekday: "long", day: "numeric", month: "long" })}: ${count} sign-in${count === 1 ? "" : "s"}`}
              onClick={() => setSelected(selected === day ? null : day)}
            >
              <span>{label}</span>
              <strong>
                {count ? <Check size={15} /> : Number(day.slice(-2))}
              </strong>
            </button>
          );
        })}
      </div>
      <p className="attendance-hint">
        {weekVisits.length} visit{weekVisits.length === 1 ? "" : "s"} · Tap a
        day for times · NZ time
      </p>
      {selected && (
        <section
          className="signin-details"
          aria-label="Selected day sign-ins"
          aria-live="polite"
        >
          <div className="section-top">
            <h3>
              {formatDate(selected, {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </h3>
            <button
              className="icon-button"
              aria-label="Close sign-in details"
              onClick={() => setSelected(null)}
            >
              <X size={15} />
            </button>
          </div>
          {selectedVisits.length ? (
            <ul>
              {selectedVisits.map((visit) => (
                <li key={visit.id}>
                  <Clock size={15} />
                  <span>
                    <strong>
                      Signed in at{" "}
                      <time dateTime={visit.occurredAt}>
                        {formatDate(visit.occurredAt, {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </time>
                    </strong>
                    {visit.reference && (
                      <small>Reference: {visit.reference}</small>
                    )}
                    <small>
                      {visit.source === "gymmaster"
                        ? "GymMaster attendance record"
                        : visit.source === "demo"
                          ? "Demo attendance record"
                          : "Club attendance record"}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No recorded sign-ins on this day.</p>
          )}
        </section>
      )}
      <p className="attendance-source">
        Demo check-ins · GymMaster isn’t connected yet.
      </p>
    </Card>
  );
}
