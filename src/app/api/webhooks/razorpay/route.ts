import { NextResponse, type NextRequest } from "next/server";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendRegistrationConfirmationEmail, sendRefundProcessedEmail } from "@/lib/eventRegistrationEmails";
import { getEventTicketTypes } from "@/lib/queries/events";
import { logCancellationAudit } from "@/lib/cancellationAuditLog";
import { logPayoutAudit } from "@/lib/payoutAuditLog";
import { getRegistrationAddonTotalPaise } from "@/lib/eventAddonBilling";

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
        // Present on payment.captured -- the real gateway fee Razorpay
        // charged for this specific payment, used by organizerSettlement.ts.
        // Not present on every event type, hence optional/nullable.
        fee?: number | null;
      };
    };
    refund?: {
      entity: {
        id: string;
        payment_id: string;
        status: string;
      };
    };
    fund_account?: {
      entity: { id: string };
    };
    payout?: {
      entity: { id: string; status: string; failure_reason?: string | null };
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

  // Refund lifecycle (section 16): Razorpay's refund is initiated
  // synchronously by cancelMyRegistration/cancelEventForHost, which already
  // stores the resulting razorpay_refund_id -- this webhook is what
  // confirms it actually landed (or didn't), same "initiating a refund
  // call is not the same as the customer having the money yet" posture the
  // spec insisted on.
  if (body.event === "refund.processed" || body.event === "refund.failed") {
    const refund = body.payload.refund?.entity;
    if (!refund) return NextResponse.json({ ok: true, ignored: "no refund entity" });

    const newStatus = body.event === "refund.processed" ? "completed" : "failed";
    const { data: ledgerRow } = await admin
      .from("event_registration_refunds")
      .select("id, registration_id, status")
      .eq("razorpay_refund_id", refund.id)
      .maybeSingle();
    if (!ledgerRow || ledgerRow.status !== "processing") {
      // Not ours, or already resolved (cancelMyRegistration's own synchronous
      // call already marked it, and this webhook is just confirming what we
      // already recorded) -- either way, nothing left to do.
      return NextResponse.json({ ok: true, alreadyHandled: true });
    }

    await admin
      .from("event_registration_refunds")
      .update({ status: newStatus, completed_at: newStatus === "completed" ? new Date().toISOString() : null })
      .eq("id", ledgerRow.id);
    const { data: reg } = await admin
      .from("form_responses")
      .update({ refund_status: newStatus === "completed" ? "processed" : "failed" })
      .eq("id", ledgerRow.registration_id)
      .select("owner_id, respondent_id, refund_amount_paise, response_data")
      .maybeSingle();

    if (reg) {
      await logCancellationAudit(admin, {
        eventId: reg.owner_id,
        registrationId: ledgerRow.registration_id,
        actorRole: "system",
        action: newStatus === "completed" ? "refund_completed" : "refund_failed",
        amountPaise: reg.refund_amount_paise,
        metadata: { razorpayRefundId: refund.id, source: "webhook" },
      });
    }

    if (reg && newStatus === "completed") {
      await admin.from("notifications").insert({
        user_id: reg.respondent_id,
        type: "refund_processed",
        title: "Refund processed",
        body: `₹${((reg.refund_amount_paise ?? 0) / 100).toLocaleString("en-IN")} has been refunded to your original payment method.`,
        link: `/events/${reg.owner_id}`,
      });
      const responseData = reg.response_data as unknown as { name?: string; email?: string } | null;
      if (responseData?.email) {
        try {
          await sendRefundProcessedEmail({ email: responseData.email, registrantName: responseData.name ?? "there", amountPaise: reg.refund_amount_paise ?? 0 });
        } catch (e) {
          console.error("Razorpay webhook: failed to send refund-processed email:", e);
        }
      }
    } else if (reg && newStatus === "failed") {
      await admin.from("notifications").insert({
        user_id: reg.respondent_id,
        type: "refund_failed",
        title: "Refund couldn't be processed",
        body: "Something went wrong on the payment provider's side -- contact support@closeconnect.in and we'll sort it out.",
        link: `/events/${reg.owner_id}`,
      });
    }

    return NextResponse.json({ ok: true });
  }

  // Fund account validation (penny-drop bank verification) -- async
  // confirmation of the createRazorpayFundAccountValidation call
  // savePayoutAccount (app/actions/organizerPayouts.ts) makes when an
  // organizer adds a payout account. Only this webhook ever flips
  // verification_status to 'verified' -- there's no other path that does.
  if (body.event === "fund_account.validation.completed" || body.event === "fund_account.validation.failed") {
    const fundAccount = body.payload.fund_account?.entity;
    if (!fundAccount) return NextResponse.json({ ok: true, ignored: "no fund_account entity" });

    const { data: account } = await admin
      .from("organizer_payout_accounts")
      .select("id, organizer_id, verification_status")
      .eq("provider_fund_account_id", fundAccount.id)
      .maybeSingle();
    if (!account || account.verification_status !== "verification_pending") {
      return NextResponse.json({ ok: true, alreadyHandled: true });
    }

    const verified = body.event === "fund_account.validation.completed";
    await admin
      .from("organizer_payout_accounts")
      .update({
        verification_status: verified ? "verified" : "verification_failed",
        verification_failure_reason: verified ? null : "Bank verification failed -- double-check the account number and IFSC, then add the account again.",
        // Only a verified account is ever eligible to be paid to -- it
        // becomes primary here, at the moment it's actually confirmed,
        // never earlier (savePayoutAccount deliberately leaves it
        // is_primary=false when first added).
        is_primary: verified,
        verified_at: verified ? new Date().toISOString() : null,
      })
      .eq("id", account.id);

    await logPayoutAudit(admin, {
      organizerId: account.organizer_id,
      payoutAccountId: account.id,
      actorRole: "system",
      action: verified ? "verification_succeeded" : "verification_failed",
    });

    if (verified) {
      await admin.from("notifications").insert({
        user_id: account.organizer_id,
        type: "payout_account_verified",
        title: "Payout account verified",
        body: "Your payout account has been verified. You're now eligible for settlements.",
        link: "/host/payments",
      });
    }

    return NextResponse.json({ ok: true });
  }

  // Payout confirmation -- async result of the createRazorpayPayout call
  // initiateOrganizerPayout (lib/organizerSettlement.ts) makes. That call
  // already flips a settlement to 'processed' immediately when Razorpay's
  // synchronous response already says "processed"; this webhook is what
  // confirms it for the (more common) case where a payout starts
  // "queued"/"pending" and completes asynchronously, or fails after the
  // fact -- same "initiating isn't the same as it landing" posture the
  // refund webhook above already has.
  if (body.event === "payout.processed" || body.event === "payout.failed" || body.event === "payout.reversed") {
    const payout = body.payload.payout?.entity;
    if (!payout) return NextResponse.json({ ok: true, ignored: "no payout entity" });

    const { data: settlement } = await admin
      .from("organizer_settlements")
      .select("id, organizer_id, payout_account_id, net_payable_paise, status")
      .eq("provider_payout_id", payout.id)
      .maybeSingle();
    if (!settlement || settlement.status === "processed") {
      return NextResponse.json({ ok: true, alreadyHandled: true });
    }

    const succeeded = body.event === "payout.processed";
    await admin
      .from("organizer_settlements")
      .update({
        status: succeeded ? "processed" : "failed",
        processed_at: succeeded ? new Date().toISOString() : null,
        failed_at: succeeded ? null : new Date().toISOString(),
        failure_reason: succeeded ? null : (payout.failure_reason ?? "Payout failed at the payment provider"),
      })
      .eq("id", settlement.id);

    await logPayoutAudit(admin, {
      organizerId: settlement.organizer_id,
      payoutAccountId: settlement.payout_account_id,
      settlementId: settlement.id,
      actorRole: "system",
      action: succeeded ? "payout_processed" : "payout_failed",
      amountPaise: settlement.net_payable_paise,
    });

    await admin.from("notifications").insert({
      user_id: settlement.organizer_id,
      type: succeeded ? "payout_processed" : "payout_failed",
      title: succeeded ? "Payout processed" : "Payout couldn't be processed",
      body: succeeded
        ? `₹${(settlement.net_payable_paise / 100).toLocaleString("en-IN")} has been successfully sent to your payout account.`
        : "We couldn't process your payout. Please check your payout account details or contact support@closeconnect.in.",
      link: "/host/payments",
    });

    return NextResponse.json({ ok: true });
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
    .select("id, owner_id, respondent_id, payment_status, response_data, ticket_type_id, quantity")
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

  const ticketTypes = await getEventTicketTypes(admin, reg.owner_id);
  const ticketType = ticketTypes.find((t) => t.id === reg.ticket_type_id);
  const addonTotalPaise = await getRegistrationAddonTotalPaise(admin, reg.id);
  const amountPaidPaise = ticketType ? Math.round(ticketType.price * reg.quantity * 100) + addonTotalPaise : null;

  const { error: updateError } = await admin
    .from("form_responses")
    .update({ payment_status: "paid", razorpay_payment_id: payment.id, amount_paid_paise: amountPaidPaise, gateway_fee_paise: payment.fee ?? null })
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
