import type { SupabaseClient } from "@supabase/supabase-js";

export type DmMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export type DmThreadSummary = {
  id: string;
  member_id: string;
  member_name: string;
  last_message: string | null;
  last_message_at: string;
};

export async function getDmThreadMessages(supabase: SupabaseClient, threadId: string) {
  const { data, error } = await supabase
    .from("community_dm_messages")
    .select("id, sender_id, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at");
  if (error) throw error;
  return data as DmMessage[];
}

/** The signed-in member's own thread with this community's owner, if
 * they've ever reached out -- null threadId (with an empty message list)
 * means they haven't yet, which ReachOutButton treats as "not started",
 * not an error. */
export async function getMyDmThread(supabase: SupabaseClient, communityId: string, userId: string) {
  const { data: thread } = await supabase
    .from("community_dm_threads")
    .select("id")
    .eq("community_id", communityId)
    .eq("member_id", userId)
    .maybeSingle();
  if (!thread) return { threadId: null as string | null, messages: [] as DmMessage[] };

  const messages = await getDmThreadMessages(supabase, thread.id as string);
  return { threadId: thread.id as string, messages };
}

/** Staff-only inbox: every member thread for this community, most
 * recently active first. A per-thread last-message lookup rather than a
 * denormalized column -- expected volume is small (one thread per member
 * who's ever reached out), so this stays simple. */
export async function getCommunityDmThreads(supabase: SupabaseClient, communityId: string) {
  const { data: threads, error } = await supabase
    .from("community_dm_threads")
    .select("id, member_id, profiles(display_name)")
    .eq("community_id", communityId);
  if (error) throw error;
  if (!threads || threads.length === 0) return [];

  const threadIds = threads.map((t) => t.id as string);
  const { data: messages, error: messagesError } = await supabase
    .from("community_dm_messages")
    .select("thread_id, content, created_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false });
  if (messagesError) throw messagesError;

  const lastByThread = new Map<string, { content: string; created_at: string }>();
  for (const m of messages ?? []) {
    const threadId = m.thread_id as string;
    if (!lastByThread.has(threadId)) {
      lastByThread.set(threadId, { content: m.content as string, created_at: m.created_at as string });
    }
  }

  return (threads as unknown as { id: string; member_id: string; profiles: { display_name: string } | null }[])
    .map((t) => {
      const last = lastByThread.get(t.id);
      return {
        id: t.id,
        member_id: t.member_id,
        member_name: t.profiles?.display_name ?? "Member",
        last_message: last?.content ?? null,
        last_message_at: last?.created_at ?? "",
      };
    })
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
}
