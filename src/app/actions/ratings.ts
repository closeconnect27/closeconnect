"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { submitRatingSchema } from "@/lib/validation/rating";

export async function submitRating(communityId: string, rating: number, review: string) {
  const user = await requireUser();

  const parsed = submitRatingSchema.safeParse({ rating, review: review || undefined });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid rating" };
  }

  const supabase = await createClient();

  // Explicit pre-check, not just RLS (0029) as the only gate -- the UI
  // already hides this option for the owner and for non-members, but a
  // clear "why" here is a better failure mode than a generic RLS 42501 for
  // the only way to reach this (a direct call bypassing the UI). Fetched
  // together rather than as two round-trips.
  const [{ data: community }, { data: membership }] = await Promise.all([
    supabase.from("communities").select("owner_id").eq("id", communityId).single(),
    supabase.from("community_members").select("user_id").eq("community_id", communityId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (community?.owner_id === user.id) {
    return { error: "You can't rate a community you own." };
  }
  if (!membership) {
    return { error: "Only members can rate this community." };
  }

  // Upsert on the (community_id, user_id) primary key -- "once per
  // community" (SPEC.md Section 5) is enforced by the PK itself; rating
  // again just updates your existing rating rather than erroring.
  const { error } = await supabase.from("community_ratings").upsert({
    community_id: communityId,
    user_id: user.id,
    rating: parsed.data.rating,
    review: parsed.data.review ?? null,
  });

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { error: "You're not allowed to rate this community." };
    }
    return { error: error.message };
  }
  revalidatePath(`/communities/${communityId}`);
  return { error: null };
}
