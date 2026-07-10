"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", userId).single();
  return !!profile?.is_admin;
}

/** Admin-curated founding-cohort flag on a community (0054) -- deliberately
 * not self-service; an owner can't grant this to their own community. */
export async function setCommunityFounding(communityId: string, founding: boolean) {
  const user = await requireUser();
  const supabase = await createClient();
  if (!(await requireAdmin(supabase, user.id))) return { error: "Only an admin can do this" };

  const { error } = await supabase.from("communities").update({ is_founding: founding }).eq("id", communityId);
  if (error) return { error: error.message };

  revalidatePath(`/communities/${communityId}`);
  revalidatePath("/admin");
  return { error: null };
}

/** Same as setCommunityFounding, for a host's profile -- routed through a
 * security-definer RPC (0056), not a direct table update: profiles_update_own
 * (0010) is `using (id = auth.uid())` with no admin override at all, so an
 * admin can't update someone else's profile row through the normal
 * RLS-scoped client. The explicit is_admin check here is redundant with
 * the function's own (defense in depth, same convention as every other
 * action in this file), not the only gate. */
export async function setHostFounding(profileId: string, founding: boolean) {
  const user = await requireUser();
  const supabase = await createClient();
  if (!(await requireAdmin(supabase, user.id))) return { error: "Only an admin can do this" };

  const { error } = await supabase.rpc("admin_set_founding_host", { p_profile_id: profileId, p_founding: founding });
  if (error) return { error: error.message };

  revalidatePath(`/profile/${profileId}`);
  revalidatePath("/admin");
  return { error: null };
}
