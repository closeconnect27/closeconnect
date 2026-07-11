import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAttachmentUrl } from "@/lib/resolveAttachmentUrl";

export type Claim = {
  id: string;
  community_id: string;
  claimant_user_id: string;
  name: string;
  phone: string;
  email: string;
  proof: string | null;
  proof_image_paths: string[] | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
};

export type PendingClaim = Claim & { communities: { name: string } | null; proofImageUrls: string[] };

/** Admin-only (RLS: claims_select_own_or_admin) -- the Organizer Dashboard's
 * claims-review queue. proof_image_paths (claim-proof-images, a private
 * bucket) are resolved to signed URLs here since the section rendering
 * them is a client component with no server-side storage access of its
 * own -- same reasoning as chat attachments' attachment_url. */
export async function getPendingClaims(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("claims")
    .select("*, communities(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const claims = data as unknown as PendingClaim[];
  for (const claim of claims) {
    claim.proofImageUrls = claim.proof_image_paths
      ? (
          await Promise.all(claim.proof_image_paths.map((p) => resolveAttachmentUrl(supabase, p, "claim-proof-images")))
        ).filter((url): url is string => url !== null)
      : [];
  }
  return claims;
}
