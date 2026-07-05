"use server";

import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { sendMessageSchema } from "@/lib/validation/chat";

export async function sendMessage(groupId: string, content: string) {
  const user = await requireUser();

  const parsed = sendMessageSchema.safeParse({ content });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid message" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("community_messages")
    .insert({ group_id: groupId, user_id: user.id, content: parsed.data.content });

  // The rate-limit trigger's exception message is safe to surface as-is --
  // it's written for end users, not an internal error leak.
  if (error) return { error: error.message.includes("too quickly") ? error.message : "Could not send message" };
  return { error: null };
}
