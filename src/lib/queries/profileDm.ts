import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAttachmentUrl } from "@/lib/resolveAttachmentUrl";

export type ProfileDmParticipant = { display_name: string; avatar_url: string | null };

export type ProfileDmThread = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  last_message_at: string;
  requester: ProfileDmParticipant | null;
  recipient: ProfileDmParticipant | null;
};

// Thread row plus its most recent message (content + who sent it) -- needed
// for the inbox list's preview line and for isThreadUnread (dmReads.ts),
// which takes a sender id the bare thread row doesn't carry on its own
// (last_message_at is the only denormalized column on profile_dm_threads
// itself, same as community_dm_threads -- see getCommunityDmThreads).
export type ProfileDmThreadSummary = ProfileDmThread & {
  last_message_content: string | null;
  last_message_sender_id: string | null;
};

export type ProfileDmAttachmentType = "image" | "video" | "file" | "gif" | "voice";

export type ProfileDmMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  reply_to_message_id: string | null;
  attachment_path: string | null;
  attachment_type: ProfileDmAttachmentType | null;
  attachment_duration_seconds: number | null;
  attachment_name: string | null;
  /** Resolved signed URL for a storage-backed attachment, or the raw Giphy
   * CDN URL as-is for attachment_type "gif" (its attachment_path already IS
   * the external URL, not a storage path -- nothing to sign). Null for a
   * text-only message. Never a raw DB column. */
  attachment_url: string | null;
};

// A single string literal (not built via `+` concatenation) so supabase-js
// can parse it at the type level -- concatenation widens to plain `string`,
// which makes every embedded-join field (requester/recipient below) fall
// back to an untyped `GenericStringError` row instead of the real shape.
const THREAD_SELECT =
  "id, requester_id, recipient_id, status, created_at, last_message_at, requester:profiles!profile_dm_threads_requester_id_fkey(display_name, avatar_url), recipient:profiles!profile_dm_threads_recipient_id_fkey(display_name, avatar_url)" as const;

/** Given a thread row and the signed-in viewer, resolves which side is
 * "the other person" -- the one whose name/avatar the UI actually shows,
 * regardless of whether the viewer happens to be the requester or the
 * recipient. */
export function getOtherParticipant(
  thread: Pick<ProfileDmThread, "requester_id" | "recipient_id" | "requester" | "recipient">,
  viewerId: string,
): { id: string; display_name: string; avatar_url: string | null } {
  if (thread.requester_id === viewerId) {
    return {
      id: thread.recipient_id,
      display_name: thread.recipient?.display_name ?? "Member",
      avatar_url: thread.recipient?.avatar_url ?? null,
    };
  }
  return {
    id: thread.requester_id,
    display_name: thread.requester?.display_name ?? "Member",
    avatar_url: thread.requester?.avatar_url ?? null,
  };
}

/** Every thread the signed-in user is a party to, either side, most
 * recently active first -- the raw material for both the Primary and
 * Requests tabs on /messages (MessagesInbox splits it by status + who's
 * the requester, it isn't two separate queries). */
export async function getProfileDmThreads(supabase: SupabaseClient, userId: string): Promise<ProfileDmThreadSummary[]> {
  const { data: threads, error } = await supabase
    .from("profile_dm_threads")
    .select(THREAD_SELECT)
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  if (!threads || threads.length === 0) return [];

  const threadIds = threads.map((t) => t.id as string);
  // Most-recent-message-per-thread, same pattern as getCommunityDmThreads:
  // one query across every thread ordered newest-first, then keep only the
  // first row seen per thread_id, rather than N per-thread queries.
  const { data: messages, error: messagesError } = await supabase
    .from("profile_dm_messages")
    .select("thread_id, content, sender_id, created_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false });
  if (messagesError) throw messagesError;

  const lastByThread = new Map<string, { content: string | null; sender_id: string }>();
  for (const m of messages ?? []) {
    const threadId = m.thread_id as string;
    if (!lastByThread.has(threadId)) {
      lastByThread.set(threadId, { content: m.content as string | null, sender_id: m.sender_id as string });
    }
  }

  return (threads as unknown as ProfileDmThread[]).map((t) => {
    const last = lastByThread.get(t.id);
    return {
      ...t,
      last_message_content: last?.content ?? null,
      last_message_sender_id: last?.sender_id ?? null,
    };
  });
}

export async function getProfileDmThreadById(supabase: SupabaseClient, threadId: string): Promise<ProfileDmThread | null> {
  const { data, error } = await supabase.from("profile_dm_threads").select(THREAD_SELECT).eq("id", threadId).maybeSingle();
  if (error) throw error;
  return data as unknown as ProfileDmThread | null;
}

/** Finds an existing thread between two users regardless of who's the
 * requester -- profile_dm_threads_pair_idx (0123) guarantees at most one
 * ever exists for a given unordered pair. */
export async function findProfileDmThreadBetween(
  supabase: SupabaseClient,
  userId: string,
  otherUserId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("profile_dm_threads")
    .select("id")
    .or(
      `and(requester_id.eq.${userId},recipient_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},recipient_id.eq.${userId})`,
    )
    .maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

export async function getProfileDmThreadMessages(supabase: SupabaseClient, threadId: string): Promise<ProfileDmMessage[]> {
  const { data, error } = await supabase
    .from("profile_dm_messages")
    .select("id, thread_id, sender_id, content, created_at, reply_to_message_id, attachment_path, attachment_type, attachment_duration_seconds, attachment_name")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as Omit<ProfileDmMessage, "attachment_url">[];
  return Promise.all(
    rows.map(async (m) => ({
      ...m,
      attachment_url: await resolveDmAttachmentUrl(supabase, m.attachment_path, m.attachment_type),
    })),
  );
}

/** attachment_type "gif" stores the full Giphy CDN URL directly in
 * attachment_path (not a chat-attachments storage path) -- signing it
 * through resolveAttachmentUrl would just fail, so it's used as-is. Every
 * other attachment type is a real storage path that needs a signed URL. */
export async function resolveDmAttachmentUrl(
  supabase: SupabaseClient,
  attachmentPath: string | null,
  attachmentType: ProfileDmAttachmentType | null,
): Promise<string | null> {
  if (!attachmentPath) return null;
  if (attachmentType === "gif") return attachmentPath;
  return resolveAttachmentUrl(supabase, attachmentPath);
}
