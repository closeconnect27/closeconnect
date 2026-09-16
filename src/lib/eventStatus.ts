// "Past" is the later of event_date/event_end_date (a multi-day event isn't
// over until its last day) compared to today in IST -- the timezone every
// other date field in this codebase already assumes without actually
// storing (see googleCalendarLink.ts's own comment on this). A plain string
// comparison works since both are already zero-padded "YYYY-MM-DD". A null
// event_date means an unpublished draft, never "past".
export function isEventPast(event: { event_date: string | null; event_end_date?: string | null }): boolean {
  const eventLastDay = event.event_end_date || event.event_date;
  if (!eventLastDay) return false;
  const todayIsoIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return eventLastDay < todayIsoIST;
}
