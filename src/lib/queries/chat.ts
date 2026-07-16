import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAttachmentUrl } from "@/lib/resolveAttachmentUrl";

export type ChatMessage = {
  id: string;
  group_id: string;
  user_id: string;
  content: string | null;
  created_at: string;
  attachment_path: string | null;
  attachment_type: "image" | "video" | "file" | null;
  attachment_name: string | null;
  /** Resolved signed URL, not a raw DB column -- populated by
   * getGroupMessages (server) or the realtime handler (client), never
   * fetched from the table directly (see resolveAttachmentUrl). */
  attachment_url: string | null;
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
    .select(
      "id, group_id, user_id, content, created_at, attachment_path, attachment_type, attachment_name, profiles(display_name)",
    )
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Omit<ChatMessage, "attachment_url">[];
  const withUrls = await Promise.all(
    rows.map(async (m) => ({
      ...m,
      attachment_url: m.attachment_path ? await resolveAttachmentUrl(supabase, m.attachment_path) : null,
    })),
  );
  return withUrls.reverse();
}

/** One RPC per group -- community group counts are small (a handful per
 * community), so N tiny calls in parallel is simpler than trying to batch
 * a security-definer function across multiple ids in one round trip. */
export async function getUnreadCounts(supabase: SupabaseClient, groupIds: string[]): Promise<Record<string, number>> {
  const counts = await Promise.all(
    groupIds.map(async (groupId) => {
      const { data, error } = await supabase.rpc("get_group_unread_count", { p_group_id: groupId });
      return [groupId, error ? 0 : Number(data ?? 0)] as const;
    }),
  );
  return Object.fromEntries(counts);
}

// URL portion only of Linkify's own LINK_PATTERN (components/ui/Linkify.tsx)
// -- kept as its own constant here rather than importing that "use client"
// component's regex into this server-side query file. @handle mentions
// don't count as a "link" for this tab, just bare URLs -- same rule
// Linkify itself uses to decide what's clickable.
const URL_PATTERN = /https?:\/\/[^\s<>"]+/;

export type ChatMediaItem = {
  id: string;
  user_id: string;
  created_at: string;
  attachment_type: "image" | "video" | "file";
  attachment_name: string | null;
  attachment_url: string | null;
  profiles: { display_name: string } | null;
};

export type ChatLinkItem = {
  id: string;
  user_id: string;
  created_at: string;
  url: string;
  profiles: { display_name: string } | null;
};

// Most-recent-first, capped at 200 -- a "media & links" tab is a recency
// scan (same shape as WhatsApp's own), not a full-history export; the cap
// keeps this one query bounded rather than scanning a group's entire
// message history. `content.ilike.%http%` is a coarse server-side
// pre-filter (cheap, catches every real link plus some false positives
// like a message that just says "no http here"), then URL_PATTERN does
// the precise check in JS below.
const MEDIA_AND_LINKS_LIMIT = 200;

export async function getGroupMediaAndLinks(supabase: SupabaseClient, groupId: string) {
  const { data, error } = await supabase
    .from("community_messages")
    .select("id, user_id, content, created_at, attachment_path, attachment_type, attachment_name, profiles(display_name)")
    .eq("group_id", groupId)
    .or("attachment_path.not.is.null,content.ilike.%http%")
    .order("created_at", { ascending: false })
    .limit(MEDIA_AND_LINKS_LIMIT);
  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    id: string;
    user_id: string;
    content: string | null;
    created_at: string;
    attachment_path: string | null;
    attachment_type: "image" | "video" | "file" | null;
    attachment_name: string | null;
    profiles: { display_name: string } | null;
  }[];

  const mediaRows = rows.filter((r) => r.attachment_path && r.attachment_type);
  const media = await Promise.all(
    mediaRows.map(async (r) => ({
      id: r.id,
      user_id: r.user_id,
      created_at: r.created_at,
      attachment_type: r.attachment_type as "image" | "video" | "file",
      attachment_name: r.attachment_name,
      attachment_url: await resolveAttachmentUrl(supabase, r.attachment_path as string),
      profiles: r.profiles,
    })),
  );

  const links: ChatLinkItem[] = [];
  for (const r of rows) {
    if (!r.content) continue;
    const match = r.content.match(URL_PATTERN);
    if (match) links.push({ id: r.id, user_id: r.user_id, created_at: r.created_at, url: match[0], profiles: r.profiles });
  }

  return { media, links };
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
