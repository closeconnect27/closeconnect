import type { SupabaseClient } from "@supabase/supabase-js";

// Same shared-writer pattern as cancellationAuditLog.ts. `admin` must be a
// service-role client (no authenticated insert policy on payout_audit_log).
// metadata must NEVER carry a full account number or any decrypted bank
// value -- callers only ever pass last4/bank_name/provider ids/error text.
export type PayoutAuditAction =
  | "account_added"
  | "verification_started"
  | "verification_succeeded"
  | "verification_failed"
  | "account_superseded"
  | "settlement_computed"
  | "payout_initiated"
  | "payout_processed"
  | "payout_failed"
  | "payout_retried"
  | "marked_paid_manually";

export async function logPayoutAudit(
  admin: SupabaseClient,
  entry: {
    organizerId: string;
    payoutAccountId?: string | null;
    settlementId?: string | null;
    actorId?: string | null;
    actorRole: "organizer" | "admin" | "system";
    action: PayoutAuditAction;
    amountPaise?: number | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("payout_audit_log").insert({
      organizer_id: entry.organizerId,
      payout_account_id: entry.payoutAccountId ?? null,
      settlement_id: entry.settlementId ?? null,
      actor_id: entry.actorId ?? null,
      actor_role: entry.actorRole,
      action: entry.action,
      amount_paise: entry.amountPaise ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    console.error("Failed to write payout audit log entry:", entry.action, e);
  }
}
