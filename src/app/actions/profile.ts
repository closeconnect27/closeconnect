"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/validation/profile";

export async function updateProfile(input: UpdateProfileInput) {
  const user = await requireUser();

  // Never trust client-side validation alone (SPEC.md Section 11).
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const supabase = await createClient();

  // RLS (profile_details_update_own, 0033) backs this up independently, but
  // .eq("id", user.id) means this can only ever target the caller's own
  // row regardless -- no separate ownership check needed the way
  // updateCommunity/updateEvent need one (those take a foreign id as an
  // argument; this doesn't).
  const { error } = await supabase
    .from("profile_details")
    .update({
      bio: data.bio || null,
      occupation: data.occupation || null,
      company: data.company || null,
      college: data.college || null,
      linkedin_url: data.linkedin_url || null,
      github_url: data.github_url || null,
      instagram_url: data.instagram_url || null,
      skills: data.skills,
      profile_visibility: data.profile_visibility,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  revalidatePath("/profile/edit");
  revalidatePath(`/profile/${user.id}`);
  return { error: null };
}
