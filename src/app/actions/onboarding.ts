"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema } from "@/lib/validation/onboarding";
import { isCategorySlug } from "@/lib/categories";

// Same-origin-only guard as the /onboarding page's own safeRedirect --
// redirectTo round-trips through a client form, so it's just as
// attacker-shapeable as a query param would be.
function safeRedirect(value: string): string {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

export async function completeOnboarding(input: { username: string; dateOfBirth: string; interests: string[]; redirectTo: string }) {
  const user = await requireUser();

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { username, dateOfBirth, interests } = parsed.data;

  // Silently drop anything that isn't a real category slug rather than
  // erroring -- a stale/tampered client payload shouldn't block onboarding
  // over a field that's supplementary (personalization), not identity.
  const validInterests = interests.filter(isCategorySlug);

  const supabase = await createClient();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      username,
      date_of_birth: dateOfBirth.toISOString().slice(0, 10),
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (profileError) {
    // 23505 = unique_violation -- profiles_username_format's sibling
    // constraint (0092) is a check, not unique; this is the `username`
    // unique index specifically, the one case worth a friendly message
    // instead of the raw Postgres error.
    if (profileError.code === "23505") {
      return { error: "That username is already taken." };
    }
    return { error: profileError.message };
  }

  const { error: detailsError } = await supabase.from("profile_details").update({ interests: validInterests }).eq("id", user.id);
  if (detailsError) return { error: detailsError.message };

  redirect(safeRedirect(input.redirectTo));
}
