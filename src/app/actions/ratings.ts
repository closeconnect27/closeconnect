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
  // Upsert on the (community_id, user_id) primary key -- "once per
  // community" (SPEC.md Section 5) is enforced by the PK itself; rating
  // again just updates your existing rating rather than erroring.
  const { error } = await supabase.from("community_ratings").upsert({
    community_id: communityId,
    user_id: user.id,
    rating: parsed.data.rating,
    review: parsed.data.review ?? null,
  });

  if (error) return { error: error.message };
  revalidatePath(`/communities/${communityId}`);
  return { error: null };
}
