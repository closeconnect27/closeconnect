import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileDetails = {
  id: string;
  interests: string[] | null;
  occupation: string | null;
  company: string | null;
  college: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  instagram_url: string | null;
  skills: string[];
};

/** RLS (profile_details_select, 0035) is the actual visibility gate -- this
 * returns null when the row exists but this viewer isn't allowed to see it
 * (public/members_only/private+accepted-follow-request), or when the id
 * doesn't exist at all. Callers can't and shouldn't try to distinguish the
 * two: from the caller's side, "not visible" is the only fact that
 * matters. bio and profile_visibility itself are NOT gated this way -- see
 * getPublicProfileBasic, which reads them from `profiles` (always public). */
export async function getProfileDetails(supabase: SupabaseClient, profileId: string) {
  const { data, error } = await supabase.from("profile_details").select("*").eq("id", profileId).maybeSingle();
  if (error) throw error;
  return data as ProfileDetails | null;
}

export type PublicProfileBasic = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  host_rating: number;
  /** Companion to host_rating (0054) -- lets the UI tell "0 because no
   * reviews exist yet" (show a "New host" label) apart from "0 because
   * the real average is that low". */
  host_rating_count: number;
  is_founding_host: boolean;
  bio: string | null;
  /** Tiptap ProseMirror JSON -- null for bios written before the rich
   * editor existed. RichTextView falls back to the plain `bio` above
   * when this is null. */
  bio_content: object | null;
  profile_visibility: "public" | "members_only" | "private";
  is_verified: boolean;
  verified_phone: boolean;
  verified_email: boolean;
};

/** display_name/avatar_url/host_rating/bio/profile_visibility/is_verified
 * are all on `profiles`, not profile_details -- profiles_select_public is
 * unrestricted (0001_init.sql), so this always resolves for any real
 * profile id. bio lives here specifically so it's visible regardless of
 * profile_visibility (0035); profile_visibility itself has to be readable
 * by everyone too, or a viewer could never be shown a "Request to follow"
 * button on a private profile in the first place. Verification status
 * (0037) is likewise meant to be publicly visible -- a badge no one but
 * the owner could see wouldn't do anything. */
export async function getPublicProfileBasic(supabase: SupabaseClient, profileId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, avatar_url, host_rating, host_rating_count, is_founding_host, bio, bio_content, profile_visibility, is_verified, verified_phone, verified_email",
    )
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data as PublicProfileBasic | null;
}

export type PublicJoinedCommunity = {
  id: string;
  name: string;
  category: string;
  role: "owner" | "moderator" | "member";
};

/** community_members_select_public (0001_init.sql) is already unrestricted
 * -- who's a member of what is public data independent of profile_visibility
 * -- so this is a plain query, not gated on profile_details at all. The
 * profile PAGE still only renders this section when the viewer can see the
 * profile at all (see /profile/[id]/page.tsx), for one coherent "this
 * profile is private" experience even though this specific data could
 * technically be read on its own. */
export async function getCommunitiesJoinedPublic(supabase: SupabaseClient, profileId: string) {
  const { data: memberships, error: mErr } = await supabase
    .from("community_members")
    .select("community_id, role")
    .eq("user_id", profileId);
  if (mErr) throw mErr;
  if (!memberships || memberships.length === 0) return [];

  const roleByCommunity = new Map(memberships.map((m) => [m.community_id as string, m.role as string]));
  const { data, error } = await supabase
    .from("communities")
    .select("id, name, category")
    .in("id", [...roleByCommunity.keys()]);
  if (error) throw error;

  return (data ?? []).map((c) => ({
    ...c,
    role: roleByCommunity.get(c.id) as PublicJoinedCommunity["role"],
  })) as PublicJoinedCommunity[];
}

export type PublicAttendedEvent = {
  id: string;
  event_name: string;
  event_date: string | null;
  city: string | null;
  category: string | null;
};

/** Relies entirely on form_responses_select_public_event_attendance (0033)
 * to do the actual gating -- approved responses to already-passed events,
 * filtered by the respondent's own profile_visibility. A viewer this policy
 * doesn't cover for this respondent simply gets zero rows back, same as
 * getProfileDetails above. */
export async function getEventsAttendedPublic(supabase: SupabaseClient, profileId: string) {
  const { data: responses, error: rErr } = await supabase
    .from("form_responses")
    .select("owner_id")
    .eq("owner_type", "event")
    .eq("respondent_id", profileId)
    .eq("status", "approved");
  if (rErr) throw rErr;
  if (!responses || responses.length === 0) return [];

  const eventIds = [...new Set(responses.map((r) => r.owner_id as string))];
  const { data, error } = await supabase
    .from("events")
    .select("id, event_name, event_date, city, category")
    .in("id", eventIds)
    .lt("event_date", new Date().toISOString().slice(0, 10))
    .order("event_date", { ascending: false });
  if (error) throw error;
  return data as PublicAttendedEvent[];
}

export type FollowRequestStatus = "none" | "pending" | "accepted" | "rejected";

/** pfr_select_own (0035) covers both directions -- the caller can be either
 * the requester or the target of a matching row -- so this resolves
 * correctly regardless of which side of the relationship `viewerId` is on.
 * Returns "none" for an unauthenticated viewer (no row could exist for a
 * null requester) without a separate query. */
export async function getFollowRequestStatus(supabase: SupabaseClient, targetId: string, viewerId: string | null) {
  if (!viewerId || viewerId === targetId) return "none" as FollowRequestStatus;
  const { data, error } = await supabase
    .from("profile_follow_requests")
    .select("status")
    .eq("requester_id", viewerId)
    .eq("target_id", targetId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.status ?? "none") as FollowRequestStatus;
}

/** Whether the viewer is following this profile at all -- "following" means
 * either an instant follow (profile_follows, 0061, public/members_only) OR
 * an accepted follow request (profile_follow_requests, 0035, the private
 * flow). These are two different tables/mechanisms, but from the UI's
 * side it's one concept: if either exists, the button should say
 * "Following", regardless of the profile's current visibility -- a
 * profile switching from private to public later shouldn't make an
 * existing follower look unfollowed. */
export async function getIsFollowing(supabase: SupabaseClient, targetId: string, viewerId: string | null) {
  if (!viewerId || viewerId === targetId) return false;
  const [{ data: follow, error: followError }, { data: request, error: requestError }] = await Promise.all([
    supabase.from("profile_follows").select("follower_id").eq("follower_id", viewerId).eq("followee_id", targetId).maybeSingle(),
    supabase
      .from("profile_follow_requests")
      .select("id")
      .eq("requester_id", viewerId)
      .eq("target_id", targetId)
      .eq("status", "accepted")
      .maybeSingle(),
  ]);
  if (followError) throw followError;
  if (requestError) throw requestError;
  return !!follow || !!request;
}

export type IncomingFollowRequest = {
  id: string;
  requester_id: string;
  created_at: string;
  requester: { display_name: string; avatar_url: string | null } | null;
};

/** pfr_select_own (0035) is the gate -- only resolves for the signed-in
 * target themselves. */
export async function getIncomingFollowRequests(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profile_follow_requests")
    .select("id, requester_id, created_at, requester:profiles!profile_follow_requests_requester_id_fkey(display_name, avatar_url)")
    .eq("target_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as IncomingFollowRequest[];
}
