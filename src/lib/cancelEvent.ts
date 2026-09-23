import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEventCancelledEmail, sendRefundProcessedEmail } from "@/lib/eventRegistrationEmails";
import { createRazorpayRefund } from "@/lib/razorpay";
import { logCancellationAudit } from "@/lib/cancellationAuditLog";
import { computeEventSettlement } from "@/lib/organizerSettlement";

// Shared by the web Server Action (src/app/actions/events.ts) and the
// mobile route (src/app/api/mobile/events/[id]/cancel/route.ts) -- same
// reasoning as accountDeletion.ts: both just authenticate the caller their
// own way and hand off an already-RLS-scoped client + the caller's id here.
//
// `supabase` must be a client authenticated as the calling user (cookies on
// web, bearer token on mobile) -- RLS (events_update_host_or_admin) is the
// real gate on the update itself; the admin client is only used afterward,
// to write into OTHER people's own notification rows, which
// notifications_insert_self would otherwise block.
//
// An organizer-cancelled event is ALWAYS a full refund (section 28,
// /cancellation-refund Section 3) regardless of what the event's own
// cancellation policy says -- that policy only ever governs an ATTENDEE
// choosing to cancel, never an organizer pulling the whole event out from
// under everyone who already paid for it.
export async function cancelEventForHost(supabase: SupabaseClient, eventId: string, callerId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from("events").update({ status: "cancelled" }).eq("id", eventId).select();
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not allowed to cancel this event" };

  const admin = createAdminClient();
  await logCancellationAudit(admin, { eventId, actorId: callerId, actorRole: "organizer", action: "event_cancelled" });

  const { data: registrants } = await supabase
    .from("form_responses")
    .select("id, respondent_id, response_data, payment_status, amount_paid_paise, razorpay_payment_id, status")
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .neq("respondent_id", callerId);
  const seen = new Set<string>();
  for (const r of registrants ?? []) {
    if (!r.respondent_id || seen.has(r.respondent_id)) continue;
    seen.add(r.respondent_id);
    const responseData = r.response_data as unknown as { name?: string; email?: string } | null;

    // Full refund for every paid, not-already-cancelled registration --
    // idempotency here is "only ever act on a row whose status isn't
    // already 'cancelled'", checked via the same atomic
    // `.neq("status","cancelled")` guard cancelMyRegistration uses, so
    // re-running this (a retried request, an admin re-triggering it) can
    // never double-refund a registration it already processed.
    if (r.status !== "cancelled" && r.payment_status === "paid" && r.razorpay_payment_id && (r.amount_paid_paise ?? 0) > 0) {
      const amountPaise = r.amount_paid_paise!;
      const { data: updated } = await admin
        .from("form_responses")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: "organizer", refund_status: "pending", refund_amount_paise: amountPaise, cancellation_charge_paise: 0 })
        .eq("id", r.id)
        .neq("status", "cancelled")
        .select("id")
        .maybeSingle();
      if (updated) {
        await logCancellationAudit(admin, {
          eventId,
          registrationId: r.id,
          actorId: callerId,
          actorRole: "organizer",
          action: "registration_cancelled",
          amountPaise,
          metadata: { reason: "Organizer cancelled the event" },
        });
        const { data: refundRow } = await admin
          .from("event_registration_refunds")
          .insert({ registration_id: r.id, amount_paise: amountPaise, status: "processing", reason: "Organizer cancelled the event" })
          .select("id")
          .single();
        await logCancellationAudit(admin, { eventId, registrationId: r.id, actorId: callerId, actorRole: "organizer", action: "refund_initiated", amountPaise });
        try {
          const refund = await createRazorpayRefund({ paymentId: r.razorpay_payment_id, amountPaise, notes: { registration_id: r.id, reason: "organizer_event_cancellation" } });
          await admin
            .from("event_registration_refunds")
            .update({ razorpay_refund_id: refund.id, status: refund.status === "processed" ? "completed" : "processing", completed_at: refund.status === "processed" ? new Date().toISOString() : null })
            .eq("id", refundRow!.id);
          await admin.from("form_responses").update({ refund_status: refund.status === "processed" ? "processed" : "processing", razorpay_refund_id: refund.id }).eq("id", r.id);
          if (refund.status === "processed") {
            await logCancellationAudit(admin, {
              eventId,
              registrationId: r.id,
              actorRole: "organizer",
              action: "refund_completed",
              amountPaise,
              metadata: { razorpayRefundId: refund.id },
            });
            if (responseData?.email) {
              try {
                await sendRefundProcessedEmail({ email: responseData.email, registrantName: responseData.name ?? "there", amountPaise });
              } catch (e) {
                console.error("Failed to send refund-processed email:", e);
              }
            }
          }
        } catch (e) {
          console.error("Razorpay refund failed for organizer event cancellation:", e);
          await admin.from("event_registration_refunds").update({ status: "failed" }).eq("id", refundRow!.id);
          await admin.from("form_responses").update({ refund_status: "failed" }).eq("id", r.id);
          await logCancellationAudit(admin, {
            eventId,
            registrationId: r.id,
            actorRole: "organizer",
            action: "refund_failed",
            amountPaise,
            metadata: { error: e instanceof Error ? e.message : String(e) },
          });
        }
      }
    }

    await admin.from("notifications").insert({
      user_id: r.respondent_id,
      type: "event_cancelled",
      title: "Event cancelled",
      body:
        r.payment_status === "paid"
          ? "The organizer cancelled an event you registered for. Your payment is being refunded automatically."
          : "The organizer cancelled an event you registered for. See our refund policy for details.",
      link: `/events/${eventId}`,
    });
    if (responseData?.email) {
      try {
        await sendEventCancelledEmail(supabase, {
          email: responseData.email,
          eventId,
          registrantName: responseData.name ?? "there",
        });
      } catch (e) {
        console.error("Failed to send event-cancelled email:", e);
      }
    }
  }

  // Best-effort settlement recompute -- an organizer-cancelled event
  // refunds everyone in full, so nothing should ever be shown as payable
  // for it afterward (same reasoning as cancelMyRegistrationCore's own
  // recompute call).
  try {
    await computeEventSettlement(admin, eventId);
  } catch (e) {
    console.error("Failed to recompute organizer settlement after event cancellation:", e);
  }

  return { error: null };
}
