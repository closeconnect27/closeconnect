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
