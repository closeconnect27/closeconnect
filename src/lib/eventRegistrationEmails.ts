import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

function formatEventDateForEmail(isoDate: string | null) {
  // Parsed as a plain calendar date, not a Date-with-timezone -- same
  // reasoning as EventCard's formatDateChip.
  if (!isoDate) return "Date to be announced";
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

async function getEventEmailFields(supabase: SupabaseClient, eventId: string) {
  const { data: event } = await supabase
    .from("events")
    .select("event_name, event_date, event_mode, venue, city")
    .eq("id", eventId)
    .single();
  if (!event) return null;
  return {
    eventName: event.event_name as string,
    dateLabel: formatEventDateForEmail(event.event_date),
    isOnline: event.event_mode === "online",
    place: event.event_mode === "online" ? [event.city].filter(Boolean).join(", ") : [event.venue, event.city].filter(Boolean).join(", "),
  };
}

/** meeting_link lives on its own RLS-scoped table (event_meeting_links,
 * 0069), not a column on events -- selected through the SAME caller-scoped
 * `supabase` client passed in here, not an admin client, so this only ever
 * returns a value when the acting user is actually authorized to see it
 * (the event's host, or -- since this is only ever called right after that
 * exact registration's payment_status flips to 'paid', both at the
 * registerForEvent free-ticket path and confirmPayment's confirm path --
 * the registrant themself). Never fetched/sent for a still-unpaid
 * registration (see sendPaymentPendingEmail, which never calls this). */
async function getMeetingLinkForEmail(supabase: SupabaseClient, eventId: string) {
  const { data } = await supabase.from("event_meeting_links").select("meeting_link").eq("event_id", eventId).maybeSingle();
  return (data?.meeting_link as string | undefined) ?? null;
}

/** The real "you're in" email -- only ever sent once a spot is actually
 * confirmed: immediately for a free ticket (nothing left to do), or from
 * confirmPayment once the host manually confirms a paid one. Never sent
 * at registration time for a paid ticket -- see sendPaymentPendingEmail
 * for that moment instead. */
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

  await sendEmail({
    to: email,
    subject: `You're registered: ${fields.eventName}`,
    html: `
      <p>Hi ${registrantName},</p>
      <p>You're registered for <strong>${fields.eventName}</strong>.</p>
      <p>${fields.dateLabel}${fields.place ? ` &middot; ${fields.place}` : ""}</p>
      ${
        fields.isOnline
          ? meetingLink
            ? `<p>Join here: <a href="${meetingLink}">${meetingLink}</a></p>`
            : `<p>This is an online event -- the host hasn't shared a meeting link yet. Check the event page closer to the date.</p>`
          : ""
      }
    `,
  });
}

/** Sent at registration time for a PAID ticket instead of the
 * confirmation above -- the spot is reserved (capacity/rate-limit checks
 * already ran), but not actually confirmed until the host manually
 * confirms the UPI payment (confirmPayment in app/actions/events.ts). Says
 * so plainly rather than implying "you're in" before money has moved.
 * Shows the host's own UPI QR/ID (set inline while creating/editing the
 * event, PaymentDetailsForm) -- registrants pay the host directly and
 * tell us the reference number back, there's no checkout link at all. */
export async function sendPaymentPendingEmail(
  supabase: SupabaseClient,
  {
    email,
    eventId,
    registrantName,
    upiId,
    qrImageUrl,
    amountRupees,
  }: {
    email: string;
    eventId: string;
    registrantName: string;
    upiId: string | null;
    qrImageUrl: string | null;
    amountRupees: number;
  },
) {
  const fields = await getEventEmailFields(supabase, eventId);
  if (!fields) return;

  await sendEmail({
    to: email,
    subject: `Complete your payment: ${fields.eventName}`,
    html: `
      <p>Hi ${registrantName},</p>
      <p>Your spot for <strong>${fields.eventName}</strong> is reserved, but not confirmed yet -- pay &#8377;${amountRupees} by UPI to lock it in, then tell us the reference number back on the event page.</p>
      <p>${fields.dateLabel}${fields.place ? ` &middot; ${fields.place}` : ""}</p>
      ${
        upiId || qrImageUrl
          ? `
        ${qrImageUrl ? `<p><img src="${qrImageUrl}" alt="Payment QR code" width="180" height="180" style="border:1px solid #ddd;border-radius:8px" /></p>` : ""}
        ${upiId ? `<p>UPI ID: <strong>${upiId}</strong></p>` : ""}
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/events/${eventId}">Go to the event page to enter your payment reference</a></p>
      `
          : `<p>Payment setup ran into an issue -- contact the organizer to complete payment.</p>`
      }
    `,
  });
}
