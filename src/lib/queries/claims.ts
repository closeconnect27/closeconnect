import type { SupabaseClient } from "@supabase/supabase-js";

export type Claim = {
  id: string;
  community_id: string;
  claimant_user_id: string;
  name: string;
  phone: string;
  email: string;
  proof: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
};

export type PendingClaim = Claim & { communities: { name: string } | null };

/** Admin-only (RLS: claims_select_own_or_admin) -- the Organizer Dashboard's
 * claims-review queue. */
export async function getPendingClaims(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("claims")
    .select("*, communities(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as unknown as PendingClaim[];
}
