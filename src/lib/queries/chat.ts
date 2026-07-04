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
