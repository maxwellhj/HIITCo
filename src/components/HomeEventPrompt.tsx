import { useRef, useState } from "react";
import { Bell, ArrowRight, X } from "lucide-react";
import type { ClubContent } from "../domain/club";
import { upcomingEvents } from "../domain/events";
import { formatDate } from "../domain/attendance";
import { eventTimeLabel } from "../domain/club";
export function HomeEventPrompt({
  club,
  dismiss,
}: {
  club: ClubContent | null;
  dismiss: (id: string) => Promise<void>;
}) {
  const pending = upcomingEvents(club?.events ?? []).filter(
    (e) =>
      !club?.dismissedEventIds?.includes(e.id) &&
      !club?.eventResponses?.some((r) => r.eventId === e.id),
  );
  const event = pending[0];
  const start = useRef<{ x: number; y: number } | null>(null),
    suppress = useRef(false);
  const [drag, setDrag] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function remove() {
    if (!event || busy) return;
    setBusy(true);
    setError("");
    try {
      await dismiss(event.id);
    } catch {
      setError("Couldn’t dismiss this prompt. Please try again.");
    } finally {
      setDrag(0);
      setBusy(false);
    }
  }
  if (!event) return null;
  return (
    <div className="home-event-prompt-viewport">
      <section
        className="home-event-notification"
        aria-label="Club event response reminder"
        style={{
          transform: `translateX(${drag}px)`,
          opacity: Math.max(0.4, 1 - Math.abs(drag) / 400),
        }}
        onPointerDown={(e) => {
          if (!busy) {
            start.current = { x: e.clientX, y: e.clientY };
            suppress.current = false;
          }
        }}
        onPointerMove={(e) => {
          if (!start.current || busy) return;
          const dx = e.clientX - start.current.x,
            dy = e.clientY - start.current.y;
          if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 12) {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrag(dx);
            suppress.current = true;
          }
        }}
        onPointerUp={(e) => {
          if (!start.current) return;
          const dx = e.clientX - start.current.x,
            dy = e.clientY - start.current.y;
          start.current = null;
          if (Math.abs(dx) >= 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            suppress.current = true;
            void remove();
          } else {
            setDrag(0);
            suppress.current =
              Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5;
          }
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrag(0);
          suppress.current = false;
        }}
        onClickCapture={(e) => {
          if (suppress.current) {
            e.preventDefault();
            e.stopPropagation();
            suppress.current = false;
          }
        }}
      >
        <div className="event-notification-top">
          <span>
            <Bell size={16} /> CLUB EVENT
            {pending.length > 1
              ? ` · ${pending.length} awaiting a response`
              : ""}
          </span>
          <button
            className="icon-button"
            aria-label={`Dismiss reminder for ${event.title}`}
            disabled={busy}
            onClick={() => void remove()}
          >
            <X size={18} />
          </button>
        </div>
        <h2>{event.title}</h2>
        <p>
          {formatDate(event.date, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
          {event.time ? ` · ${eventTimeLabel(event.time)}` : ""}
        </p>
        <div className="event-notification-actions">
          <a
            className="primary"
            href={`#events/${encodeURIComponent(event.id)}`}
          >
            Respond to event <ArrowRight size={15} />
          </a>
          <small>{busy ? "Dismissing…" : "Swipe away to dismiss"}</small>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
