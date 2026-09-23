"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptBankAccountNumber } from "@/lib/bankEncryption";
import { createRazorpayContact, createRazorpayFundAccount, createRazorpayFundAccountValidation } from "@/lib/razorpay";
import { logPayoutAudit } from "@/lib/payoutAuditLog";
import { computeEventSettlement, initiateOrganizerPayout } from "@/lib/organizerSettlement";

export type PayoutAccountView = {
  id: string;
  bankName: string | null;
  last4: string;
  accountHolderName: string;
  verificationStatus: "not_verified" | "verification_pending" | "verified" | "verification_failed";
  verificationFailureReason: string | null;
  verifiedAt: string | null;
};

/** The organizer's own current payout account -- whatever's is_active,
 * regardless of is_primary (which only flips true once Razorpay actually
 * verifies it -- see the fund_account.validation.* webhook). Filtering on
 * is_primary here was a real bug: a freshly-added account sits
 * verification_pending/is_primary=false for however long the async
 * verification takes, during which this returned null and the "Payments
 * & Payouts" page looked like nothing had been saved at all -- reported
 * as "payouts section is not visible properly." savePayoutAccountCore
 * always deactivates the previous account before inserting a new one, so
 * there's only ever at most one is_active row to find here. Masked,
 * never the encrypted/decrypted number itself (section 6: "Never expose
 * the full account number to the frontend after saving"). */
export async function getMyPayoutAccount(): Promise<PayoutAccountView | null> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizer_payout_accounts")
    .select("id, bank_name, account_number_last4, account_holder_name, verification_status, verification_failure_reason, verified_at")
    .eq("organizer_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    bankName: data.bank_name,
    last4: data.account_number_last4,
    accountHolderName: data.account_holder_name,
    verificationStatus: data.verification_status,
    verificationFailureReason: data.verification_failure_reason,
    verifiedAt: data.verified_at,
  };
}

/** Looked up via Razorpay's free public IFSC directory (ifsc.razorpay.com)
 * -- not authenticated, no secret involved, just a convenience so the
 * organizer doesn't have to type their bank's name by hand. Best-effort:
 * a failed/unknown lookup just leaves bank_name null, never blocks saving
 * the account itself. */
async function lookupBankNameForIfsc(ifsc: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ifsc.razorpay.com/${encodeURIComponent(ifsc)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { BANK?: string };
    return data.BANK ?? null;
  } catch {
    return null;
  }
}

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Adds a new payout account and kicks off verification -- never
 * overwrites an existing verified account in place (section 13): the old
 * row (if any) is marked inactive/non-primary, and the new one starts
 * unverified with is_primary=false until Razorpay's fund account
 * validation actually confirms it (flipped by the webhook handler, not
 * here) -- so a settlement computed in the gap between "added" and
 * "verified" still correctly finds no verified account and stays pending,
 * rather than momentarily pointing at an unverified one. */
export async function savePayoutAccount(input: { accountHolderName: string; accountNumber: string; confirmAccountNumber: string; ifsc: string }) {
  const user = await requireUser();
  const result = await savePayoutAccountCore(user.id, input);
  if (!result.error) revalidatePath("/host/payments");
  return result;
}

/** Core logic, factored out so the mobile API route
 * (app/api/mobile/payouts/account/route.ts) can call it with just a
 * bearer-token-verified user id -- everything here already goes through
 * the admin client, never the caller's own cookie/RLS-scoped one, so there
 * was nothing web-specific to split out except requireUser() itself. */
