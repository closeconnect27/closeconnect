import type { SupabaseClient } from "@supabase/supabase-js";

export type DmThreadKind = "community" | "event" | "profile";

/** This user's own "last read" marker for a batch of threads, of either
 * kind (0074) -- a thread with no row here (or one older than its last
 * message) reads as unread. Never throws on a missing row; a fresh user
 * simply has no reads yet. */
export async function getDmReadTimestamps(
  supabase: SupabaseClient,
  userId: string,
  kind: DmThreadKind,
  threadIds: string[],
): Promise<Map<string, string>> {
  if (threadIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("dm_reads")
    .select("thread_id, last_read_at")
    .eq("user_id", userId)
    .eq("thread_kind", kind)
    .in("thread_id", threadIds);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.thread_id as string, r.last_read_at as string]));
}

/** Shared by every inbox/reach-out button (community + event, staff +
 * member side) -- a thread is unread for `viewerId` when its last message
 * came from the OTHER party and arrived after `viewerId`'s own last-read
 * marker for that thread (or there's no marker at all yet). */
export function isThreadUnread(
  lastMessageAt: string,
  lastSenderId: string | null,
  viewerId: string,
  readAt: string | undefined,
): boolean {
  if (!lastMessageAt || !lastSenderId || lastSenderId === viewerId) return false;
  if (!readAt) return true;
  return lastMessageAt > readAt;
}
