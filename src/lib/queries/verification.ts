import type { SupabaseClient } from "@supabase/supabase-js";

export type OrganizerStats = {
  communitiesCreated: number;
  eventsHosted: number;
  totalMembersManaged: number;
};

/** Computed live, not stored/duplicated -- communities_select_public and
 * events' own public select cover the counts; member_count is each
 * community's own maintained counter (see on_community_created() /
 * membership triggers, 0001_init.sql), summed rather than re-counting
 * community_members directly. */
export async function getOrganizerStats(supabase: SupabaseClient, profileId: string): Promise<OrganizerStats> {
  const [{ count: communitiesCreated }, { count: eventsHosted }, { data: ownedCommunities }] = await Promise.all([
    supabase.from("communities").select("*", { count: "exact", head: true }).eq("owner_id", profileId),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("host_id", profileId),
    supabase.from("communities").select("member_count").eq("owner_id", profileId),
  ]);

  const totalMembersManaged = (ownedCommunities ?? []).reduce((sum, c) => sum + (c.member_count ?? 0), 0);

  return {
    communitiesCreated: communitiesCreated ?? 0,
    eventsHosted: eventsHosted ?? 0,
    totalMembersManaged,
  };
}
