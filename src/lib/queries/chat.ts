import type { SupabaseClient } from "@supabase/supabase-js";

export type ChatMessage = {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: { display_name: string } | null;
};

export async function isGroupMember(supabase: SupabaseClient, groupId: string, userId: string) {
  const { data } = await supabase
    .from("community_group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/** Mirrors community_messages_select_group_members's RLS logic (0020):
 * announcement groups are readable by any community member, decoupled from
 * having separately joined that specific sub-group -- every other group
 * still requires an explicit community_group_members row. */
export async function canReadGroup(
  supabase: SupabaseClient,
  group: { id: string; community_id: string; is_announcement: boolean },
  userId: string,
) {
  if (await isGroupMember(supabase, group.id, userId)) return true;
  if (!group.is_announcement) return false;

  const { data } = await supabase
    .from("community_members")
    .select("user_id")
    .eq("community_id", group.community_id)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/** Mirrors community_messages_insert_group_members's RLS logic (0020):
 * only staff (owner/moderator) can post to announcement groups; every other
 * group requires ordinary group membership. */
export async function canPostToGroup(
  supabase: SupabaseClient,
  group: { id: string; community_id: string; is_announcement: boolean },
  userId: string,
) {
  if (group.is_announcement) {
    const { data } = await supabase
      .from("community_members")
      .select("role")
      .eq("community_id", group.community_id)
      .eq("user_id", userId)
      .maybeSingle();
    return data?.role === "owner" || data?.role === "moderator";
  }
  return isGroupMember(supabase, group.id, userId);
}

export async function getGroupMessages(supabase: SupabaseClient, groupId: string, limit = 50) {
  const { data, error } = await supabase
    .from("community_messages")
    .select("id, group_id, user_id, content, created_at, profiles(display_name)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as ChatMessage[]).reverse();
}

export async function getGroupById(supabase: SupabaseClient, groupId: string) {
  const { data, error } = await supabase
    .from("community_groups")
    .select("*")
    .eq("id", groupId)
    .single();
  if (error) throw error;
  return data as { id: string; community_id: string; name: string; is_announcement: boolean };
}
