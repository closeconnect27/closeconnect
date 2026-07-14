"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { trackServerEvent } from "@/lib/mixpanel/server";
import { requestVerificationSchema, type RequestVerificationInput } from "@/lib/validation/verification";

export async function requestCommunityVerification(communityId: string, input: RequestVerificationInput) {
  const user = await requireUser();

  const parsed = requestVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("verification_requests").insert({
    target_type: "community",
    target_id: communityId,
    requested_by: user.id,
    note: parsed.data.note || null,
  });

  if (error) {
    // 23505 = unique_violation -- verification_requests_one_pending
    // (0037): already requested, in the moment between page load and
    // this submit.
    if (error.code === "23505") return { error: "A verification request for this community is already pending." };
    return { error: error.message };
  }

  revalidatePath(`/communities/${communityId}`);
  revalidatePath(`/communities/${communityId}/edit`);

  const { data: community } = await supabase.from("communities").select("name").eq("id", communityId).maybeSingle();
  // Awaited, not fire-and-forget -- Cloudflare Workers can terminate an
  // un-awaited promise the instant this action's response is sent,
  // killing the fetch to Resend before it completes. A failure here still
  // doesn't fail the request itself (only logs).
  try {
    await notifyAdminOfVerificationRequest(community?.name ?? "a community");
  } catch (e) {
    console.error("Failed to send verification request notification email:", e);
  }
  trackServerEvent("verification_requested", user.id, { target_type: "community", target_id: communityId });
  return { error: null };
}

// Organizer verification is automatic now (see 0060 migration: owning a
// community or hosting an event sets profiles.is_verified directly) -- no
// request/review flow for it anymore.
async function notifyAdminOfVerificationRequest(label: string) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const dashboardLink = `${siteUrl}/host/dashboard#pending-verifications`;

  await sendEmail({
    to: adminEmail,
    subject: `New community verification request: ${label}`,
    html: `
      <p>A new community verification request for <strong>${label}</strong> is waiting for review.</p>
      <p><a href="${dashboardLink}">Review in dashboard</a></p>
    `,
  });
}

export async function reviewVerificationRequest(
  requestId: string,
  decision: "approved" | "rejected",
  reviewNote?: string,
) {
  const user = await requireUser();
  const supabase = await createClient();

  // Explicit server-side admin check (SPEC.md Section 11) -- not just a
  // hidden button. RLS (verification_requests_update_admin) backs this up
  // independently, but a clear "not allowed" error here is a better
  // failure mode than a silent zero-row RLS no-op.
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { error: "Only an admin can review verification requests" };

  const { data: request, error } = await supabase
    .from("verification_requests")
    .update({ status: decision, review_note: reviewNote || null })
    .eq("id", requestId)
    .select("target_type, target_id")
    .single();

  if (error || !request) return { error: error?.message ?? "Could not update this request" };

  revalidatePath("/host/dashboard");
  if (request.target_type === "community") {
    revalidatePath(`/communities/${request.target_id}`);
  } else {
    revalidatePath(`/profile/${request.target_id}`);
  }
  return { error: null };
}

// Deliberately separate from the request/review queue above -- phone/email
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
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { error: "Only an admin can do this" };

  const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", profileId);
  if (error) return { error: error.message };

  revalidatePath("/host/dashboard");
  revalidatePath(`/profile/${profileId}`);
  return { error: null };
}
