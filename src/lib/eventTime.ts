// Shared by NewEventForm/EditEventForm's start/end/duration trio -- duration
// is a form-only convenience (not its own DB column, see 0071's comment)
// that computes event_end_time from event_time + minutes. Kept here rather
// than inline in the form components since both forms need the exact same
// options/math.
export const DURATION_OPTIONS = [
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
  { value: "240", label: "4 hours" },
  { value: "360", label: "6 hours" },
  { value: "480", label: "8 hours" },
];

/** Adds `minutes` to a "HH:MM" start time. Wraps past midnight (mod 24h) --
 * an event's end time is just a clock-face label here, not a real
 * multi-day-aware timestamp, same as every other time field in this
 * codebase (no timezone/date-rollover handling elsewhere either). */
export function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h * 60 + m + minutes + 24 * 60) % (24 * 60);
  const outH = Math.floor(total / 60);
  const outM = total % 60;
  return `${String(outH).padStart(2, "0")}:${String(outM).padStart(2, "0")}`;
}
