// Builds a "Add to Google Calendar" deep link -- Google's own documented
// render endpoint (google.com/calendar/render?action=TEMPLATE&...), which
// needs no API key, no OAuth, and no Calendar API enablement at all: it's
// just a URL that pre-fills Google Calendar's own "create event" form for
// whoever clicks it. This is the whole feature for "dates and time on
// Google Calendar" -- the app never touches anyone's actual calendar data.
//
// IST is hardcoded (not read from event data) because every other date
// formatter in this codebase already assumes IST/no-timezone-stored dates
// (see EventCard's formatDateChip, eventRegistrationEmails' formatEventDateForEmail) --
// there's no per-event timezone field to read instead.
const IST_OFFSET_MINUTES = 5 * 60 + 30;
const DEFAULT_DURATION_MINUTES = 120;

function toUtcCompact(isoDate: string, hhmm: string | null, addMinutes = 0): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [h, min] = (hhmm ?? "00:00").split(":").map(Number);
  // Date.UTC treats its inputs as already-UTC components -- subtracting the
  // IST offset converts "this clock time in IST" into the equivalent UTC
  // instant, same direction Supabase/Postgres would if it stored tz-aware.
  const utcMs = Date.UTC(y, m - 1, d, h, min) - IST_OFFSET_MINUTES * 60_000 + addMinutes * 60_000;
  const dt = new Date(utcMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}` +
    `T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}${pad(dt.getUTCSeconds())}Z`
  );
}

function addDaysCompact(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

export function buildGoogleCalendarLink({
  title,
  description,
  location,
  isoDate,
  endIsoDate,
  time,
  endTime,
  durationMinutes = DEFAULT_DURATION_MINUTES,
}: {
  title: string;
  description?: string;
  location?: string;
  isoDate: string;
  /** End date for a multi-day event (event_end_date, 0072) -- undefined or
   * equal to `isoDate` means single-day. */
  endIsoDate?: string | null;
  time?: string | null; // "HH:MM" 24hr, or null/undefined for an all-day event
  /** Real end time, when the host set one (EventTimeFields) -- takes
   * priority over `durationMinutes`, which only applies as a fallback. */
  endTime?: string | null;
  durationMinutes?: number;
}): string {
  const isMultiDay = !!endIsoDate && endIsoDate !== isoDate;
  const lastDay = isMultiDay ? endIsoDate! : isoDate;

  const dates = time
    ? `${toUtcCompact(isoDate, time)}/${
        endTime
          ? toUtcCompact(lastDay, endTime)
          : isMultiDay
            // Multi-day with no explicit end time -- cover through the end
            // of the last day rather than a same-day +2h default, which
            // wouldn't make sense once start/end are different dates.
            ? toUtcCompact(lastDay, "23:59")
            : toUtcCompact(isoDate, time, durationMinutes)
      }`
    // All-day events use plain dates with no time/Z suffix, end exclusive
    // (Google's own documented convention -- a 1-day event's end is the next day).
    : `${isoDate.replace(/-/g, "")}/${addDaysCompact(lastDay, 1)}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates,
  });
  if (description) params.set("details", description);
  if (location) params.set("location", location);

  return `https://www.google.com/calendar/render?${params.toString()}`;
}
