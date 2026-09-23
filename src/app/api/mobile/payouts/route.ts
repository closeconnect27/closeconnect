import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventSettlement, initiateOrganizerPayout } from "@/lib/organizerSettlement";
import type { SettlementView } from "@/app/actions/organizerPayouts";

// Mobile counterpart of getMyPayoutAccount + getMySettlements
// (app/actions/organizerPayouts.ts) -- same bearer-token pattern as every
// other mobile route, same recompute-on-read posture as the web dashboard.
function clientFromBearer(token: string) {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });

  const supabase = clientFromBearer(token);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });

  const { data: accountRow } = await supabase
    .from("organizer_payout_accounts")
    .select("id, bank_name, account_number_last4, account_holder_name, verification_status, verification_failure_reason, verified_at")
    .eq("organizer_id", user.id)
    .eq("is_primary", true)
    .eq("is_active", true)
    .maybeSingle();
  const account = accountRow
    ? {
        id: accountRow.id,
        bankName: accountRow.bank_name,
        last4: accountRow.account_number_last4,
        accountHolderName: accountRow.account_holder_name,
        verificationStatus: accountRow.verification_status,
        verificationFailureReason: accountRow.verification_failure_reason,
        verifiedAt: accountRow.verified_at,
      }
    : null;

  const admin = createAdminClient();
  const { data: myEvents } = await supabase.from("events").select("id").eq("host_id", user.id);
  const eventIds = (myEvents ?? []).map((e) => e.id as string);
  for (const eventId of eventIds) {
    const result = await computeEventSettlement(admin, eventId);
    if (result.status === "eligible" && result.settlementId) {
      await initiateOrganizerPayout(admin, result.settlementId);
    }
  }

  const { data: rows } = await admin
    .from("organizer_settlements")
    .select("id, event_id, gross_sales_paise, refund_amount_paise, platform_fee_paise, net_payable_paise, status, failure_reason, processed_at, events(event_name)")
    .eq("organizer_id", user.id)
    .order("updated_at", { ascending: false });

  const settlements: SettlementView[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    eventId: r.event_id as string,
    eventName: (r.events as unknown as { event_name: string } | null)?.event_name ?? "Event",
    grossSalesPaise: r.gross_sales_paise as number,
    refundAmountPaise: r.refund_amount_paise as number,
    platformFeePaise: r.platform_fee_paise as number,
    netPayablePaise: r.net_payable_paise as number,
    status: r.status as string,
    failureReason: r.failure_reason as string | null,
    processedAt: r.processed_at as string | null,
  }));

  return NextResponse.json({ account, settlements });
}