export async function savePayoutAccountCore(userId: string, input: { accountHolderName: string; accountNumber: string; confirmAccountNumber: string; ifsc: string }) {
  const holderName = input.accountHolderName.trim();
  const accountNumber = input.accountNumber.trim();
  const ifsc = input.ifsc.trim().toUpperCase();

  if (!holderName) return { error: "Enter the account holder's name." };
  if (!/^\d{9,18}$/.test(accountNumber)) return { error: "Enter a valid bank account number." };
  if (accountNumber !== input.confirmAccountNumber.trim()) return { error: "Account numbers don't match." };
  if (!IFSC_RE.test(ifsc)) return { error: "Enter a valid IFSC code." };

  const admin = createAdminClient();
  const bankName = await lookupBankNameForIfsc(ifsc);
  const encrypted = await encryptBankAccountNumber(accountNumber);
  const last4 = accountNumber.slice(-4);

  // Supersede any existing current account first -- see this function's
  // own comment for why the new row starts non-primary.
  await admin.from("organizer_payout_accounts").update({ is_primary: false, is_active: false, updated_at: new Date().toISOString() }).eq("organizer_id", userId).eq("is_primary", true).eq("is_active", true);

  const { data: account, error } = await admin
    .from("organizer_payout_accounts")
    .insert({
      organizer_id: userId,
      account_holder_name: holderName,
      account_number_encrypted: encrypted,
      account_number_last4: last4,
      ifsc,
      bank_name: bankName,
      verification_status: "verification_pending",
      is_primary: false,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !account) return { error: error?.message ?? "Could not save payout account" };

  await logPayoutAudit(admin, {
    organizerId: userId,
    payoutAccountId: account.id,
    actorId: userId,
    actorRole: "organizer",
    action: "account_added",
    metadata: { bankName, last4 },
  });

  // Real Razorpay Fund Account Validation call (penny-drop) -- if
  // RazorpayX isn't enabled on this merchant account, this throws and the
  // account is left 'verification_failed' with an honest reason, not
  // silently stuck "pending" forever.
  try {
    const contact = await createRazorpayContact({ name: holderName, reference_id: account.id });
    const fundAccount = await createRazorpayFundAccount({ contactId: contact.id, accountHolderName: holderName, accountNumber, ifsc });
    const validation = await createRazorpayFundAccountValidation({ fundAccountId: fundAccount.id });
    await admin
      .from("organizer_payout_accounts")
      .update({ provider_contact_id: contact.id, provider_fund_account_id: fundAccount.id, provider_validation_id: validation.id })
      .eq("id", account.id);
    await logPayoutAudit(admin, { organizerId: userId, payoutAccountId: account.id, actorRole: "system", action: "verification_started", metadata: { provider_validation_id: validation.id } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Failed to start Razorpay fund account validation:", message);
    await admin.from("organizer_payout_accounts").update({ verification_status: "verification_failed", verification_failure_reason: "Couldn't start verification -- please try again or contact support." }).eq("id", account.id);
    await logPayoutAudit(admin, { organizerId: userId, payoutAccountId: account.id, actorRole: "system", action: "verification_failed", metadata: { error: message } });
  }

  return { error: null };
}

export type SettlementView = {
  id: string;
  eventId: string;
  eventName: string;
  grossSalesPaise: number;
  refundAmountPaise: number;
  platformFeePaise: number;
  netPayablePaise: number;
  ticketRevenuePaise: number;
  addonRevenuePaise: number;
  ticketRefundPaise: number;
  addonRefundPaise: number;
  status: string;
  failureReason: string | null;
  processedAt: string | null;
};

/** Recomputes (see computeEventSettlement's own comment on why this is
 * safe/necessary to do on every dashboard load) and lists every settlement
 * for the organizer's own events, newest first. Attempts the actual payout
 * for anything that just became eligible, same "compute then immediately
 * try to act" pairing initiateOrganizerPayout's caller is expected to do. */
export async function getMySettlements(): Promise<SettlementView[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: myEvents } = await supabase.from("events").select("id").eq("host_id", user.id);
  const eventIds = (myEvents ?? []).map((e) => e.id as string);
  if (eventIds.length === 0) return [];

  for (const eventId of eventIds) {
    const result = await computeEventSettlement(admin, eventId);
    if (result.status === "eligible" && result.settlementId) {
      await initiateOrganizerPayout(admin, result.settlementId);
    }
  }

  const { data: rows } = await admin
    .from("organizer_settlements")
    .select(
      "id, event_id, gross_sales_paise, refund_amount_paise, platform_fee_paise, net_payable_paise, ticket_revenue_paise, addon_revenue_paise, ticket_refund_paise, addon_refund_paise, status, failure_reason, processed_at, events(event_name)",
    )
    .eq("organizer_id", user.id)
    .order("updated_at", { ascending: false });

  return (rows ?? []).map((r) => ({
    id: r.id as string,
    eventId: r.event_id as string,
    eventName: (r.events as unknown as { event_name: string } | null)?.event_name ?? "Event",
    grossSalesPaise: r.gross_sales_paise as number,
    refundAmountPaise: r.refund_amount_paise as number,
    platformFeePaise: r.platform_fee_paise as number,
    netPayablePaise: r.net_payable_paise as number,
    ticketRevenuePaise: r.ticket_revenue_paise as number,
    addonRevenuePaise: r.addon_revenue_paise as number,
    ticketRefundPaise: r.ticket_refund_paise as number,
    addonRefundPaise: r.addon_refund_paise as number,
    status: r.status as string,
    failureReason: r.failure_reason as string | null,
    processedAt: r.processed_at as string | null,
  }));
}

// ===========================================================================
// ADMIN
// ===========================================================================

async function requireAdmin() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) throw new Error("Admin only");
  return user;
}

