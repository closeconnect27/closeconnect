import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayRefund } from "@/lib/razorpay";
import { trackServerEvent } from "@/lib/mixpanel/server";
import { sendRegistrationCancelledEmail } from "@/lib/eventRegistrationEmails";
import { logCancellationAudit } from "@/lib/cancellationAuditLog";
import { computeEventSettlement } from "@/lib/organizerSettlement";
import {
  calculateCancellationRefund,
  getEventStartInstant,
  validateCancellationRules,
  type CancellationPolicyRule,
  type CancellationPolicySnapshot,
} from "@/lib/eventCancellation";

// Core cancellation/preview logic, factored out of the "use server" web
// action file (app/actions/eventCancellation.ts) so the mobile API routes
// (app/api/mobile/registrations/[id]/...) can call the exact same code
// with a bearer-token-authenticated client instead of the web's
// cookie-based one -- same split cancelEventForHost (lib/cancelEvent.ts)
// already established for organizer event cancellation. `supabase` must
// already be authenticated as the calling user; `userId` is that same
// user's id (both callers already have it from their own auth check).

type RegistrationForCancellation = {
  id: string;
  respondent_id: string;
  owner_id: string;
  status: string;
  payment_status: string;
  amount_paid_paise: number | null;
  cancellation_policy_snapshot: unknown;
  response_data: unknown;
  razorpay_payment_id: string | null;
};

async function loadRegistrationForCancellation(supabase: SupabaseClient, registrationId: string, userId: string) {
  const { data: reg } = await supabase
    .from("form_responses")
    .select("id, respondent_id, owner_id, status, payment_status, amount_paid_paise, cancellation_policy_snapshot, response_data, razorpay_payment_id")
    .eq("id", registrationId)
    .eq("owner_type", "event")
    .maybeSingle();
  if (!reg || reg.respondent_id !== userId) return null;
  return reg as RegistrationForCancellation;
}

/** Read-only -- what the customer's own "Cancel booking" confirmation
 * screen shows before they commit (section 10/11). The backend, not the
 * frontend, computes every number here; cancelMyRegistrationCore below
 * recomputes the exact same thing right before acting on it, from the
 * exact same function, so preview and reality can never disagree. */
export async function previewCancellationCore(supabase: SupabaseClient, userId: string, registrationId: string) {
  const reg = await loadRegistrationForCancellation(supabase, registrationId, userId);
  if (!reg) return { error: "Registration not found.", result: null };
  if (reg.status === "cancelled") return { error: "This registration has already been cancelled.", result: null };

  const { data: event } = await supabase.from("events").select("event_date, event_time, status").eq("id", reg.owner_id).maybeSingle();
  if (!event) return { error: "Event not found.", result: null };
  if (event.status === "cancelled") return { error: "This event has already been cancelled by the organizer -- your refund is being processed automatically.", result: null };

  const eventStart = getEventStartInstant(event);
  if (eventStart && eventStart.getTime() <= Date.now()) return { error: "This event has already started, so cancellation is no longer available.", result: null };

  const amountPaidPaise = reg.amount_paid_paise ?? 0;
  const result = calculateCancellationRefund(amountPaidPaise, eventStart, reg.cancellation_policy_snapshot as CancellationPolicySnapshot | null);
  return { error: null, result: { ...result, amountPaidPaise } };
}

/** The real cancellation action (section 10/11/14/19/35/36). Every "never
 * trust the frontend" / "must be idempotent" / "customer can only cancel
 * their own booking" rule from the spec this was built from lives here --
 * see app/actions/eventCancellation.ts's own re-export for the fuller
 * comment (kept there, not duplicated, so it's only ever read/maintained
 * in one place). */
