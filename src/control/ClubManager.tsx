import { useEffect, useState } from "react";
import { Card } from "../components/UI";
import { controlApi } from "./api";
import { dateKey, formatDate } from "../domain/attendance";
import { eventTimeLabel, type ClubContent } from "../domain/club";
import type { ClubEvent } from "../domain/events";
const blank = () => ({
  id: crypto.randomUUID(),
  title: "",
  description: "",
  date: dateKey(new Date()),
  time: "",
  bookingUrl: "",
  location: "",
  bring: "",
});
export function ClubManager() {
  const [data, setData] = useState<ClubContent | null>(null),
    [form, setForm] = useState<ClubEvent>(blank),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [removing, setRemoving] = useState<string | null>(null);
  async function load(signal?: AbortSignal) {
    try {
      const next = await controlApi("club", undefined, signal);
      if (!signal?.aborted) {
        setData(next);
      }
    } catch {
      if (!signal?.aborted)
        setError("Couldn’t load club events. Please refresh.");
    }
  }
  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    return () => abort.abort();
  }, []);
  async function save(path: string, body: unknown, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await controlApi("club/" + path, body);
      await load();
      setMessage(success);
      return true;
    } catch {
      setError("Couldn’t save. Check the fields and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="control-club-layout">
      <Card>
        <h2>{editing ? "Edit club event" : "Add club event"}</h2>
        <p className="small muted">
          Saved events appear in the member calendar. Dates and times are in New
          Zealand time.
        </p>
        <form
          className="control-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await save(
                "events/save",
                form,
                editing ? "Event updated." : "Event added to the app calendar.",
              )
            ) {
              setForm(blank());
              setEditing(false);
            }
          }}
        >
          <label>
            Event title
            <input
              required
              maxLength={120}
              value={form.title}
              disabled={busy}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            Description
            <textarea
              required
              rows={4}
              maxLength={3000}
              value={form.description}
              disabled={busy}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <label>
            Event date
            <input
              required
              type="date"
              value={form.date}
              disabled={busy}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <label>
            Time (optional, NZ time)
            <input
              type="time"
              value={form.time}
              disabled={busy}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </label>
          <label>
            Booking URL (optional)
            <input
              type="url"
              maxLength={2000}
              placeholder="https://…"
              value={form.bookingUrl ?? ""}
              disabled={busy}
              onChange={(e) => setForm({ ...form, bookingUrl: e.target.value })}
            />
          </label>
          <button
            className="primary"
            disabled={
              busy || !data || !form.title.trim() || !form.description.trim()
            }
          >
            {editing ? "Save event changes" : "Add event"}
          </button>
          {editing && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setForm(blank());
                setEditing(false);
              }}
            >
              Cancel edit
            </button>
          )}
        </form>
      </Card>
      <Card className="control-club-events">
        <div className="section-top">
          <h2>Club calendar events</h2>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void load()}
          >
            Refresh events
          </button>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {!data ? (
          <p role="status">Loading club settings…</p>
        ) : !data.events.length ? (
          <p>No club events yet. Add your first event above.</p>
        ) : (
          data.events.map((event) => (
            <article key={event.id} className="control-calendar-event">
              <h3>{event.title}</h3>
              <p className="small muted">
                {formatDate(event.date)} · {eventTimeLabel(event.time)}
              </p>
              <p className="club-event-description">{event.description}</p>
              {event.bookingUrl && (
                <a
                  href={event.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View booking page
                </a>
              )}
              <div className="control-video-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setForm(event);
                    setEditing(true);
                  }}
                >
                  Edit event
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setRemoving(event.id)}
                >
                  Remove event
                </button>
              </div>
              {removing === event.id && (
                <div className="control-video-confirm">
                  <p>Remove “{event.title}” from the app calendar?</p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setRemoving(null)}
                  >
                    Keep event
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await save(
                          "events/remove",
                          { id: event.id },
                          "Event removed from the calendar.",
                        )
                      ) {
                        setRemoving(null);
                        if (form.id === event.id) {
                          setForm(blank());
                          setEditing(false);
                        }
                      }
                    }}
                  >
                    Confirm removal
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </Card>
    </div>
  );
}
