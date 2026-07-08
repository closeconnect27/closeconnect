import type { SupabaseClient } from "@supabase/supabase-js";

/** RLS (event_interests_select_own_or_visible_to_host) resolves this for
 * the caller themselves regardless of who they are. */
export async function getMyInterestStatus(supabase: SupabaseClient, eventId: string, userId: string) {
  const { data, error } = await supabase
    .from("event_interests")
    .select("visible_to_host")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as { visible_to_host: boolean } | null;
}

/** Always reflects everyone interested, opted-in or not -- see
 * get_event_interest_count (0040) for why this can't just be a row count
 * through the caller's own RLS-scoped client. Returns 0 for a non-host
 * caller (the function's own internal check), not an error. */
export async function getEventInterestCount(supabase: SupabaseClient, eventId: string) {
  const { data, error } = await supabase.rpc("get_event_interest_count", { p_event_id: eventId });
  if (error) throw error;
  return (data as number) ?? 0;
}

export type InterestedUser = { userId: string; displayName: string; avatarUrl: string | null };

/** Host-only, and only the rows marked visible_to_host -- RLS
 * (event_interests_select_own_or_visible_to_host) is the actual gate; a
 * non-host caller just gets their own row back (if any) or nothing. */
export async function getVisibleInterestedUsers(supabase: SupabaseClient, eventId: string) {
  const { data, error } = await supabase
    .from("event_interests")
    .select("user_id, profiles(display_name, avatar_url)")
    .eq("event_id", eventId)
    .eq("visible_to_host", true);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: row.user_id as string,
    displayName: (row.profiles as unknown as { display_name: string } | null)?.display_name ?? "Someone",
    avatarUrl: (row.profiles as unknown as { avatar_url: string | null } | null)?.avatar_url ?? null,
  })) as InterestedUser[];
}