export async function cancelMyRegistrationCore(supabase: SupabaseClient, userId: string, registrationId: string, reason?: string) {
  const reg = await loadRegistrationForCancellation(supabase, registrationId, userId);
  if (!reg) return { error: "Registration not found." };
  if (reg.status === "cancelled") return { error: "This booking has already been cancelled." };

  const { data: event } = await supabase.from("events").select("event_name, event_date, event_time, status").eq("id", reg.owner_id).maybeSingle();
  if (!event) return { error: "Event not found." };
  if (event.status === "cancelled") return { error: "This event was already cancelled by the organizer -- your refund is being processed automatically, no further action needed." };

  const eventStart = getEventStartInstant(event);
  if (eventStart && eventStart.getTime() <= Date.now()) return { error: "This event has already started, so cancellation is no longer available." };

  const amountPaidPaise = reg.amount_paid_paise ?? 0;
  const calc = calculateCancellationRefund(amountPaidPaise, eventStart, reg.cancellation_policy_snapshot as CancellationPolicySnapshot | null);

  const admin = createAdminClient();
  const { data: updated } = await admin
    .from("form_responses")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "attendee",
      cancellation_reason: reason?.trim() || null,
      refund_status: calc.refundAmountPaise > 0 && reg.payment_status === "paid" ? "pending" : "none",
      refund_amount_paise: calc.refundAmountPaise,
      cancellation_charge_paise: calc.cancellationChargePaise,
    })
    .eq("id", registrationId)
    .neq("status", "cancelled")
    .select("id")
    .maybeSingle();
  if (!updated) return { error: "This booking was already updated -- refresh and try again." };

  const responseData = reg.response_data as unknown as { name?: string; email?: string } | null;

  await logCancellationAudit(admin, {
    eventId: reg.owner_id,
    registrationId,
    actorId: userId,
    actorRole: "attendee",
    action: "registration_cancelled",
    amountPaise: calc.refundAmountPaise,
    metadata: { cancellationChargePaise: calc.cancellationChargePaise, reason: reason?.trim() || null },
  });

  if (calc.refundAmountPaise > 0 && reg.payment_status === "paid" && reg.razorpay_payment_id) {
    const { data: refundRow } = await admin
      .from("event_registration_refunds")
      .insert({ registration_id: registrationId, amount_paise: calc.refundAmountPaise, status: "processing", reason: reason?.trim() || "Attendee cancellation" })
      .select("id")
      .single();
    await logCancellationAudit(admin, {
      eventId: reg.owner_id,
      registrationId,
      actorId: userId,
      actorRole: "attendee",
      action: "refund_initiated",
      amountPaise: calc.refundAmountPaise,
    });
    try {
      const refund = await createRazorpayRefund({
        paymentId: reg.razorpay_payment_id,
        amountPaise: calc.refundAmountPaise,
        notes: { registration_id: registrationId, reason: "attendee_cancellation" },
      });
      await admin
        .from("event_registration_refunds")
        .update({ razorpay_refund_id: refund.id, status: refund.status === "processed" ? "completed" : "processing", completed_at: refund.status === "processed" ? new Date().toISOString() : null })
        .eq("id", refundRow!.id);
      await admin
        .from("form_responses")
        .update({ refund_status: refund.status === "processed" ? "processed" : "processing", razorpay_refund_id: refund.id })
        .eq("id", registrationId);
      if (refund.status === "processed") {
        await logCancellationAudit(admin, {
          eventId: reg.owner_id,
          registrationId,
          actorRole: "attendee",
          action: "refund_completed",
          amountPaise: calc.refundAmountPaise,
          metadata: { razorpayRefundId: refund.id },
        });
      }
    } catch (e) {
      console.error("Razorpay refund failed for registration cancellation:", e);
      await admin.from("event_registration_refunds").update({ status: "failed" }).eq("id", refundRow!.id);
      await admin.from("form_responses").update({ refund_status: "failed" }).eq("id", registrationId);
      await logCancellationAudit(admin, {
        eventId: reg.owner_id,
        registrationId,
        actorRole: "attendee",
        action: "refund_failed",
        amountPaise: calc.refundAmountPaise,
        metadata: { error: e instanceof Error ? e.message : String(e) },
      });
      await admin.from("notifications").insert({
        user_id: userId,
        type: "refund_failed",
        title: "Refund couldn't be processed",
        body: "Your booking is cancelled, but the automatic refund failed. Contact support@closeconnect.in and we'll sort it out.",
        link: `/events/${reg.owner_id}`,
      });
    }
  }

  const { data: eventRow } = await admin.from("events").select("host_id").eq("id", reg.owner_id).maybeSingle();
  if (eventRow?.host_id) {
    await admin.from("notifications").insert({
      user_id: eventRow.host_id,
      type: "event_registration_cancelled",
      title: "Registration cancelled",
      body: `${responseData?.name ?? "A registrant"} cancelled their registration for ${event.event_name}.`,
      link: `/events/${reg.owner_id}/manage`,
    });
  }

  await admin.from("notifications").insert({
    user_id: userId,
    type: "registration_cancelled",
    title: "Booking cancelled",
    body: calc.refundAmountPaise > 0 ? `Refund of ₹${(calc.refundAmountPaise / 100).toLocaleString("en-IN")} is on its way.` : "No refund applies per this event's cancellation policy.",
    link: `/events/${reg.owner_id}`,
  });

  if (responseData?.email) {
    try {
      await sendRegistrationCancelledEmail(supabase, {
        email: responseData.email,
        eventId: reg.owner_id,
        registrantName: responseData.name ?? "there",
        refundAmountPaise: calc.refundAmountPaise,
        cancellationChargePaise: calc.cancellationChargePaise,
      });
    } catch (e) {
      console.error("Failed to send registration-cancelled email:", e);
    }
  }

  trackServerEvent("booking_cancelled", userId, {
    event_id: reg.owner_id,
    registration_id: registrationId,
    refund_amount_paise: calc.refundAmountPaise,
    cancellation_charge_paise: calc.cancellationChargePaise,
  });

  // Best-effort -- a cancellation/refund reduces what's owed to the
  // organizer, so their settlement ledger should reflect it right away
  // rather than waiting for their next dashboard visit. Never lets a
  // recompute failure undo an already-successful cancellation.
  try {
    await computeEventSettlement(admin, reg.owner_id);
  } catch (e) {
    console.error("Failed to recompute organizer settlement after cancellation:", e);
  }

  return { error: null, eventId: reg.owner_id as string, refundAmountPaise: calc.refundAmountPaise, cancellationChargePaise: calc.cancellationChargePaise };
}

