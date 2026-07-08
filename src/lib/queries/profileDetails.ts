import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileDetails = {
  id: string;
  bio: string | null;
  interests: string[] | null;
  occupation: string | null;
  company: string | null;
  college: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  instagram_url: string | null;
  skills: string[];
  profile_visibility: "public" | "members_only" | "private";
};

/** RLS (profile_details_select, 0033) is the actual visibility gate -- this
 * returns null both when the row genuinely doesn't exist (shouldn't happen,
 * every profile gets one at signup) and when it exists but this viewer
 * isn't allowed to see it. Callers can't and shouldn't try to distinguish
 * the two: from the caller's side, "not visible" is the only fact that
 * matters. */
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
};

/** display_name/avatar_url/host_rating are on `profiles`, not
 * profile_details -- profiles_select_public is unrestricted (0001_init.sql)
 * since basic attribution is relied on everywhere else in the app, so this
 * always resolves for any real profile id regardless of profile_visibility. */
export async function getPublicProfileBasic(supabase: SupabaseClient, profileId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, host_rating")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data as PublicProfileBasic | null;
}

export type PublicJoinedCommunity = {
  id: string;
  name: string;
  logo_url: string | null;
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
    .select("id, name, logo_url, category")
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
