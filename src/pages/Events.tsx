import { EventResponse } from "../components/EventResponse";
import { useClubContent } from "../member/useClubContent";
import { eventTimeLabel } from "../domain/club";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Clock, MapPin, Backpack, X } from "lucide-react";
import { Card } from "../components/UI";
import { clubEvents as demoEvents } from "../data/events";
import { dateKey, formatDate } from "../domain/attendance";
import { upcomingEvents, eventResponseLabels } from "../domain/events";
import "./events.css";
function routeEvent() {
  const [page, id] = location.hash.slice(1).split("/");
  if (page !== "events" || !id) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return null;
  }
}
export function Events({ demo = false }: { demo?: boolean }) {
  const { data, error, reload, respond } = useClubContent(!demo);
  const events = demo ? demoEvents : (data?.events ?? []),
    today = dateKey(new Date());
  const upcoming = upcomingEvents(events, today);
  const [selected, setSelected] = useState<string | null>(routeEvent);
  const event = events.find((e) => e.id === selected),
    details = useRef<HTMLElement>(null),
    scrolled = useRef<string | null>(null);
  useEffect(() => {
    const change = () => setSelected(routeEvent());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (event && scrolled.current !== event.id) {
      scrolled.current = event.id;
      requestAnimationFrame(() => {
        details.current?.scrollIntoView({
          block: "start",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
        details.current?.focus({ preventScroll: true });
      });
    }
    if (!selected) scrolled.current = null;
  }, [event?.id, selected]);
  if (!demo && !data)
    return (
      <Card>
        <p role={error ? "alert" : "status"}>
          {error || "Loading club events…"}
        </p>
        {error && (
          <button className="secondary" onClick={reload}>
            Try again
          </button>
        )}
      </Card>
    );
  return (
    <div className="events-space events-list-first">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {demo && (
        <p className="events-demo">
          <span className="pill">DEMO EVENTS</span> Sample events. These are not
          scheduled club events.
        </p>
      )}
      <section
        className="events-upcoming"
        aria-labelledby="upcoming-events-title"
      >
        <h2 id="upcoming-events-title">Upcoming club events</h2>
        <p className="small muted">
          Choose an event to see the details and respond.
        </p>
        {upcoming.length ? (
          <div className="event-list">
            {upcoming.map((e) => {
              const status = data?.eventResponses?.find(
                (r) => r.eventId === e.id,
              )?.status;
              return (
                <button
                  className={`event-list-item ${selected === e.id ? "selected" : ""}`}
                  key={e.id}
                  aria-expanded={selected === e.id}
                  aria-controls="club-event-detail"
                  aria-label={`View ${e.title}, ${formatDate(e.date)}`}
                  onClick={() => {
                    setSelected(e.id);
                    location.hash = `events/${encodeURIComponent(e.id)}`;
                  }}
                >
                  <span className="event-date-tile">
                    <strong>{Number(e.date.slice(-2))}</strong>
                    <span>{formatDate(e.date, { month: "short" })}</span>
                  </span>
                  <span className="event-list-copy">
                    <strong>{e.title}</strong>
                    <span>
                      {eventTimeLabel(e.time)}
                      {e.time ? " · NZ time" : ""}
                    </span>
                    <small>
                      {status
                        ? `Your response: ${eventResponseLabels[status]}`
                        : "Response requested"}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              );
            })}
          </div>
        ) : (
          <Card>
            <p>No upcoming events just yet. Check back soon.</p>
          </Card>
        )}
      </section>
      {event && (
        <section
          id="club-event-detail"
          className="event-detail-panel"
          ref={details}
          tabIndex={-1}
          aria-labelledby="club-event-title"
        >
          <Card className="event-detail">
            <div className="section-top">
              <span className="pill">
                {event.date < today ? "PAST EVENT" : "CLUB EVENT"}
              </span>
              <button
                className="icon-button"
                aria-label="Close event details"
                onClick={() => {
                  setSelected(null);
                  location.hash = "events";
                }}
              >
                <X size={18} />
              </button>
            </div>
            <h2 id="club-event-title">{event.title}</h2>
            <div className="event-facts">
              <p>
                <Clock size={16} />
                {formatDate(event.date, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}{" "}
                · {eventTimeLabel(event.time)}
                {event.time ? " NZ time" : ""}
              </p>
              {event.location && (
                <p>
                  <MapPin size={16} />
                  {event.location}
                </p>
              )}
            </div>
            {!demo && (
              <EventResponse
                key={event.id}
                event={event}
                value={
                  data?.eventResponses?.find((r) => r.eventId === event.id)
                    ?.status
                }
                onRespond={respond}
              />
            )}
            <h4>About this event</h4>
            <p className="club-event-description">{event.description}</p>
            {event.bring && (
              <div className="event-bring">
                <Backpack size={18} />
                <p>{event.bring}</p>
              </div>
            )}
            {event.bookingUrl && (
              <a
                className="primary event-booking-link"
                href={event.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book this event
              </a>
            )}
          </Card>
        </section>
      )}
      {selected && !event && (
        <Card>
          <p>This event is no longer available.</p>
          <button
            className="secondary"
            onClick={() => {
              setSelected(null);
              location.hash = "events";
            }}
          >
            Back to upcoming events
          </button>
        </Card>
      )}
    </div>
  );
}
