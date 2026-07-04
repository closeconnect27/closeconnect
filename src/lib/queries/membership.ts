import type { SupabaseClient } from "@supabase/supabase-js";

export type CommunityGroup = {
  id: string;
  community_id: string;
  name: string;
  description: string | null;
  is_announcement: boolean;
  is_default: boolean;
  created_at: string;
};

export type FormField = {
  id: string;
  owner_type: "event" | "community";
  owner_id: string;
  label: string;
  field_type: "text" | "textarea" | "email" | "phone" | "number" | "select";
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
};

export async function getCommunityMembership(
  supabase: SupabaseClient,
  communityId: string,
  userId: string,
) {
  const { data } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as { role: "owner" | "moderator" | "member" } | null;
}

/** Most recent join-request status for this user, so the UI doesn't let
 * them spam duplicate pending requests or re-request while one's already
 * pending. */
export async function getMyJoinRequestStatus(
  supabase: SupabaseClient,
  communityId: string,
  userId: string,
) {
  const { data } = await supabase
    .from("form_responses")
    .select("status")
    .eq("owner_type", "community")
    .eq("owner_id", communityId)
    .eq("respondent_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.status as "pending" | "approved" | "rejected" | undefined) ?? null;
}

export async function getCommunityGroups(supabase: SupabaseClient, communityId: string) {
  const { data, error } = await supabase
    .from("community_groups")
    .select("*")
    .eq("community_id", communityId)
    .order("is_default", { ascending: false })
    .order("name");
  if (error) throw error;
  return data as CommunityGroup[];
}

export async function getUserGroupMemberships(
  supabase: SupabaseClient,
  userId: string,
  groupIds: string[],
) {
  if (groupIds.length === 0) return new Set<string>();
  const { data, error } = await supabase
    .from("community_group_members")
    .select("group_id")
    .eq("user_id", userId)
    .in("group_id", groupIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.group_id as string));
}

export async function getCommunityFormFields(supabase: SupabaseClient, communityId: string) {
  const { data, error } = await supabase
    .from("form_fields")
    .select("*")
    .eq("owner_type", "community")
    .eq("owner_id", communityId)
    .order("sort_order");
  if (error) throw error;
  return data as FormField[];
}

export async function getCommunityMembers(supabase: SupabaseClient, communityId: string) {
  const { data, error } = await supabase
    .from("community_members")
    .select("user_id, role, joined_at, profiles(display_name, avatar_url)")
    .eq("community_id", communityId)
    .order("joined_at");
  if (error) throw error;
  return data as unknown as {
    user_id: string;
    role: "owner" | "moderator" | "member";
    joined_at: string;
    profiles: { display_name: string; avatar_url: string | null };
  }[];
}

export async function getPendingJoinRequests(supabase: SupabaseClient, communityId: string) {
  const { data, error } = await supabase
    .from("form_responses")
    .select("id, respondent_id, response_data, created_at, profiles(display_name)")
    .eq("owner_type", "community")
    .eq("owner_id", communityId)
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return data as unknown as {
    id: string;
    respondent_id: string;
    response_data: Record<string, string>;
    created_at: string;
    profiles: { display_name: string } | null;
  }[];
}
