import type { SupabaseClient } from "@supabase/supabase-js";

// Mirrors src/lib/queries/dm.ts exactly, for "contact host" (0074) instead
// of "reach out to admin" -- event_id/host_id where that one uses
// community_id/owner_id.
export type EventDmMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export type EventDmThreadSummary = {
  id: string;
  member_id: string;
  member_name: string;
  last_message: string | null;
  last_message_at: string;
  last_sender_id: string | null;
};

export async function getEventDmThreadMessages(supabase: SupabaseClient, threadId: string) {
  const { data, error } = await supabase
    .from("event_dm_messages")
    .select("id, sender_id, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at");
  if (error) throw error;
  return data as EventDmMessage[];
}

/** The signed-in attendee's own thread with this event's host, if they've
 * ever reached out -- null threadId means they haven't yet. */
export async function getMyEventDmThread(supabase: SupabaseClient, eventId: string, userId: string) {
  const { data: thread } = await supabase
    .from("event_dm_threads")
    .select("id")
    .eq("event_id", eventId)
    .eq("member_id", userId)
    .maybeSingle();
  if (!thread) return { threadId: null as string | null, messages: [] as EventDmMessage[] };

  const messages = await getEventDmThreadMessages(supabase, thread.id as string);
  return { threadId: thread.id as string, messages };
}

/** Host-only inbox: every attendee thread for this event, most recently
 * active first -- same per-thread last-message-in-JS shape as
 * getCommunityDmThreads (expected volume is small). */
export async function getEventDmThreads(supabase: SupabaseClient, eventId: string) {
  const { data: threads, error } = await supabase
    .from("event_dm_threads")
    .select("id, member_id, profiles(display_name)")
    .eq("event_id", eventId);
  if (error) throw error;
  if (!threads || threads.length === 0) return [];

  const threadIds = threads.map((t) => t.id as string);
  const { data: messages, error: messagesError } = await supabase
    .from("event_dm_messages")
    .select("thread_id, content, created_at, sender_id")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false });
  if (messagesError) throw messagesError;

  const lastByThread = new Map<string, { content: string; created_at: string; sender_id: string }>();
  for (const m of messages ?? []) {
    const threadId = m.thread_id as string;
    if (!lastByThread.has(threadId)) {
      lastByThread.set(threadId, { content: m.content as string, created_at: m.created_at as string, sender_id: m.sender_id as string });
    }
  }

  return (threads as unknown as { id: string; member_id: string; profiles: { display_name: string } | null }[])
    .map((t) => {
      const last = lastByThread.get(t.id);
      return {
        id: t.id,
        member_id: t.member_id,
        member_name: t.profiles?.display_name ?? "Attendee",
        last_message: last?.content ?? null,
        last_message_at: last?.created_at ?? "",
        last_sender_id: last?.sender_id ?? null,
      };
    })
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
}
