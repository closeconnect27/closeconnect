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

  // Split across two tables (0035): bio/profile_visibility live on
  // `profiles` (always public -- see getPublicProfileBasic), the rest on
  // profile_details (gated by visibility). RLS backs both up independently
  // (profiles_update_own, profile_details_update_own), but .eq("id",
  // user.id) means this can only ever target the caller's own rows
  // regardless -- no separate ownership check needed the way
  // updateCommunity/updateEvent need one (those take a foreign id as an
  // argument; this doesn't).
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      bio: data.bio || null,
      bio_content: data.bio_content ?? null,
      profile_visibility: data.profile_visibility,
    })
    .eq("id", user.id);
  if (profileError) return { error: profileError.message };

  const { error: detailsError } = await supabase
    .from("profile_details")
    .update({
      occupation: data.occupation || null,
      company: data.company || null,
      college: data.college || null,
      linkedin_url: data.linkedin_url || null,
      github_url: data.github_url || null,
      instagram_url: data.instagram_url || null,
      skills: data.skills,
      interests: data.interests,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (detailsError) return { error: detailsError.message };

  revalidatePath("/profile");
  revalidatePath("/profile/edit");
  revalidatePath(`/profile/${user.id}`);
  return { error: null };
}

export async function requestToFollowProfile(targetId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("profile_follow_requests").insert({
    requester_id: user.id,
    target_id: targetId,
  });

  if (error) {
    // 23505 = unique_violation -- profile_follow_requests_one_pending
    // (0035): a request is already pending, submitted in the moment
    // between this page loading and this click.
    if (error.code === "23505") return { error: "You've already requested to follow this profile." };
    // 23514 = check_violation -- the requester_id != target_id check
    // (0035), reachable if the UI's own guard against requesting your own
    // profile were ever bypassed.
    if (error.code === "23514") return { error: "You can't follow your own profile." };
    return { error: error.message };
  }

  revalidatePath(`/profile/${targetId}`);
  return { error: null };
}

// Instant follow (0061) -- public/members_only profiles only. RLS
// (profile_follows_insert_own) rejects this for a private target, so
// there's no need to re-check visibility here; a rejected insert just
// surfaces as a generic error, same as any other RLS-enforced boundary in
// this app.
export async function followProfile(targetId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("profile_follows").insert({
    follower_id: user.id,
    followee_id: targetId,
  });

  if (error) {
    if (error.code === "23505") return { error: null }; // already following -- idempotent
    if (error.code === "23514") return { error: "You can't follow your own profile." };
    return { error: error.message };
  }

  revalidatePath(`/profile/${targetId}`);
  return { error: null };
}

export async function unfollowProfile(targetId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("profile_follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("followee_id", targetId);
  if (error) return { error: error.message };

  revalidatePath(`/profile/${targetId}`);
  return { error: null };
}

export async function reviewFollowRequest(requestId: string, decision: "accepted" | "rejected") {
  const user = await requireUser();
  const supabase = await createClient();

  // RLS (pfr_update_target, 0035) is the real gate -- a non-target caller's
  // update simply matches zero rows rather than erroring.
  const { data, error } = await supabase
    .from("profile_follow_requests")
    .update({ status: decision, reviewed_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("target_id", user.id)
    .select("requester_id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/profile");
  revalidatePath(`/profile/${user.id}`);
  if (data) revalidatePath(`/profile/${data.requester_id}`);
  return { error: null };
}
