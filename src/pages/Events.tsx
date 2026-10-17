import { useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Backpack,
} from "lucide-react";
import { Card } from "../components/UI";
import { clubEvents, eventsAreDemo } from "../data/events";
import { dateKey, formatDate } from "../domain/attendance";
import {
  calendarDays,
  monthStart,
  moveMonth,
  upcomingEvents,
} from "../domain/events";

export function Events() {
  const today = dateKey(new Date());
  const upcoming = upcomingEvents(clubEvents, today);
  const [selected, setSelected] = useState(upcoming[0]?.date ?? today);
  const [month, setMonth] = useState(monthStart(upcoming[0]?.date ?? today));
  const detailsRef = useRef<HTMLElement>(null);
  const selectedEvents = clubEvents.filter((event) => event.date === selected);
  function selectDate(date: string) {
    setSelected(date);
    setMonth(monthStart(date));
  }
  function changeMonth(offset: number) {
    const next = moveMonth(month, offset);
    setMonth(next);
    setSelected(monthStart(today) === next ? today : next);
  }
  return (
    <div className="events-space">
      {eventsAreDemo && (
        <p className="events-demo">
          <span className="pill">DEMO EVENTS</span> Sample events to try the
          calendar. These are not scheduled club events.
        </p>
      )}
      <div className="events-layout">
        <Card className="event-calendar">
          <div className="calendar-toolbar">
            <h2 aria-live="polite">
              {formatDate(month, { month: "long", year: "numeric" })}
            </h2>
            <div>
              <button
                className="icon-button"
                aria-label="Previous month"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="icon-button"
                aria-label="Next month"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
              <span key={i}>{day}</span>
            ))}
          </div>
          <div
            className="calendar-dates"
            role="group"
            aria-label={formatDate(month, { month: "long", year: "numeric" })}
          >
            {calendarDays(month).map((date, i) => {
              if (!date) return <span key={`blank-${i}`} aria-hidden="true" />;
              const count = clubEvents.filter((e) => e.date === date).length;
              return (
                <button
                  key={date}
                  type="button"
                  className={selected === date ? "selected" : ""}
                  aria-pressed={selected === date}
                  aria-current={date === today ? "date" : undefined}
                  aria-label={`${formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${count ? `, ${count} event${count === 1 ? "" : "s"}` : ", no events"}`}
                  onClick={() => setSelected(date)}
                >
                  <span>{Number(date.slice(-2))}</span>
                  <span className="calendar-markers" aria-hidden="true">
                    {count > 0 && <i />}
                    {count > 1 && <i />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span>
              <i /> Club event
            </span>
            <button className="text-button" onClick={() => selectDate(today)}>
              Today
            </button>
          </div>
          <p className="small muted">
            Tap a date for details · New Zealand time
          </p>
        </Card>
        <section
          className="event-detail-panel"
          ref={detailsRef}
          aria-labelledby="selected-date-title"
          aria-live="polite"
        >
          <h2 id="selected-date-title">
            {formatDate(selected, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h2>
          {selectedEvents.length ? (
            selectedEvents.map((event) => (
              <Card className="event-detail" key={event.id}>
                <span className="pill">
                  {event.date < today ? "PAST EVENT" : "CLUB EVENT"}
                </span>
                <h3>{event.title}</h3>
                <div className="event-facts">
                  <p>
                    <Clock size={16} />
                    {event.time} <span className="muted">NZ time</span>
                  </p>
                  <p>
                    <MapPin size={16} />
                    {event.location}
                  </p>
                </div>
                <h4>About this event</h4>
                <p>{event.description}</p>
                <div className="event-bring">
                  <Backpack size={18} />
                  <p>{event.bring}</p>
                </div>
              </Card>
            ))
          ) : (
            <Card className="event-empty">
              <CalendarDays size={28} />
              <h3>No events on this day.</h3>
              <p>Choose a marked date or browse the upcoming events below.</p>
            </Card>
          )}
        </section>
      </div>
      <section
        className="events-upcoming"
        aria-labelledby="upcoming-events-title"
      >
        <h2 id="upcoming-events-title">Upcoming club events</h2>
        {upcoming.length ? (
          <div className="event-list">
            {upcoming.map((event) => (
              <button
                className={`event-list-item ${selected === event.date ? "selected" : ""}`}
                key={event.id}
                onClick={() => {
                  selectDate(event.date);
                  requestAnimationFrame(() =>
                    detailsRef.current?.scrollIntoView({
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "instant"
                        : "smooth",
                      block: "start",
                    }),
                  );
                }}
                aria-label={`View ${event.title}, ${formatDate(event.date)}`}
              >
                <span className="event-date-tile">
                  <strong>{Number(event.date.slice(-2))}</strong>
                  <span>{formatDate(event.date, { month: "short" })}</span>
                </span>
                <span className="event-list-copy">
                  <strong>{event.title}</strong>
                  <span>{event.time}</span>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <Card>
            <p>No upcoming events just yet. Check back soon.</p>
          </Card>
        )}
      </section>
    </div>
  );
}
