"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { findProfileDmThreadBetween } from "@/lib/queries/profileDm";
import type { ProfileDmAttachmentType } from "@/lib/queries/profileDm";

const MAX_LEN = 2000; // profile_dm_messages_content_check (0123): 1..2000

/** The entry point from a profile's "Message" button -- finds the pair's
 * existing thread (either direction; profile_dm_threads_pair_idx, 0123,
 * guarantees at most one) or creates it as a fresh 'pending' request. The
 * BEFORE INSERT trigger (set_profile_dm_thread_initial_status, 0126)
 * upgrades that to 'accepted' server-side when the recipient already
 * follows the requester -- this never sets status itself. */
export async function startOrGetProfileDmThread(otherUserId: string) {
  const user = await requireUser();
  if (otherUserId === user.id) return { error: "You can't message yourself", threadId: null };

  const supabase = await createClient();

  const existing = await findProfileDmThreadBetween(supabase, user.id, otherUserId);
  if (existing) return { error: null, threadId: existing.id };

  const { data: created, error } = await supabase
    .from("profile_dm_threads")
    .insert({ requester_id: user.id, recipient_id: otherUserId })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation -- a concurrent call from another tab/device
    // already created this pair's thread between the select above and this
    // insert; re-select rather than erroring out, same race handled by
    // sendCommunityDm (dm.ts).
    if (error.code === "23505") {
      const retry = await findProfileDmThreadBetween(supabase, user.id, otherUserId);
      if (retry) return { error: null, threadId: retry.id };
    }
    // is_blocked_pair (RLS, 0123) rejects the insert outright when either
    // side has blocked the other -- surfaced as a plain, friendly message
    // rather than the raw RLS denial text.
    if (error.code === "42501") return { error: "You can't message this person", threadId: null };
    return { error: error.message, threadId: null };
  }
  if (!created) return { error: "Could not start this conversation", threadId: null };

  revalidatePath("/messages");
  return { error: null, threadId: created.id as string };
}

export async function sendProfileDmMessage(
  threadId: string,
  input: {
    content?: string;
    attachmentPath?: string;
    attachmentType?: ProfileDmAttachmentType;
    attachmentName?: string;
    attachmentDurationSeconds?: number;
    replyToMessageId?: string;
  },
) {
  const user = await requireUser();
  const text = input.content?.trim() || undefined;
  if (!text && !input.attachmentPath) return { error: "Message can't be empty" };
  if (text && text.length > MAX_LEN) return { error: "Message is too long" };

  const supabase = await createClient();
  const { error } = await supabase.from("profile_dm_messages").insert({
    thread_id: threadId,
    sender_id: user.id,
    content: text ?? null,
    attachment_path: input.attachmentPath ?? null,
    attachment_type: input.attachmentType ?? null,
    attachment_duration_seconds: input.attachmentDurationSeconds ?? null,
    attachment_name: input.attachmentName ?? null,
    reply_to_message_id: input.replyToMessageId ?? null,
  });

  if (error) {
    // The rate-limit trigger's exception message is safe to surface as-is
    // -- written for end users, same convention as sendMessage (chat.ts).
    if (error.message.includes("too quickly")) return { error: error.message };
    // RLS (profile_dm_messages_insert, 0123) blocks a recipient from
    // replying into a still-'pending' thread they haven't accepted -- the
    // UI (ProfileDmThreadView) already hides the composer for that case,
    // this is the server-side backstop.
    if (error.code === "42501") return { error: "You need to accept this request before you can reply" };
    return { error: "Could not send message" };
  }

  revalidatePath(`/messages/${threadId}`);
  revalidatePath("/messages");
  return { error: null };
}

/** Recipient-only, and only while still 'pending' -- RLS
 * (profile_dm_threads_update_recipient, 0123) is the real gate; this can't
 * accept a thread the caller isn't the recipient of, or one already
 * decided. */
export async function acceptProfileDmThread(threadId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("profile_dm_threads")
    .update({ status: "accepted" }, { count: "exact" })
    .eq("id", threadId)
    .eq("recipient_id", user.id)
    .eq("status", "pending");

  if (error) return { error: error.message };
  if (!count) return { error: "Could not accept this request" };

  revalidatePath(`/messages/${threadId}`);
  revalidatePath("/messages");
  return { error: null };
}

export async function declineProfileDmThread(threadId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("profile_dm_threads")
    .update({ status: "declined" }, { count: "exact" })
    .eq("id", threadId)
    .eq("recipient_id", user.id)
    .eq("status", "pending");

  if (error) return { error: error.message };
  if (!count) return { error: "Could not decline this request" };

  revalidatePath(`/messages/${threadId}`);
  revalidatePath("/messages");
  return { error: null };
}

// Sender-only, hard delete -- RLS (profile_dm_messages_delete_own, 0123) is
// the real gate; the explicit .eq("sender_id", ...) here just turns "not
// yours" into a clear error, same convention as deleteCommunityDmMessage.
export async function deleteProfileDmMessage(messageId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("profile_dm_messages")
    .delete({ count: "exact" })
    .eq("id", messageId)
    .eq("sender_id", user.id);

  if (error) return { error: error.message };
  if (!count) return { error: "You can only delete your own messages" };
  return { error: null };
}

// "Delete chat" -- per-user (RLS-backed via profile_dm_thread_hides_insert/
// update_own, 0136), not a shared hard delete: removes the thread from the
// caller's own inbox without touching the other participant's copy or the
// messages themselves. A new message after this brings it back into view.
export async function deleteProfileDmChat(threadId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("profile_dm_thread_hides")
    .upsert({ thread_id: threadId, user_id: user.id, hidden_at: new Date().toISOString() }, { onConflict: "thread_id,user_id" });
  if (error) return { error: error.message };

  revalidatePath("/messages");
  return { error: null };
}
