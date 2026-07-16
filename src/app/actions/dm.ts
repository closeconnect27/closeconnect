"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_LEN = 1000;

async function insertDmMessage(supabase: SupabaseClient, threadId: string, senderId: string, text: string) {
  const { error } = await supabase
    .from("community_dm_messages")
    .insert({ thread_id: threadId, sender_id: senderId, content: text });
  // The rate-limit trigger's exception message is safe to surface as-is --
  // it's written for end users, same convention as sendMessage (chat.ts).
  if (error) return error.message.includes("too quickly") ? error.message : "Could not send message";
  return null;
}

/** The member's side of "Reach out to admin" -- finds their existing
 * thread with this community's owner or creates it on the first message.
 * RLS (community_dm_messages_insert, 0067) is the real gate on who can
 * post into it; this also blocks staff (owner AND moderators -- neither
 * should be able to DM "the admin", since they already are one) and
 * blocks external communities outright (no owner-facing inbox exists for
 * one). The UI (ReachOutButton) already hides this from staff, but a
 * direct action call needs the same check server-side. */
export async function sendCommunityDm(communityId: string, content: string) {
  const user = await requireUser();
  const text = content.trim();
  if (!text) return { error: "Message can't be empty" };
  if (text.length > MAX_LEN) return { error: "Message is too long" };

  const supabase = await createClient();

  const { data: community, error: communityError } = await supabase
    .from("communities")
    .select("owner_id, kind")
    .eq("id", communityId)
    .single();
  if (communityError || !community) return { error: "Community not found" };
  if (community.kind !== "native") return { error: "Direct messages aren't available for this community" };
  if (community.owner_id === user.id) return { error: "You're the owner of this community" };

  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership?.role === "moderator") return { error: "You're a moderator of this community" };

  const { data: existing } = await supabase
    .from("community_dm_threads")
    .select("id")
    .eq("community_id", communityId)
    .eq("member_id", user.id)
    .maybeSingle();

  let threadId = existing?.id as string | undefined;
  if (!threadId) {
    const { data: created, error: createError } = await supabase
      .from("community_dm_threads")
      .insert({ community_id: communityId, member_id: user.id })
      .select("id")
      .single();
    if (createError?.code === "23505") {
      // A concurrent send already created this member's thread between the
      // select above and this insert -- re-select rather than erroring out.
      const { data: retry } = await supabase
        .from("community_dm_threads")
        .select("id")
        .eq("community_id", communityId)
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

  const sendError = await insertDmMessage(supabase, threadId, user.id, text);
  if (sendError) return { error: sendError };

  revalidatePath(`/communities/${communityId}`);
  return { error: null, threadId };
}

/** The staff side -- replying into an existing thread, never originating
 * one (a member always speaks first). RLS's is_community_staff check on
 * the insert is what actually stops a non-staff caller from replying into
 * someone else's thread; there's no explicit ownership check here to
 * duplicate it, same as sendMessage (chat.ts) leaning on RLS alone. */
export async function replyToCommunityDm(communityId: string, threadId: string, content: string) {
  const user = await requireUser();
  const text = content.trim();
  if (!text) return { error: "Message can't be empty" };
  if (text.length > MAX_LEN) return { error: "Message is too long" };

  const supabase = await createClient();
  const sendError = await insertDmMessage(supabase, threadId, user.id, text);
  if (sendError) return { error: sendError };

  revalidatePath(`/communities/${communityId}`);
  return { error: null };
}
