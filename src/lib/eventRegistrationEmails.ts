import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { renderEmailShell, emailButton, emailCallout, escapeHtml } from "@/lib/emailTemplate";
import { buildGoogleCalendarLink } from "@/lib/googleCalendarLink";
import { safeHttpsHref } from "@/lib/validators/links";

function formatEventDateForEmail(isoDate: string | null) {
  // Parsed as a plain calendar date, not a Date-with-timezone -- same
  // reasoning as EventCard's formatDateChip.
  if (!isoDate) return "Date to be announced";
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

function formatEventTimeForEmail(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

async function getEventEmailFields(supabase: SupabaseClient, eventId: string) {
  const { data: event } = await supabase
    .from("events")
    .select("event_name, event_date, event_time, event_end_time, event_mode, venue, city")
    .eq("id", eventId)
    .single();
  if (!event) return null;
  const isOnline = event.event_mode === "online";
  const place = isOnline
    ? [event.city].filter(Boolean).join(", ")
    : [event.venue, event.city].filter(Boolean).join(", ");
  const timeLabel = event.event_time
    ? formatEventTimeForEmail(event.event_time) + (event.event_end_time ? ` – ${formatEventTimeForEmail(event.event_end_time)}` : "")
    : null;
  return {
    eventName: event.event_name as string,
    isoDate: event.event_date as string | null,
    time: event.event_time as string | null,
    dateLabel: formatEventDateForEmail(event.event_date),
    timeLabel,
    isOnline,
    place,
    calendarLink: event.event_date
      ? buildGoogleCalendarLink({
          title: event.event_name as string,
          location: place || undefined,
          isoDate: event.event_date as string,
          time: event.event_time as string | null,
          endTime: event.event_end_time as string | null,
        })
      : null,
  };
}

/** meeting_link lives on its own RLS-scoped table (event_meeting_links,
 * 0069), not a column on events -- selected through the SAME caller-scoped
 * `supabase` client passed in here, not an admin client, so this only ever
 * returns a value when the acting user is actually authorized to see it
 * (the event's host, or -- since this is only ever called right after that
 * exact registration's payment_status flips to 'paid', both at the
 * registerForEvent free-ticket path and verifyRazorpayPayment's success
 * path -- the registrant themself). Never fetched/sent for a still-unpaid
 * registration. */
async function getMeetingLinkForEmail(supabase: SupabaseClient, eventId: string) {
  const { data } = await supabase.from("event_meeting_links").select("meeting_link").eq("event_id", eventId).maybeSingle();
  return (data?.meeting_link as string | undefined) ?? null;
}

/** The real "you're in" email -- only ever sent once a spot is actually
 * confirmed: immediately for a free ticket (nothing left to do), or from
 * verifyRazorpayPayment once a paid ticket's Razorpay signature checks out.
 * Never sent at registration time for a paid ticket -- there's nothing to
 * confirm yet at that point. */
export async function sendRegistrationConfirmationEmail(
  supabase: SupabaseClient,
  { email, eventId, registrantName }: { email: string; eventId: string; registrantName: string },
) {
  const fields = await getEventEmailFields(supabase, eventId);
  if (!fields) return;

  // Only ever fetched for an online event, and only once this registration
  // is actually confirmed (this function's own doc comment) -- "only
  // registered users should receive the meeting link" from the request.
  const meetingLink = fields.isOnline ? await getMeetingLinkForEmail(supabase, eventId) : null;
  const name = escapeHtml(registrantName);
  const eventName = escapeHtml(fields.eventName);

  await sendEmail({
    to: email,
    subject: `You're in! 🎉 ${fields.eventName}`,
    html: renderEmailShell({
      preheader: `You're locked in for ${fields.eventName} -- here's everything you need.`,
      bodyHtml: `
        <p style="margin:0 0 8px;font-size:17px;">Hey ${name} 👋</p>
        <p style="margin:0 0 20px;">Good news -- you're officially registered for <strong>${eventName}</strong>. Save the date, we'll see you there.</p>
        ${emailCallout(`
          <strong>${fields.dateLabel}${fields.timeLabel ? ` &middot; ${fields.timeLabel}` : ""}</strong>
          ${fields.place ? `<br/>${escapeHtml(fields.place)}` : ""}
        `)}
        ${
          fields.isOnline
            ? meetingLink
              ? `<p style="margin:20px 0 0;">Here's your link -- keep it handy: <a href="${safeHttpsHref(meetingLink)}" style="color:#1a7a5e;">${escapeHtml(meetingLink)}</a></p>`
              : `<p style="margin:20px 0 0;color:#6b6f6b;">It's an online event and the host hasn't dropped the meeting link yet -- check back on the event page closer to the date.</p>`
            : ""
        }
        ${fields.calendarLink ? `<p style="margin:24px 0 0;">${emailButton("Add to Google Calendar", fields.calendarLink)}</p>` : ""}
      `,
    }),
  });
}

/** Sent to every existing registrant when the host edits an event's core
 * details (updateEvent in app/actions/events.ts) -- date/time/venue/etc.
 * Deliberately generic rather than diffing old vs. new field-by-field
 * (real value, low complexity: "something changed, here's what it says
 * now" covers every case without tracking per-field history). Shows the
 * event's CURRENT details -- getEventEmailFields reads them fresh, so this
 * always reflects what was just saved, not what the registrant originally
 * signed up for. */
/** Sent to every existing registrant when the host cancels an event
 * (cancelEvent in app/actions/events.ts). Refund language is generic
 * ("if you paid") rather than looking up this registrant's actual payment
 * status/amount -- matches sendEventUpdatedEmail's "something changed,
 * here's what it means" philosophy, and this is what /cancellation-refund
 * (Section 3) already promises: notification + a full refund entitlement
 * for a paid ticket, phrased so it's still correct for a free registrant. */
export async function sendEventCancelledEmail(
  supabase: SupabaseClient,
  { email, eventId, registrantName }: { email: string; eventId: string; registrantName: string },
) {
  const fields = await getEventEmailFields(supabase, eventId);
  if (!fields) return;

  const name = escapeHtml(registrantName);
  const eventName = escapeHtml(fields.eventName);
  const refundPolicyLink = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/cancellation-refund`;

  await sendEmail({
    to: email,
    subject: `Cancelled: ${fields.eventName}`,
    html: renderEmailShell({
      preheader: `${fields.eventName} has been cancelled by the organizer.`,
      bodyHtml: `
        <p style="margin:0 0 8px;font-size:17px;">Hey ${name} 👋</p>
        <p style="margin:0 0 20px;">The organizer has cancelled <strong>${eventName}</strong>, which you were registered for.</p>
        <p style="margin:0 0 20px;">If you paid for a ticket, you're entitled to a full refund -- our team will process it back to your original payment method, typically within 5-7 business days. If your registration was free, there's nothing further you need to do.</p>
        <p style="margin:24px 0 0;">${emailButton("Read our refund policy", refundPolicyLink)}</p>
      `,
    }),
  });
}

export async function sendEventUpdatedEmail(
  supabase: SupabaseClient,
  { email, eventId, registrantName }: { email: string; eventId: string; registrantName: string },
) {
  const fields = await getEventEmailFields(supabase, eventId);
  if (!fields) return;

  const name = escapeHtml(registrantName);
  const eventName = escapeHtml(fields.eventName);
  const eventPageLink = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/events/${eventId}`;

  await sendEmail({
    to: email,
    subject: `Updated: ${fields.eventName}`,
    html: renderEmailShell({
      preheader: `The organizer just updated details for ${fields.eventName} -- here's what it looks like now.`,
      bodyHtml: `
        <p style="margin:0 0 8px;font-size:17px;">Hey ${name} 👋</p>
        <p style="margin:0 0 20px;">The organizer just updated <strong>${eventName}</strong>, which you're registered for. Here's what it looks like now:</p>
        ${emailCallout(`
          <strong>${fields.dateLabel}${fields.timeLabel ? ` &middot; ${fields.timeLabel}` : ""}</strong>
          ${fields.place ? `<br/>${escapeHtml(fields.place)}` : ""}
        `)}
        <p style="margin:24px 0 0;">${emailButton("View the event", eventPageLink)}</p>
      `,
    }),
  });
}

