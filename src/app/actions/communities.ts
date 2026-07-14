"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { trackServerEvent } from "@/lib/mixpanel/server";
import { assignPhotoForEntity, triggerDownloadPing } from "@/lib/unsplash";
import {
  createCommunitySchema,
  updateCommunitySchema,
  submitExternalCommunitySchema,
  claimCommunitySchema,
  type CreateCommunityInput,
  type UpdateCommunityInput,
  type SubmitExternalCommunityInput,
  type ClaimCommunityInput,
} from "@/lib/validation/community";
import { deserializeDescriptionContent } from "@/lib/validation/richText";

export async function createCommunity(
  input: Omit<CreateCommunityInput, "description_content"> & { description_content: string | null },
) {
  const user = await requireUser();

  // Never trust client-side validation alone (SPEC.md Section 11) -- this
  // Server Action is callable directly, not just from the form that happens
  // to validate first. description_content arrives as a JSON string, not
  // the parsed object -- see serializeDescriptionContent's comment
  // (Server Actions silently corrupt a large nested object graph crossing
  // this exact boundary).
  const parsed = createCommunitySchema.safeParse({
    ...input,
    description_content: deserializeDescriptionContent(input.description_content),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const supabase = await createClient();

  // data.id is generated client-side by NewCommunityForm (not left to the
  // column default) for two reasons: the assigned photo needs a stable id
  // to hash against before the insert, and the rich editor needs a real id
  // to upload inline description images against *before* this row exists
  // (0053's storage policy allows that specifically for a not-yet-claimed
  // id). A colliding id would simply fail the insert below (23505) --
  // practically impossible for a real v4 UUID, not worth a pre-check.
  const id = data.id;
  const photo = assignPhotoForEntity(data.category, id);

  const { data: community, error } = await supabase
    .from("communities")
    .insert({
      id,
      name: data.name,
      description: data.description,
      description_content: data.description_content ?? null,
      category: data.category,
      extra_categories: data.extra_categories,
      city: data.city || null,
      extra_cities: data.extra_cities,
      community_type: data.community_type,
      kind: "native",
      join_mode: data.join_mode,
      member_limit: data.member_limit ?? null,
      owner_id: user.id,
      unsplash_image_url: photo.imageUrl,
      unsplash_photo_id: photo.photoId,
    })
    .select()
    .single();

  if (!error) triggerDownloadPing(photo.photoId);

  if (error || !community) {
    // 23505 = unique_violation -- communities_unique_name_per_category_native
    // (0043): another native community already has this name in this
    // category.
    if (error?.code === "23505") {
      return { error: "A community with this name already exists in this category." };
    }
    return { error: error?.message ?? "Could not create community" };
  }

  if (data.join_mode === "request" && data.join_form_fields.length > 0) {
    const { error: fieldsError } = await supabase.from("form_fields").insert(
      data.join_form_fields.map((f, i) => ({
        owner_type: "community" as const,
        owner_id: community.id,
        label: f.label,
        field_type: f.field_type,
        options: f.field_type === "select" ? f.options : null,
        is_required: f.is_required,
        sort_order: i,
      })),
    );
    if (fieldsError) {
      return { error: `Community created, but the join form failed to save: ${fieldsError.message}` };
    }
  }

  trackServerEvent("community_created", user.id, { community_id: community.id, category: data.category, kind: "native" });

  // No redirect() here -- the caller (NewCommunityForm) still needs the new
  // id to navigate to /communities/[id] itself. Every other caller-facing
  // shape in this file returns { error } on failure; a successful create
  // additionally carries the new id.
  return { error: null, communityId: community.id };
}

export async function updateCommunity(
  communityId: string,
  input: Omit<UpdateCommunityInput, "description_content"> & { description_content: string | null },
) {
  const user = await requireUser();

  // description_content arrives as a JSON string, not the parsed object --
  // see serializeDescriptionContent's comment (Server Actions silently
  // corrupt a large nested object graph crossing this exact boundary).
  // Reconstructed here before the normal object-shaped schema validates it.
  const parsed = updateCommunitySchema.safeParse({
    ...input,
    description_content: deserializeDescriptionContent(input.description_content),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const supabase = await createClient();

  // Explicit ownership check, not just RLS as the only gate (SPEC.md Section
  // 11) -- a fresh read of owner_id, never trusting a value the caller could
  // have passed in. RLS (0017) backs this up independently, including
  // locking columns this action doesn't even attempt to write
  // (owner_id/claim_status/join_mode), but a clear "you don't own this"
  // error here is a better failure mode than a silent zero-row RLS no-op.
  const { data: existing, error: fetchError } = await supabase
    .from("communities")
    .select("owner_id")
    .eq("id", communityId)
    .single();

  if (fetchError || !existing) {
    return { error: "Community not found" };
  }
  if (existing.owner_id !== user.id) {
    return { error: "Only the owner can edit this community" };
  }

  // Column list is explicit, not a spread of `data` -- even though the
  // schema already excludes owner_id/claim_status/join_mode, writing the
  // update this way means adding a field to the schema later can't
  // accidentally make it writable here without a matching change to this list.
  const { error } = await supabase
    .from("communities")
    .update({
      name: data.name,
      description: data.description,
      description_content: data.description_content ?? null,
      category: data.category,
      extra_categories: data.extra_categories,
      city: data.city || null,
      extra_cities: data.extra_cities,
      member_limit: data.member_limit ?? null,
    })
    .eq("id", communityId);

  if (error) {
    if (error.code === "23505") {
      return { error: "A community with this name already exists in this category." };
    }
    return { error: error.message };
  }

  revalidatePath(`/communities/${communityId}`);
  redirect(`/communities/${communityId}`);
}

/** Owner-only toggle for whether ordinary members can see the full member
 * list (0052) -- owner/moderators always show regardless, enforced where
 * MemberList renders, not here. Explicit ownership check (SPEC.md Section
 * 11), same pattern as updateCommunity -- RLS (communities_update_owner,
 * 0017) backs this up independently. */
export async function toggleMembersListVisibility(communityId: string, visible: boolean) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("communities")
    .select("owner_id")
    .eq("id", communityId)
    .single();
  if (fetchError || !existing) return { error: "Community not found" };
  if (existing.owner_id !== user.id) return { error: "Only the owner can change this" };

  const { error } = await supabase
    .from("communities")
    .update({ members_list_visible: visible })
    .eq("id", communityId);
  if (error) return { error: error.message };

  revalidatePath(`/communities/${communityId}`);
  return { error: null };
}

/** Owner-only toggle for whether the member COUNT (not the roster --
 * that's toggleMembersListVisibility above) shows on the card and detail
 * page header. Same pattern as its sibling. */
export async function toggleMemberCountVisibility(communityId: string, visible: boolean) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("communities")
    .select("owner_id")
    .eq("id", communityId)
    .single();
  if (fetchError || !existing) return { error: "Community not found" };
  if (existing.owner_id !== user.id) return { error: "Only the owner can change this" };

  const { error } = await supabase
    .from("communities")
    .update({ member_count_visible: visible })
    .eq("id", communityId);
  if (error) return { error: error.message };

  revalidatePath(`/communities/${communityId}`);
  return { error: null };
}

// No requireUser() -- deliberately public, no login required, matching the
// original site's Add Community modal (confirmed missing from this app by
// audit before building this). RLS (communities_insert_external_public,
// 0024) is the real gate on what shape this can create; the explicit
// column list below is a second line of defense against the schema ever
// growing a field this action forgets to exclude.
export async function submitExternalCommunity(input: SubmitExternalCommunityInput) {
  const parsed = submitExternalCommunitySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const supabase = await createClient();

  const id = crypto.randomUUID();
  const photo = assignPhotoForEntity(data.category, id);

  const { data: community, error } = await supabase
    .from("communities")
    .insert({
      id,
      name: data.name,
      description: data.description,
      description_content: data.description_content ?? null,
      category: data.category,
      extra_categories: data.extra_categories,
      city: data.city || null,
      extra_cities: data.extra_cities,
      community_type: data.community_type,
      external_link: data.external_link,
      kind: "external",
      owner_id: null,
      claim_status: "unclaimed",
      unsplash_image_url: photo.imageUrl,
      unsplash_photo_id: photo.photoId,
    })
    .select()
    .single();

  if (error || !community) {
    if (error?.message.includes("too quickly")) return { error: error.message };
    return { error: error?.message ?? "Could not submit this listing" };
  }

  triggerDownloadPing(photo.photoId);
  redirect(`/communities/${community.id}`);
}

export async function submitCommunityClaim(communityId: string, input: ClaimCommunityInput) {
  const user = await requireUser();

  const parsed = claimCommunitySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const supabase = await createClient();

  // Re-check the community is actually claimable server-side -- never trust
  // that the UI only showed this form when it should have.
  const { data: community, error: fetchError } = await supabase
    .from("communities")
    .select("name, kind, claim_status")
    .eq("id", communityId)
    .single();
  if (fetchError || !community) return { error: "Community not found" };
  if (community.kind !== "external") return { error: "Only external communities can be claimed" };
  if (community.claim_status !== "unclaimed" && community.claim_status !== "rejected") {
    return { error: "This community already has a claim in progress or an owner" };
  }

  // Email comes from the signed-in session, never a client-supplied value
  // -- same fix as event registration's email field. A free-text email
  // input here was never checked against anything, so anyone could type a
  // random address and still have the claim granted to their real
  // claimant_user_id regardless -- the field looked like verification but
  // wasn't. If a user's account somehow has no email (e.g. phone-only
  // auth), this fails closed with a clear message rather than sending
  // admins an empty contact field.
  if (!user.email) {
    return { error: "Your account needs an email on file to submit a claim." };
  }

  const { data: claim, error } = await supabase
    .from("claims")
    .insert({
      community_id: communityId,
      claimant_user_id: user.id,
      name: data.name,
      phone: data.phone,
      email: user.email,
      proof: data.proof || null,
      proof_image_paths: data.proofImagePaths && data.proofImagePaths.length > 0 ? data.proofImagePaths : null,
    })
    .select("id")
    .single();

  if (error || !claim) {
    if (error?.message.includes("too quickly")) return { error: error.message };
    // 23505 = unique_violation -- claims_one_pending_per_community (0024):
    // someone else's claim was submitted in the moment between this page
    // loading and this submit.
    if (error?.code === "23505") return { error: "A claim for this community is already pending review." };
    return { error: error?.message ?? "Could not submit this claim" };
  }

  revalidatePath(`/communities/${communityId}`);
  // Awaited, not fire-and-forget -- Cloudflare Workers can (and does, per a
  // real report) terminate an un-awaited promise the instant this action's
  // response is sent, killing the fetch to Resend before it completes. A
  // failure here still doesn't fail the claim itself (the try/catch only
  // logs), it just no longer races the Worker's own teardown.
  try {
    await notifyAdminOfPendingClaim(claim.id, community.name);
  } catch (e) {
    console.error("Failed to send claim notification email:", e);
  }
  trackServerEvent("claim_submitted", user.id, { community_id: communityId, claim_id: claim.id });
  return { error: null };
}

// Direct one-click Approve/Reject links in the email, per explicit product
// decision -- clicking a link mutates the claims table on a GET request.
// This is a knowing tradeoff, not an oversight: email clients and security
// scanners that pre-fetch links could trigger a decision with no human
// behind it. See app/api/claims/[id]/decide/route.ts for the one guard in
// place (first decision wins; a second click/prefetch is a no-op). The
// authenticated in-app buttons in PendingClaimsSection still work exactly
// as before -- this is an additional path, not a replacement. Awaited by
// the caller now, not fire-and-forget (see the try/catch around the call
// site) -- a failed send here still doesn't fail the claim itself, that's
// what the caller's catch is for, but the fetch needs to actually
// complete before the Worker can tear this request down.
async function notifyAdminOfPendingClaim(claimId: string, communityName: string) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const approveLink = `${siteUrl}/api/claims/${claimId}/decide?decision=approved`;
  const rejectLink = `${siteUrl}/api/claims/${claimId}/decide?decision=rejected`;
  const dashboardLink = `${siteUrl}/host/dashboard#pending-claims`;

  await sendEmail({
    to: adminEmail,
    subject: `New claim pending review: ${communityName}`,
    html: `
      <p>A new claim for <strong>${communityName}</strong> is waiting for review.</p>
      <p>
        <a href="${approveLink}" style="display:inline-block;padding:10px 22px;background:#1a7a5e;color:#fff;border-radius:999px;text-decoration:none;font-weight:600;margin-right:10px">Approve</a>
        <a href="${rejectLink}" style="display:inline-block;padding:10px 22px;background:#f3f4f6;color:#111;border-radius:999px;text-decoration:none;font-weight:600">Reject</a>
      </p>
      <p style="font-size:13px;color:#888">Or review it in the <a href="${dashboardLink}">dashboard</a>.</p>
    `,
  });
}

export async function reviewCommunityClaim(claimId: string, decision: "approved" | "rejected") {
  const user = await requireUser();
  const supabase = await createClient();

  // Explicit server-side admin check (SPEC.md Section 11) -- not just a
  // hidden button. RLS (claims_update_admin) backs this up independently,
  // but a clear "not allowed" error here is a better failure mode than a
  // silent zero-row RLS no-op.
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { error: "Only an admin can review claims" };

  const { data: claim, error } = await supabase
    .from("claims")
    .update({ status: decision })
    .eq("id", claimId)
    .select("community_id")
    .single();

  if (error || !claim) return { error: error?.message ?? "Could not update this claim" };

  revalidatePath("/host/dashboard");
  revalidatePath(`/communities/${claim.community_id}`);
  return { error: null };
}