export type AdminSettlementView = SettlementView & { organizerName: string; payoutAccountMasked: string | null };

export async function getAllSettlementsForAdmin(): Promise<AdminSettlementView[]> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("organizer_settlements")
    .select(
      "id, event_id, organizer_id, gross_sales_paise, refund_amount_paise, platform_fee_paise, net_payable_paise, ticket_revenue_paise, addon_revenue_paise, ticket_refund_paise, addon_refund_paise, status, failure_reason, processed_at, events(event_name), organizer_payout_accounts(bank_name, account_number_last4)",
    )
    .order("updated_at", { ascending: false });

  const organizerIds = [...new Set((rows ?? []).map((r) => r.organizer_id as string))];
  const { data: profiles } = await admin.from("profiles").select("id, display_name").in("id", organizerIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));

  return (rows ?? []).map((r) => {
    const account = r.organizer_payout_accounts as unknown as { bank_name: string | null; account_number_last4: string } | null;
    return {
      id: r.id as string,
      eventId: r.event_id as string,
      eventName: (r.events as unknown as { event_name: string } | null)?.event_name ?? "Event",
      organizerName: nameById.get(r.organizer_id as string) ?? "Unknown",
      grossSalesPaise: r.gross_sales_paise as number,
      refundAmountPaise: r.refund_amount_paise as number,
      platformFeePaise: r.platform_fee_paise as number,
      netPayablePaise: r.net_payable_paise as number,
      ticketRevenuePaise: r.ticket_revenue_paise as number,
      addonRevenuePaise: r.addon_revenue_paise as number,
      ticketRefundPaise: r.ticket_refund_paise as number,
      addonRefundPaise: r.addon_refund_paise as number,
      status: r.status as string,
      failureReason: r.failure_reason as string | null,
      processedAt: r.processed_at as string | null,
      payoutAccountMasked: account ? `${account.bank_name ?? "Bank"} ****${account.account_number_last4}` : null,
    };
  });
}

/** Admin fallback for when the automated Razorpay payout path isn't
 * available (RazorpayX not enabled/funded) -- same "payout tracking, not
 * automation" escape hatch 0065's original markPayoutsSettled gave admins,
 * now attached to the correctly-computed settlement instead of a naive
 * per-registration flag. Only usable on a failed/eligible settlement, never
 * to fabricate a payout that was never actually sent. */
export async function markSettlementPaidManually(settlementId: string) {
  const adminUser = await requireAdmin();
  const admin = createAdminClient();

  const { data: settlement } = await admin.from("organizer_settlements").select("organizer_id, payout_account_id, net_payable_paise, status").eq("id", settlementId).maybeSingle();
  if (!settlement) return { error: "Settlement not found" };
  if (settlement.status === "processed") return { error: null };

  const { error } = await admin.from("organizer_settlements").update({ status: "processed", processed_at: new Date().toISOString(), failure_reason: null }).eq("id", settlementId);
  if (error) return { error: error.message };

  await logPayoutAudit(admin, {
    organizerId: settlement.organizer_id,
    payoutAccountId: settlement.payout_account_id,
    settlementId,
    actorId: adminUser.id,
    actorRole: "admin",
    action: "marked_paid_manually",
    amountPaise: settlement.net_payable_paise,
  });

  revalidatePath("/admin/payouts");
  return { error: null };
}

/** Admin-triggered retry for a failed settlement -- flips it back to
 * eligible (only from 'failed', never from 'processed') so
 * initiateOrganizerPayout's own atomic guard picks it up again. */
export async function retryOrganizerPayout(settlementId: string) {
  const adminUser = await requireAdmin();
  const admin = createAdminClient();

  const { data: settlement } = await admin.from("organizer_settlements").select("organizer_id, payout_account_id, net_payable_paise, status").eq("id", settlementId).maybeSingle();
  if (!settlement) return { error: "Settlement not found" };
  if (settlement.status !== "failed") return { error: "Only a failed settlement can be retried" };

  await admin.from("organizer_settlements").update({ status: "eligible", failure_reason: null }).eq("id", settlementId).eq("status", "failed");
  await logPayoutAudit(admin, {
    organizerId: settlement.organizer_id,
    payoutAccountId: settlement.payout_account_id,
    settlementId,
    actorId: adminUser.id,
    actorRole: "admin",
    action: "payout_retried",
    amountPaise: settlement.net_payable_paise,
  });

  const result = await initiateOrganizerPayout(admin, settlementId);
  revalidatePath("/admin/payouts");
  return result;
}
