"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export async function blockUser(targetId: string) {
  const user = await requireUser();
  if (user.id === targetId) return { error: "You can't block yourself" };

  const supabase = await createClient();
  const { error } = await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: targetId });
  if (error) return { error: error.message };

  // A block is retroactive for the *relationship* even though the DB
  // check (is_blocked_pair) only gates NEW follows/DMs -- an existing
  // follow either side already had should stop counting as "following"
  // too, not just new ones going forward.
  await supabase.from("profile_follows").delete().or(`and(follower_id.eq.${user.id},followee_id.eq.${targetId}),and(follower_id.eq.${targetId},followee_id.eq.${user.id})`);

  revalidatePath(`/profile/${targetId}`);
  return { error: null };
}

export async function unblockUser(targetId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("blocked_users").delete().eq("blocker_id", user.id).eq("blocked_id", targetId);
  if (error) return { error: error.message };

  revalidatePath(`/profile/${targetId}`);
  return { error: null };
}
