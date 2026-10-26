import { shiftDate } from "./attendance";
import { validDate } from "./training";
import type { ClubEvent } from "./events";
function dates(event: ClubEvent) {
  if (
    !validDate(event.date) ||
    (event.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time))
  )
    throw Error("Invalid calendar date");
  const start = event.date.replaceAll("-", "");
  return event.time
    ? {
        start: start + "T" + event.time.replace(":", "") + "00",
        end: start + "T" + event.time.replace(":", "") + "00",
        timed: true,
      }
    : {
        start,
        end: shiftDate(event.date, 1).replaceAll("-", ""),
        timed: false,
      };
}
function description(event: ClubEvent) {
  return (
    event.description +
    (event.bookingUrl ? "\n\nBooking: " + event.bookingUrl : "")
  );
}
export function googleCalendarUrl(event: ClubEvent) {
  const d = dates(event);
  const url = new URL("https://calendar.google.com/calendar/render");
  url.search = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    details: description(event),
    dates: d.start + "/" + d.end,
    ctz: "Pacific/Auckland",
    ...(event.location ? { location: event.location } : {}),
  }).toString();
  return url.toString();
}
const escape = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
function fold(line: string) {
  const encoder = new TextEncoder();
  let current = "",
    length = 0;
  const rows: string[] = [];
  for (const c of line) {
    const n = encoder.encode(c).length;
    if (length + n > 75) {
      rows.push(current);
      current = " ";
      length = 1;
    }
    current += c;
    length += n;
  }
  rows.push(current);
  return rows.join("\r\n");
}
export function eventCalendarFile(event: ClubEvent, now = new Date()) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(event.id)) throw Error("Invalid event ID");
  const d = dates(event);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HIIT Co.//Member Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (d.timed)
    lines.push(
      "BEGIN:VTIMEZONE",
      "TZID:Pacific/Auckland",
      "BEGIN:DAYLIGHT",
      "DTSTART:20070930T020000",
      "TZOFFSETFROM:+1200",
      "TZOFFSETTO:+1300",
      "RRULE:FREQ=YEARLY;BYMONTH=9;BYDAY=-1SU",
      "END:DAYLIGHT",
      "BEGIN:STANDARD",
      "DTSTART:20080406T030000",
      "TZOFFSETFROM:+1300",
      "TZOFFSETTO:+1200",
      "RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU",
      "END:STANDARD",
      "END:VTIMEZONE",
    );
  lines.push(
    "BEGIN:VEVENT",
    "UID:" + event.id + "@hiitco.maxwellhj.workers.dev",
    "DTSTAMP:" +
      now
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, ""),
    d.timed
      ? "DTSTART;TZID=Pacific/Auckland:" + d.start
      : "DTSTART;VALUE=DATE:" + d.start,
  );
  if (!d.timed) lines.push("DTEND;VALUE=DATE:" + d.end);
  lines.push(
    "SUMMARY:" + escape(event.title),
    "DESCRIPTION:" + escape(description(event)),
  );
  if (event.location) lines.push("LOCATION:" + escape(event.location));
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
