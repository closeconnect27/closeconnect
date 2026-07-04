import type { SupabaseClient } from "@supabase/supabase-js";

export async function getMyRating(supabase: SupabaseClient, communityId: string, userId: string) {
  const { data } = await supabase
    .from("community_ratings")
    .select("rating, review")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as { rating: number; review: string | null } | null;
}
