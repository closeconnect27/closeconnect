import { NextResponse, type NextRequest } from "next/server";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendRegistrationConfirmationEmail } from "@/lib/eventRegistrationEmails";

// Durable fallback confirmation path, alongside (not instead of)
// verifyRazorpayPayment's own client-driven signature check -- that one
// only fires if the registrant's browser is still around to run the
// checkout.js success handler. This webhook is Razorpay's own
// server-to-server delivery, so a closed tab, a crashed browser, or a
// network drop right after paying still gets the registration marked paid.
// Both paths converge on the same admin-client write with the same
// `payment_status <> 'paid'` guard, so whichever arrives first wins and the
// second is a no-op -- no double-processing, no double email.
type RazorpayWebhookPayload = {
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string | null;
      };
    };
  };
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  // Unique per delivery (Razorpay's own docs), not something inside the
  // JSON body -- the idempotency key for razorpay_webhook_events.
  const eventId = request.headers.get("x-razorpay-event-id");

  if (!signature || !eventId) {
    return NextResponse.json({ error: "Missing signature or event id" }, { status: 400 });
  }

  // Fails closed: if the webhook secret hasn't been configured yet, every
  // delivery is rejected rather than silently skipping verification --
  // the alternative (accepting unsigned "payment.captured" POSTs) would let
  // anyone mark any registration paid for free.
  let valid: boolean;
  try {
    valid = await verifyRazorpayWebhookSignature(rawBody, signature);
  } catch (e) {
    console.error("Razorpay webhook signature check failed to run:", e);
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Insert-first idempotency: a duplicate delivery (Razorpay retries on
  // anything but a 2xx) hits the event_id primary key and errors here,
  // which is exactly the signal to stop before touching form_responses
  // again -- same pattern this table's own migration (0041) describes.
  const { error: dedupeError } = await admin.from("razorpay_webhook_events").insert({ event_id: eventId });
  if (dedupeError) {
    // 23505 = unique_violation -- already processed, not a real failure.
    if (dedupeError.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    console.error("Failed to record razorpay webhook event:", dedupeError);
    return NextResponse.json({ error: dedupeError.message }, { status: 500 });
  }

  let body: RazorpayWebhookPayload;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.event !== "payment.captured") {
    // Acknowledged, not processed -- payment.failed and anything else this
    // route doesn't act on yet still gets a 2xx so Razorpay doesn't retry.
    return NextResponse.json({ ok: true, ignored: body.event });
  }

  const payment = body.payload.payment?.entity;
  if (!payment?.order_id) return NextResponse.json({ ok: true, ignored: "no order_id" });

  const { data: reg, error: fetchError } = await admin
    .from("form_responses")
    .select("id, owner_id, respondent_id, payment_status, response_data")
    .eq("owner_type", "event")
    .eq("razorpay_order_id", payment.order_id)
    .maybeSingle();
  if (fetchError) {
    console.error("Razorpay webhook: failed to look up registration:", fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  // Not found, or verifyRazorpayPayment's own client-driven path already
  // won the race -- either way, nothing left to do.
  if (!reg || reg.payment_status !== "unpaid") {
    return NextResponse.json({ ok: true, alreadyHandled: true });
  }

  const { error: updateError } = await admin
    .from("form_responses")
    .update({ payment_status: "paid", razorpay_payment_id: payment.id })
    .eq("id", reg.id);
  if (updateError) {
    console.error("Razorpay webhook: failed to mark registration paid:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const responseData = reg.response_data as unknown as { name?: string; email?: string } | null;
  if (responseData?.email) {
    try {
      await sendRegistrationConfirmationEmail(admin, {
        email: responseData.email,
        eventId: reg.owner_id,
        registrantName: responseData.name ?? "there",
      });
    } catch (e) {
      console.error("Razorpay webhook: failed to send confirmation email:", e);
    }
  }
  await admin.from("notifications").insert({
    user_id: reg.respondent_id,
    type: "event_registered",
    title: "You're registered!",
    body: "Payment confirmed",
    link: `/events/${reg.owner_id}`,
  });

  return NextResponse.json({ ok: true });
}
