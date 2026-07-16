import type { SupabaseClient } from "@supabase/supabase-js";

export type HostPaymentDetails = {
  upi_id: string | null;
  qr_image_url: string | null;
};

/** RLS (host_payment_details_select_public, 0066) is unconditional select --
 * this is meant to be shown to any registrant paying that host, the same
 * audience a host would hand a QR screenshot to directly. `null` here means
 * the host hasn't set anything up yet, not a permissions gate. */
export async function getHostPaymentDetails(supabase: SupabaseClient, hostId: string) {
  const { data, error } = await supabase
    .from("host_payment_details")
    .select("upi_id, qr_image_url")
    .eq("id", hostId)
    .maybeSingle();
  if (error) throw error;
  return data as HostPaymentDetails | null;
}
