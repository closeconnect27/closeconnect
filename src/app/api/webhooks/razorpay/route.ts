import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { sendRegistrationConfirmationEmail } from "@/lib/eventRegistrationEmails";

// Razorpay webhook -- payment_link.paid / payment.captured mark a
// registration as paid. Three things this endpoint is careful about, in
// order: (1) never trust a payload before its signature verifies, (2)
// match it back to the correct registration via reference_id, not
// anything guessable, (3) be idempotent -- Razorpay retries webhook
// deliveries on anything but a fast 2xx, and the same event id arriving
// twice must not double-apply side effects.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    // No detail in the response -- an attacker probing this endpoint
    // shouldn't learn anything from how it fails.
    return new Response("Invalid signature", { status: 400 });
  }

  let payload: {
    id: string;
    event: string;
    payload?: {
      payment_link?: { entity?: { id: string; reference_id?: string; notes?: Record<string, string> } };
      payment?: { entity?: { id: string } };
    };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const admin = createAdminClient();

  // Idempotency: record this exact webhook delivery's id before doing
  // anything else. The primary key collision (23505) on a retry is the
  // idempotency check itself, not an error condition.
  const { error: dedupeError } = await admin.from("razorpay_webhook_events").insert({ event_id: payload.id });
  if (dedupeError) {
    if (dedupeError.code === "23505") {
      return new Response("Already processed", { status: 200 });
    }
    console.error("Failed to record razorpay webhook event:", dedupeError.message);
    return new Response("Internal error", { status: 500 });
  }

  if (payload.event !== "payment_link.paid" && payload.event !== "payment.captured") {
    // Acknowledged but ignored -- Razorpay sends many event types to the
    // same webhook URL; only these two are relevant here.
    return new Response("Ignored event type", { status: 200 });
  }

  const linkEntity = payload.payload?.payment_link?.entity;
  const paymentEntity = payload.payload?.payment?.entity;
  const registrationId = linkEntity?.reference_id ?? linkEntity?.notes?.registration_id;

  if (!registrationId) {
    console.error("Razorpay webhook had no reference_id/notes.registration_id to match against:", payload.id);
    return new Response("No registration reference", { status: 200 });
  }

  // .select() the row back rather than a separate query -- this is the
  // moment the registration actually becomes confirmed (payment_status
  // 'unpaid' -> 'paid'), so the real "you're registered" email/notification
  // belong here, not at registration time (see registerForEvent, which
  // sends a "complete your payment" email instead for a paid ticket --
  // sending "you're registered" before money moved was a real bug a user
  // hit).
  const { data: updatedRows, error: updateError } = await admin
    .from("form_responses")
    .update({
      payment_status: "paid",
      razorpay_payment_id: paymentEntity?.id ?? null,
    })
    .eq("id", registrationId)
    .eq("owner_type", "event")
    .select("owner_id, respondent_id, response_data, event_ticket_types(name)");

  if (updateError) {
    console.error("Failed to mark registration paid:", updateError.message);
    return new Response("Internal error", { status: 500 });
  }

  const registration = updatedRows?.[0] as unknown as
    | { owner_id: string; respondent_id: string | null; response_data: { name?: string; email?: string }; event_ticket_types: { name: string } | null }
    | undefined;

  if (registration) {
    const eventId = registration.owner_id;
    const email = registration.response_data?.email;
    if (email) {
      try {
        await sendRegistrationConfirmationEmail(admin, {
          email,
          eventId,
          registrantName: registration.response_data?.name ?? "there",
        });
      } catch (e) {
        console.error("Failed to send post-payment confirmation email:", e);
      }
    }

    if (registration.respondent_id) {
      const { error: notifyError } = await admin.from("notifications").insert({
        user_id: registration.respondent_id,
        type: "event_registered",
        title: "You're registered!",
        body: registration.event_ticket_types?.name ?? "Your ticket",
        link: `/events/${eventId}`,
      });
      if (notifyError) console.error("Failed to insert post-payment notification:", notifyError.message);
    }
  }

  return new Response("OK", { status: 200 });
}