export type SaveCancellationPolicyInput = { enabled: boolean; rules: CancellationPolicyRule[] };

/** Shared by the web "use server" action (app/actions/eventCancellation.ts)
 * and the mobile API route (app/api/mobile/events/[id]/cancellation-policy)
 * -- same split as every other cancellation operation in this file, so
 * validation/authorization can never drift between the two callers.
 * `supabase` must already be authenticated as the calling user; RLS
 * (event_cancellation_policies_host_manage, is_event_host) is the real
 * authorization gate, not this function -- an upsert against an event the
 * caller doesn't host matches zero rows rather than throwing, which is
 * why a 0-row result below is treated as a permission error. */
export async function saveCancellationPolicyCore(supabase: SupabaseClient, userId: string, eventId: string, input: SaveCancellationPolicyInput) {
  if (!input.enabled) {
    const { error } = await supabase
      .from("event_cancellation_policies")
      .upsert({ event_id: eventId, enabled: false, rules: [], updated_at: new Date().toISOString() }, { onConflict: "event_id" })
      .select();
    if (error) return { error: error.message };
    // Audit-logged via the admin client -- an organizer's own RLS-scoped
    // client has no insert policy on event_cancellation_audit_log (same
    // service-role-only posture as event_registration_refunds).
    await logCancellationAudit(createAdminClient(), {
      eventId,
      actorId: userId,
      actorRole: "organizer",
      action: "policy_updated",
      metadata: { enabled: false, tier_count: 0 },
    });
    return { error: null };
  }

  const { error: validationError, rules } = validateCancellationRules(input.rules);
  if (validationError) return { error: validationError };

  const { data, error } = await supabase
    .from("event_cancellation_policies")
    .upsert({ event_id: eventId, enabled: true, rules, updated_at: new Date().toISOString() }, { onConflict: "event_id" })
    .select();
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "You don't have permission to edit this event." };

  trackServerEvent("event_cancellation_policy_saved", userId, { event_id: eventId, enabled: true, tier_count: rules.length });
  await logCancellationAudit(createAdminClient(), {
    eventId,
    actorId: userId,
    actorRole: "organizer",
    action: "policy_updated",
    metadata: { enabled: true, tier_count: rules.length, rules },
  });
  return { error: null };
}
