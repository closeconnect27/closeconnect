import type { SupabaseClient } from "@supabase/supabase-js";

/** Sums a registration's own snapshotted add-on rows (form_response_addons
 * -- unit_price_paise/quantity frozen at the moment each add-on was
 * selected, never re-read from the live event_addons price) -- the single
 * source every money-computing call site (createRazorpayOrderForRegistration,
 * verifyRazorpayPayment, the payment.captured webhook) uses, so the ticket
 * price plus add-on total can never be computed two different ways. */
export async function getRegistrationAddonTotalPaise(supabase: SupabaseClient, registrationId: string): Promise<number> {
  const { data } = await supabase.from("form_response_addons").select("unit_price_paise, quantity").eq("registration_id", registrationId);
  return (data ?? []).reduce((sum, r) => sum + (r.unit_price_paise as number) * (r.quantity as number), 0);
}

export type RegistrationAddonLine = { id: string; nameSnapshot: string; amountPaise: number; isRefundable: boolean; status: "active" | "refunded" };

/** Itemized version of getRegistrationAddonTotalPaise -- one row per
 * purchased add-on line, joined to event_addons.is_refundable (0154) so
 * the cancellation engine knows which lines follow the event's refund
 * policy and which are unconditionally non-refundable. A line whose
 * add-on was later deleted (addon_id null, on delete set null) is
 * treated as still refundable -- its own historical name/price snapshot
 * survives regardless, and there's no live row left to say otherwise. */
export async function getRegistrationAddonLines(supabase: SupabaseClient, registrationId: string): Promise<RegistrationAddonLine[]> {
  const { data } = await supabase
    .from("form_response_addons")
    .select("id, name_snapshot, unit_price_paise, quantity, status, addon_id, event_addons(is_refundable)")
    .eq("registration_id", registrationId);
  return (data ?? []).map((r) => {
    const addon = r.event_addons as unknown as { is_refundable: boolean } | null;
    return {
      id: r.id as string,
      nameSnapshot: r.name_snapshot as string,
      amountPaise: (r.unit_price_paise as number) * (r.quantity as number),
      isRefundable: addon?.is_refundable ?? true,
      status: r.status as "active" | "refunded",
    };
  });
}
