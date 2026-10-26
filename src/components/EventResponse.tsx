import { useEffect, useState } from "react";
import {
  eventResponseLabels,
  type EventResponseStatus,
  type ClubEvent,
} from "../domain/events";
import { eventCalendarFile, googleCalendarUrl } from "../domain/eventCalendar";
function CalendarLinks({ event }: { event: ClubEvent }) {
  const [file, setFile] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(
      new Blob([eventCalendarFile(event)], {
        type: "text/calendar;charset=utf-8",
      }),
    );
    setFile(url);
    return () => URL.revokeObjectURL(url);
  }, [
    event.id,
    event.title,
    event.description,
    event.date,
    event.time,
    event.location,
    event.bookingUrl,
  ]);
  return (
    <div className="event-calendar-links">
      <p className="small muted">Save this event to your calendar:</p>
      <a
        className="secondary"
        href={googleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Add to Google Calendar
      </a>
      <a
        className="secondary"
        href={file || undefined}
        download={"hiitco-" + event.id + ".ics"}
      >
        Add to Apple Calendar (.ics)
      </a>
      <small className="muted">
        {event.time
          ? "New Zealand time. No end time has been set; you can adjust it in your calendar."
          : "No time is set, so this is added as an all-day event."}{" "}
        Saved calendar copies won’t update automatically if the event changes.
      </small>
    </div>
  );
}
export function EventResponse({
  event,
  value,
  onRespond,
}: {
  event: ClubEvent;
  value?: EventResponseStatus;
  onRespond: (id: string, status: EventResponseStatus) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="event-rsvp">
      <h4>Your response</h4>
      <div
        className="event-rsvp-options"
        role="group"
        aria-label={"Your response to " + event.title}
      >
        {(["going", "maybe", "cant_attend"] as const).map((status) => (
          <button
            key={status}
            className={status}
            aria-pressed={value === status}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onRespond(event.id, status);
              } catch {
                setError("Couldn’t save your response. Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {eventResponseLabels[status]}
          </button>
        ))}
      </div>
      <p className="small muted" aria-live="polite">
        {busy
          ? "Saving your response…"
          : value
            ? "Your response: " + eventResponseLabels[value]
            : "Choose your response. You can change it later."}
      </p>
      {value === "going" && <CalendarLinks event={event} />}{" "}
      {!!event.bookingUrl && (
        <p className="small muted">
          If you’re going, use the booking link to reserve your place.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
