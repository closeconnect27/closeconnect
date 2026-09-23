import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by every writer of event_cancellation_audit_log (0142) --
// saveCancellationPolicyCore, cancelMyRegistrationCore, cancelEventForHost,
// and the Razorpay refund webhook -- so every action type gets recorded the
// same shape regardless of which flow triggered it. `admin` must be a
// service-role client: authenticated users have no insert policy on this
// table (see the migration's own comment), matching event_registration_refunds.
//
// Never allowed to break the flow that triggered it -- an audit log write
// failing is a shame, not a reason to leave a cancellation/refund half-done,
// so every call site wraps this in the same try/catch posture already used
// for this feature's email sends.
export type CancellationAuditAction = "policy_updated" | "registration_cancelled" | "event_cancelled" | "refund_initiated" | "refund_completed" | "refund_failed";
export type CancellationAuditActorRole = "attendee" | "organizer" | "system";

export async function logCancellationAudit(
  admin: SupabaseClient,
  entry: {
    eventId: string;
    registrationId?: string | null;
    actorId?: string | null;
    actorRole: CancellationAuditActorRole;
    action: CancellationAuditAction;
    amountPaise?: number | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("event_cancellation_audit_log").insert({
      event_id: entry.eventId,
      registration_id: entry.registrationId ?? null,
      actor_id: entry.actorId ?? null,
      actor_role: entry.actorRole,
      action: entry.action,
      amount_paise: entry.amountPaise ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    console.error("Failed to write cancellation audit log entry:", entry.action, e);
  }
}
