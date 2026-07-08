import type { SupabaseClient } from "@supabase/supabase-js";

export type VerificationRequest = {
  id: string;
  target_type: "community" | "organizer";
  target_id: string;
  requested_by: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export type VerificationRequestStatus = "none" | "pending" | "approved" | "rejected";

/** RLS (verification_requests_select_own_or_admin) resolves this for the
 * requester themselves; a non-requester, non-admin caller just gets "none"
 * back (zero rows, not an error) regardless of what's actually there. */
export async function getMyVerificationRequestStatus(
  supabase: SupabaseClient,
  targetType: "community" | "organizer",
  targetId: string,
  requesterId: string,
) {
  const { data, error } = await supabase
    .from("verification_requests")
    .select("status")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("requested_by", requesterId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.status ?? "none") as VerificationRequestStatus;
}

export type PendingVerificationRequest = VerificationRequest & {
  targetLabel: string;
  requesterName: string;
};

/** Admin-only (RLS: verification_requests_select_own_or_admin) -- the
 * Organizer Dashboard's verification queue. target_id is polymorphic
 * (community or profile depending on target_type, same shape as
 * form_fields/form_responses elsewhere in this schema), so there's no
 * single foreign-table embed PostgREST could do here -- resolved in a
 * second pass and merged in JS, same pattern as getMyRegisteredEvents. */
export async function getPendingVerificationRequests(supabase: SupabaseClient) {
  const { data: requests, error } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!requests || requests.length === 0) return [];

  const communityIds = requests.filter((r) => r.target_type === "community").map((r) => r.target_id as string);
  const organizerIds = requests.filter((r) => r.target_type === "organizer").map((r) => r.target_id as string);
  const requesterIds = [...new Set(requests.map((r) => r.requested_by as string))];

  const [{ data: communities }, { data: organizers }, { data: requesters }] = await Promise.all([
    communityIds.length
      ? supabase.from("communities").select("id, name").in("id", communityIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    organizerIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", organizerIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    supabase.from("profiles").select("id, display_name").in("id", requesterIds),
  ]);

  const communityNameById = new Map((communities ?? []).map((c) => [c.id, c.name]));
  const organizerNameById = new Map((organizers ?? []).map((o) => [o.id, o.display_name]));
  const requesterNameById = new Map((requesters ?? []).map((r) => [r.id, r.display_name]));

  return requests.map((r) => ({
    ...r,
    targetLabel:
      r.target_type === "community"
        ? (communityNameById.get(r.target_id) ?? "Unknown community")
        : (organizerNameById.get(r.target_id) ?? "Unknown organizer"),
    requesterName: requesterNameById.get(r.requested_by) ?? "Someone",
  })) as PendingVerificationRequest[];
}

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
