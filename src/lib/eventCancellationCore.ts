import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayRefund } from "@/lib/razorpay";
import { trackServerEvent } from "@/lib/mixpanel/server";
import { sendRegistrationCancelledEmail } from "@/lib/eventRegistrationEmails";
import { logCancellationAudit } from "@/lib/cancellationAuditLog";
import { computeEventSettlement } from "@/lib/organizerSettlement";
import { getRegistrationAddonLines } from "@/lib/eventAddonBilling";
import {
  calculateItemizedCancellationRefund,
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
  const addonLines = await getRegistrationAddonLines(supabase, registrationId);
  const addonTotalPaise = addonLines.reduce((sum, a) => sum + a.amountPaise, 0);
  const ticketAmountPaise = Math.max(0, amountPaidPaise - addonTotalPaise);
  const result = calculateItemizedCancellationRefund(
    ticketAmountPaise,
    addonLines.map((a) => ({ id: a.id, nameSnapshot: a.nameSnapshot, amountPaise: a.amountPaise, isRefundable: a.isRefundable })),
    eventStart,
    reg.cancellation_policy_snapshot as CancellationPolicySnapshot | null,
  );
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
  const addonLines = await getRegistrationAddonLines(supabase, registrationId);
  const addonTotalPaise = addonLines.reduce((sum, a) => sum + a.amountPaise, 0);
  const ticketAmountPaise = Math.max(0, amountPaidPaise - addonTotalPaise);
  const calc = calculateItemizedCancellationRefund(
    ticketAmountPaise,
    addonLines.map((a) => ({ id: a.id, nameSnapshot: a.nameSnapshot, amountPaise: a.amountPaise, isRefundable: a.isRefundable })),
    eventStart,
    reg.cancellation_policy_snapshot as CancellationPolicySnapshot | null,
  );

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

  // Line-item breakdown (section 27/68: an add-on's own refund status,
  // independent of whether the ticket itself stays active) -- every
  // refundable line got its share of the same percentage the ticket did;
  // a non-refundable line's refundAmountPaise is always 0, so this only
  // ever marks a line 'refunded' when money actually moved for it.
  for (const line of calc.addonLines) {
    if (line.refundAmountPaise > 0) {
      await admin.from("form_response_addons").update({ refund_amount_paise: line.refundAmountPaise, status: "refunded" }).eq("id", line.id);
    }
  }

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

// ===========================================================================
// ORGANIZER-INITIATED SINGLE-ADD-ON REFUND (section 27/68 "Partial Refund")
// ===========================================================================

/** A host refunding just one purchased add-on line (e.g. an item that
 * turned out to be unavailable) WITHOUT cancelling the attendee's ticket
 * or touching the rest of the order -- deliberately independent of the
 * event's own cancellation-policy percentage (that policy only ever
 * governs an attendee choosing to cancel, same posture cancelEventForHost
 * already establishes for organizer-initiated action): the host is
 * choosing to refund this specific line in full, not applying a
 * time-based tier to it. `supabase` must already be authenticated as the
 * calling user; host/admin ownership is checked directly against the
 * event's host_id below (RLS on form_response_addons has no host-write
 * policy at all -- see 0153's own comment -- so this function, not RLS,
 * is the real authorization gate, exactly like cancelEventForHost's own
 * host_id comparison). */
export async function refundAddonLineCore(supabase: SupabaseClient, userId: string, addonLineId: string) {
  const { data: line } = await supabase
    .from("form_response_addons")
    .select("id, registration_id, name_snapshot, unit_price_paise, quantity, status")
    .eq("id", addonLineId)
    .maybeSingle();
  if (!line) return { error: "Add-on purchase not found." };
  if (line.status === "refunded") return { error: "This add-on has already been refunded." };

  const { data: reg } = await supabase
    .from("form_responses")
    .select("id, owner_id, respondent_id, status, payment_status, razorpay_payment_id, refund_amount_paise, response_data")
    .eq("id", line.registration_id)
    .maybeSingle();
  if (!reg) return { error: "Registration not found." };
  if (reg.status === "cancelled") return { error: "This booking is already cancelled -- its refund already covers every add-on on it." };
  if (reg.payment_status !== "paid" || !reg.razorpay_payment_id) return { error: "This booking was never paid for, so there's nothing to refund." };

  const { data: event } = await supabase.from("events").select("event_name, host_id").eq("id", reg.owner_id).maybeSingle();
  if (!event) return { error: "Event not found." };
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  if (event.host_id !== userId && !profile?.is_admin) return { error: "You don't have permission to refund this." };

  const amountPaise = (line.unit_price_paise as number) * (line.quantity as number);
  if (amountPaise <= 0) return { error: "This add-on has nothing to refund." };

  const admin = createAdminClient();
  // cancellationAuditLog's actor_role is only ever attendee/organizer/
  // system (no separate 'admin' value at the DB level) -- an admin acting
  // here logs as 'organizer' with actorIsAdmin noted in metadata, same
  // resolution payoutAuditLog's own broader 'admin' role doesn't need
  // because this table predates admin-initiated refunds.
  const isAdminActor = event.host_id !== userId;
  const { data: locked } = await admin.from("form_response_addons").update({ status: "refunded", refund_amount_paise: amountPaise }).eq("id", addonLineId).eq("status", "active").select("id").maybeSingle();
  if (!locked) return { error: "This add-on was already refunded -- refresh and try again." };

  await logCancellationAudit(admin, {
    eventId: reg.owner_id,
    registrationId: reg.id,
    actorId: userId,
    actorRole: "organizer",
    action: "refund_initiated",
    amountPaise,
    metadata: { addonLineId, addonName: line.name_snapshot, scope: "addon_line", actorIsAdmin: isAdminActor },
  });

  const { data: refundRow } = await admin
    .from("event_registration_refunds")
    .insert({ registration_id: reg.id, amount_paise: amountPaise, status: "processing", reason: `Add-on refund: ${line.name_snapshot}` })
    .select("id")
    .single();

  try {
    const refund = await createRazorpayRefund({
      paymentId: reg.razorpay_payment_id,
      amountPaise,
      notes: { registration_id: reg.id, addon_line_id: addonLineId, reason: "addon_line_refund" },
    });
    const processed = refund.status === "processed";
    await admin
      .from("event_registration_refunds")
      .update({ razorpay_refund_id: refund.id, status: processed ? "completed" : "processing", completed_at: processed ? new Date().toISOString() : null })
      .eq("id", refundRow!.id);
    // Cumulative: this is one line among possibly several refunds already
    // recorded against the same registration (another add-on line refunded
    // earlier, say) -- add to whatever's already there rather than
    // overwriting it, same reasoning cancelMyRegistrationCore's single
    // whole-order write doesn't need but this incremental one does.
    await admin
      .from("form_responses")
      .update({ refund_amount_paise: (reg.refund_amount_paise ?? 0) + amountPaise, refund_status: processed ? "processed" : "processing" })
      .eq("id", reg.id);
    if (processed) {
      await logCancellationAudit(admin, {
        eventId: reg.owner_id,
        registrationId: reg.id,
        actorRole: "organizer",
        action: "refund_completed",
        amountPaise,
        metadata: { addonLineId, addonName: line.name_snapshot, razorpayRefundId: refund.id, actorIsAdmin: isAdminActor },
      });
    }
  } catch (e) {
    console.error("Razorpay refund failed for add-on line refund:", e);
    await admin.from("event_registration_refunds").update({ status: "failed" }).eq("id", refundRow!.id);
    await admin.from("form_response_addons").update({ status: "active", refund_amount_paise: 0 }).eq("id", addonLineId);
    await logCancellationAudit(admin, {
      eventId: reg.owner_id,
      registrationId: reg.id,
      actorRole: "organizer",
      action: "refund_failed",
      amountPaise,
      metadata: { addonLineId, addonName: line.name_snapshot, error: e instanceof Error ? e.message : String(e), actorIsAdmin: isAdminActor },
    });
    return { error: "The refund couldn't be processed. Please try again or contact support." };
  }

  if (reg.respondent_id) {
    await admin.from("notifications").insert({
      user_id: reg.respondent_id,
      type: "refund_processed",
      title: "Add-on refunded",
      body: `${line.name_snapshot} (₹${(amountPaise / 100).toLocaleString("en-IN")}) was refunded for ${event.event_name}. Your ticket is still valid.`,
      link: `/events/${reg.owner_id}`,
    });
  }

  try {
    await computeEventSettlement(admin, reg.owner_id);
  } catch (e) {
    console.error("Failed to recompute organizer settlement after add-on refund:", e);
  }

  trackServerEvent("addon_refunded", userId, { event_id: reg.owner_id, registration_id: reg.id, addon_line_id: addonLineId, amount_paise: amountPaise });

  return { error: null, eventId: reg.owner_id as string, amountRefundedPaise: amountPaise };
}
