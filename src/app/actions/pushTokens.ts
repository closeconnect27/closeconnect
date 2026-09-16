"use server";

import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

/** Registers (or reassigns) a device's FCM token to the signed-in user --
 * called once from the native app after Push Notifications permission is
 * granted and FCM hands back a token. Upserts on the token's own unique
 * constraint (push_tokens_insert_self/_update_self, 0090) rather than a
 * per-user check, so a device that changes hands or gets a fresh login
 * cleanly reassigns instead of erroring on a duplicate token. */
export async function registerPushToken(token: string, platform: "android" | "ios") {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("push_tokens")
    .upsert({ user_id: user.id, token, platform }, { onConflict: "token" });
  if (error) return { error: error.message };
  return { error: null };
}
