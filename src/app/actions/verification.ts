"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

// Deliberately separate from community verification (there's no request/
// review flow for that anymore, and organizer verification via
// profiles.is_verified is automatic -- see 0060) -- phone/email
// verification stays fully manual (an admin confirms directly with the
// organizer, e.g. a call, then flips this), not something an organizer can
// request or trigger themselves. No admin UI currently calls this (its one
// trigger point lived in the now-removed organizer branch of
// PendingVerificationRequestsSection) -- kept as-is since removing
// verified_phone/verified_email themselves wasn't asked for.
export async function toggleContactVerification(
  profileId: string,
  field: "verified_phone" | "verified_email",
  value: boolean,
) {
  await requireUser();
  const supabase = await createClient();

  // Routed through a security-definer RPC (admin_toggle_contact_verification,
  // 0075), not a direct update through the caller's own RLS-scoped client --
  // profiles' RLS (profiles_update_own) only allows `id = auth.uid()` with
  // no admin override, so a plain update here would silently match zero
  // rows for anyone but the admin's own profile and report false success.
  const { error } = await supabase.rpc("admin_toggle_contact_verification", {
    p_profile_id: profileId,
    p_field: field,
    p_value: value,
  });
  if (error) return { error: error.message };

  revalidatePath("/host/dashboard");
  revalidatePath(`/profile/${profileId}`);
  return { error: null };
}
