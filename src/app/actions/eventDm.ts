"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mirrors src/app/actions/dm.ts ("reach out to admin") exactly, for
// "contact host" (0074) instead.
const MAX_LEN = 1000;

async function insertEventDmMessage(supabase: SupabaseClient, threadId: string, senderId: string, text: string) {
  const { error } = await supabase.from("event_dm_messages").insert({ thread_id: threadId, sender_id: senderId, content: text });
  if (error) return error.message.includes("too quickly") ? error.message : "Could not send message";
  return null;
}

/** The attendee's side of "contact host" -- finds their existing thread
 * with this event's host or creates it on the first message. RLS
 * (event_dm_messages_insert, 0074) is the real gate; this also blocks the
 * host from messaging themselves, same as sendCommunityDm blocking an
 * owner/moderator. */
export async function sendEventDm(eventId: string, content: string) {
  const user = await requireUser();
  const text = content.trim();
  if (!text) return { error: "Message can't be empty" };
  if (text.length > MAX_LEN) return { error: "Message is too long" };

  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase.from("events").select("host_id").eq("id", eventId).single();
  if (eventError || !event) return { error: "Event not found" };
  if (event.host_id === user.id) return { error: "You're the host of this event" };

  const { data: existing } = await supabase
    .from("event_dm_threads")
    .select("id")
    .eq("event_id", eventId)
    .eq("member_id", user.id)
    .maybeSingle();

  let threadId = existing?.id as string | undefined;
  if (!threadId) {
    const { data: created, error: createError } = await supabase
      .from("event_dm_threads")
      .insert({ event_id: eventId, member_id: user.id })
      .select("id")
      .single();
    if (createError?.code === "23505") {
      // A concurrent send already created this attendee's thread between
      // the select above and this insert -- re-select rather than erroring.
      const { data: retry } = await supabase
        .from("event_dm_threads")
        .select("id")
        .eq("event_id", eventId)
        .eq("member_id", user.id)
        .single();
      threadId = retry?.id as string | undefined;
    } else if (createError || !created) {
      return { error: createError?.message ?? "Could not open this conversation" };
    } else {
      threadId = created.id as string;
    }
  }
  if (!threadId) return { error: "Could not open this conversation" };

  const sendError = await insertEventDmMessage(supabase, threadId, user.id, text);
  if (sendError) return { error: sendError };

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/manage`);
  return { error: null, threadId };
}

/** The host's side -- replying into an existing thread, never originating
 * one. RLS's is_event_host check on the insert is the real gate. */
export async function replyToEventDm(eventId: string, threadId: string, content: string) {
  const user = await requireUser();
  const text = content.trim();
  if (!text) return { error: "Message can't be empty" };
  if (text.length > MAX_LEN) return { error: "Message is too long" };

  const supabase = await createClient();
  const sendError = await insertEventDmMessage(supabase, threadId, user.id, text);
  if (sendError) return { error: sendError };

  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath(`/events/${eventId}`);
  return { error: null };
}

// Sender-only, hard delete (0082) -- mirrors deleteCommunityDmMessage
// (dm.ts) exactly. RLS (event_dm_messages_delete_own) is the real gate.
export async function deleteEventDmMessage(messageId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("event_dm_messages")
    .delete({ count: "exact" })
    .eq("id", messageId)
    .eq("sender_id", user.id);

  if (error) return { error: error.message };
  if (!count) return { error: "You can only delete your own messages" };
  return { error: null };
}
