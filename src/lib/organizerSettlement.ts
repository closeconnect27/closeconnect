import type { SupabaseClient } from "@supabase/supabase-js";
import { isEventPast } from "@/lib/eventStatus";
import { createRazorpayPayout } from "@/lib/razorpay";
import { logPayoutAudit } from "@/lib/payoutAuditLog";

// The ONE place an organizer's payable amount gets calculated -- same
// "never duplicate this logic" posture as calculateCancellationRefund.
// Matches terms/page.tsx's actual published policy verbatim: "CloseConnect
// does not deduct a commission from ticket sales; hosts receive the full
// ticket price collected, less any payment gateway processing charges."
// A single named constant, not scattered -- change this the moment that
// policy page's own wording changes, and nowhere else.
export const PLATFORM_FEE_PERCENT = 0;

export type SettlementStatus = "pending" | "eligible" | "processing" | "processed" | "failed" | "on_hold";

type RegistrationMoneyRow = {
  status: string;
  amount_paid_paise: number | null;
  refund_amount_paise: number | null;
  gateway_fee_paise: number | null;
};

/** Recomputes and upserts the settlement row for one event -- safe to call
 * as often as needed (dashboard loads, right after a cancellation/refund
 * changes the underlying numbers) since it's the app's actual "settlement
 * schedule" in the absence of a cron (see the migration's own comment).
 * Never regresses a settlement that's already processing/processed back to
 * eligible/pending, even if new refunds arrive afterward -- clawing back an
 * already-paid-out amount is a deliberately separate, not-yet-built
 * feature (spec: "do not create negative or duplicate payouts"), so a
 * post-payout refund just gets recorded in the ledger numbers without
 * touching status or the historical payout_account_id snapshot. */
