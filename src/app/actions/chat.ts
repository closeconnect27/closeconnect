"use server";

import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export async function sendMessage(groupId: string, content: string) {
  const user = await requireUser();
  const trimmed = content.trim();
  if (!trimmed) return { error: "Message can't be empty" };
  if (trimmed.length > 1000) return { error: "Message is too long" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("community_messages")
    .insert({ group_id: groupId, user_id: user.id, content: trimmed });

  // The rate-limit trigger's exception message is safe to surface as-is --
  // it's written for end users, not an internal error leak.
  if (error) return { error: error.message.includes("too quickly") ? error.message : "Could not send message" };
  return { error: null };
}
