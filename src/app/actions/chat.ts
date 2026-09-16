"use server";

import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { sendMessageSchema, type SendMessageAttachment } from "@/lib/validation/chat";

export async function sendMessage(groupId: string, content: string, attachment?: SendMessageAttachment) {
  const user = await requireUser();

  const parsed = sendMessageSchema.safeParse({ content: content || undefined, attachment });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid message" };
  }
  if (!parsed.data.content && !parsed.data.attachment) {
    return { error: "Message can't be empty" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("community_messages").insert({
    group_id: groupId,
    user_id: user.id,
    content: parsed.data.content ?? null,
    attachment_path: parsed.data.attachment?.path ?? null,
    attachment_type: parsed.data.attachment?.type ?? null,
    attachment_name: parsed.data.attachment?.name ?? null,
    attachment_duration_seconds: parsed.data.attachment?.durationSeconds ?? null,
  });

  // The rate-limit trigger's exception message is safe to surface as-is --
  // it's written for end users, not an internal error leak.
  if (error) return { error: error.message.includes("too quickly") ? error.message : "Could not send message" };
  return { error: null };
}

// Sender-only, hard delete (0082) -- no staff/moderation override, no
// soft-delete placeholder. RLS (community_messages_delete_own) is the real
// gate; the explicit .eq("user_id", ...) here just turns "not yours" into
// a clear error instead of a silent zero-row no-op.
export async function deleteMessage(messageId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("community_messages")
    .delete({ count: "exact" })
    .eq("id", messageId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  if (!count) return { error: "You can only delete your own messages" };
  return { error: null };
}

// Called on opening a group's chat, and again on each new message received
// while it's open -- upsert rather than a plain update since a member's
// first-ever read of a group has no existing row yet
// (community_group_reads_upsert_own RLS, 0046, is the real membership
// gate; this can't mark a group the caller doesn't belong to as read).
export async function markGroupRead(groupId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("community_group_reads")
    .upsert({ group_id: groupId, user_id: user.id, last_read_at: new Date().toISOString() });
  if (error) console.error("Failed to mark group read:", error.message);
}