export async function computeEventSettlement(admin: SupabaseClient, eventId: string): Promise<{ error: string | null; settlementId: string | null; status: SettlementStatus | null }> {
  const { data: event } = await admin.from("events").select("host_id, event_date, event_end_date, status").eq("id", eventId).maybeSingle();
  if (!event) return { error: "Event not found", settlementId: null, status: null };
  const organizerId = event.host_id as string;

  const { data: rows } = await admin
    .from("form_responses")
    .select("status, amount_paid_paise, refund_amount_paise, gateway_fee_paise")
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .eq("payment_status", "paid");
  const moneyRows = (rows ?? []) as RegistrationMoneyRow[];

  const grossSalesPaise = moneyRows.reduce((sum, r) => sum + (r.amount_paid_paise ?? 0), 0);
  const refundAmountPaise = moneyRows.filter((r) => r.status === "cancelled").reduce((sum, r) => sum + (r.refund_amount_paise ?? 0), 0);
  const gatewayFeePaise = moneyRows.reduce((sum, r) => sum + (r.gateway_fee_paise ?? 0), 0);
  const netEligibleSalesPaise = Math.max(0, grossSalesPaise - refundAmountPaise);
  const platformFeePaise = Math.round((netEligibleSalesPaise * PLATFORM_FEE_PERCENT) / 100);
  const netPayablePaise = Math.max(0, netEligibleSalesPaise - platformFeePaise - gatewayFeePaise);

  const { data: existing } = await admin.from("organizer_settlements").select("id, status, payout_account_id").eq("event_id", eventId).maybeSingle();
  const locked = existing?.status === "processing" || existing?.status === "processed";

  const { data: payoutAccount } = await admin
    .from("organizer_payout_accounts")
    .select("id")
    .eq("organizer_id", organizerId)
    .eq("is_primary", true)
    .eq("is_active", true)
    .eq("verification_status", "verified")
    .maybeSingle();

  let status: SettlementStatus;
  if (locked) {
    status = existing!.status as SettlementStatus;
  } else if (netPayablePaise <= 0) {
    status = "pending";
  } else if (event.status === "cancelled" ? false : !isEventPast({ event_date: event.event_date, event_end_date: event.event_end_date })) {
    // Not yet -- settlement happens after the event completes (or, for a
    // cancelled event, once its refund wave has already run its course --
    // cancelEventForHost recomputes this itself once refunds are issued).
    status = "pending";
  } else if (!payoutAccount) {
    status = "pending";
  } else {
    status = "eligible";
  }

  const payoutAccountId = locked ? (existing!.payout_account_id as string | null) : (payoutAccount?.id ?? null);

  const { data: settlement, error } = await admin
    .from("organizer_settlements")
    .upsert(
      {
        organizer_id: organizerId,
        event_id: eventId,
        payout_account_id: payoutAccountId,
        gross_sales_paise: grossSalesPaise,
        refund_amount_paise: refundAmountPaise,
        platform_fee_paise: platformFeePaise,
        net_payable_paise: netPayablePaise,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id" },
    )
    .select("id")
    .single();
  if (error) return { error: error.message, settlementId: null, status: null };

  await logPayoutAudit(admin, {
    organizerId,
    payoutAccountId,
    settlementId: settlement.id,
    actorRole: "system",
    action: "settlement_computed",
    amountPaise: netPayablePaise,
    metadata: { grossSalesPaise, refundAmountPaise, platformFeePaise, gatewayFeePaise, status },
  });

  return { error: null, settlementId: settlement.id, status };
}

/** Attempts the actual Razorpay payout for a settlement already marked
 * 'eligible' -- a real API call, not a simulation: if RazorpayX Payouts
 * isn't enabled/funded on this merchant account, this genuinely fails and
 * the settlement becomes 'failed' with a reason an admin can act on (the
 * existing manual "mark as paid out" admin flow remains the fallback for
 * exactly that case, same "payout tracking, not automation" posture 0065
 * originally shipped with, now with an automated first attempt in front of
 * it). Idempotent: only ever acts on a row whose status is still
 * 'eligible', via the same atomic `.eq("status","eligible")` update guard
 * every other money-moving write in this app uses. */
export async function initiateOrganizerPayout(admin: SupabaseClient, settlementId: string): Promise<{ error: string | null }> {
  const { data: settlement } = await admin
    .from("organizer_settlements")
    .select("id, organizer_id, event_id, payout_account_id, net_payable_paise, status")
    .eq("id", settlementId)
    .maybeSingle();
  if (!settlement) return { error: "Settlement not found" };
  if (settlement.status !== "eligible") return { error: null }; // not our turn -- not an error, just a no-op

  const { data: locked } = await admin
    .from("organizer_settlements")
    .update({ status: "processing", initiated_at: new Date().toISOString() })
    .eq("id", settlementId)
    .eq("status", "eligible")
    .select("id")
    .maybeSingle();
  if (!locked) return { error: null }; // another call already claimed it

  await logPayoutAudit(admin, {
    organizerId: settlement.organizer_id,
    payoutAccountId: settlement.payout_account_id,
    settlementId,
    actorRole: "system",
    action: "payout_initiated",
    amountPaise: settlement.net_payable_paise,
  });

  const { data: account } = await admin
    .from("organizer_payout_accounts")
    .select("provider_fund_account_id")
    .eq("id", settlement.payout_account_id)
    .maybeSingle();
  if (!account?.provider_fund_account_id) {
    await admin.from("organizer_settlements").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "No verified payout account on file" }).eq("id", settlementId);
    return { error: "No verified payout account on file" };
  }

  try {
    const payout = await createRazorpayPayout({
      fundAccountId: account.provider_fund_account_id,
      amountPaise: settlement.net_payable_paise,
      referenceId: settlementId,
      narration: `CloseConnect payout - event ${settlement.event_id}`,
    });
    const processed = payout.status === "processed";
    await admin
      .from("organizer_settlements")
      .update({
        status: processed ? "processed" : "processing",
        provider_payout_id: payout.id,
        processed_at: processed ? new Date().toISOString() : null,
      })
      .eq("id", settlementId);
    if (processed) {
      await logPayoutAudit(admin, {
        organizerId: settlement.organizer_id,
        payoutAccountId: settlement.payout_account_id,
        settlementId,
        actorRole: "system",
        action: "payout_processed",
        amountPaise: settlement.net_payable_paise,
        metadata: { providerPayoutId: payout.id },
      });
      await admin.from("notifications").insert({
        user_id: settlement.organizer_id,
        type: "payout_processed",
        title: "Payout processed",
        body: `₹${(settlement.net_payable_paise / 100).toLocaleString("en-IN")} has been sent to your payout account.`,
        link: "/host/payments",
      });
    } else {
      await admin.from("notifications").insert({
        user_id: settlement.organizer_id,
        type: "payout_processed",
        title: "Payout initiated",
        body: `Your payout of ₹${(settlement.net_payable_paise / 100).toLocaleString("en-IN")} has been initiated.`,
        link: "/host/payments",
      });
    }
    return { error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Organizer payout failed:", message);
    await admin.from("organizer_settlements").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: message }).eq("id", settlementId);
    await logPayoutAudit(admin, {
      organizerId: settlement.organizer_id,
      payoutAccountId: settlement.payout_account_id,
      settlementId,
      actorRole: "system",
      action: "payout_failed",
      amountPaise: settlement.net_payable_paise,
      metadata: { error: message },
    });
    await admin.from("notifications").insert({
      user_id: settlement.organizer_id,
      type: "payout_failed",
      title: "Payout couldn't be processed",
      body: "We couldn't process your payout. Please check your payout account details or contact support@closeconnect.in.",
      link: "/host/payments",
    });
    return { error: message };
  }
}
