"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
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

export async function createCommunity(input: CreateCommunityInput) {
  const user = await requireUser();

  // Never trust client-side validation alone (SPEC.md Section 11) -- this
  // Server Action is callable directly, not just from the form that happens
  // to validate first.
  const parsed = createCommunitySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const supabase = await createClient();

  const { data: community, error } = await supabase
    .from("communities")
    .insert({
      name: data.name,
      description: data.description,
      category: data.category,
      extra_categories: data.extra_categories,
      city: data.city || null,
      extra_cities: data.extra_cities,
      community_type: data.community_type,
      kind: "native",
      join_mode: data.join_mode,
      owner_id: user.id,
    })
    .select()
    .single();

  if (error || !community) {
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

  redirect(`/communities/${community.id}`);
}

export async function updateCommunity(communityId: string, input: UpdateCommunityInput) {
  const user = await requireUser();

  const parsed = updateCommunitySchema.safeParse(input);
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
      category: data.category,
      extra_categories: data.extra_categories,
      city: data.city || null,
      extra_cities: data.extra_cities,
    })
    .eq("id", communityId);

  if (error) return { error: error.message };

  revalidatePath(`/communities/${communityId}`);
  redirect(`/communities/${communityId}`);
}

const COMMUNITY_IMAGE_KINDS = ["logo", "cover"] as const;
type CommunityImageKind = (typeof COMMUNITY_IMAGE_KINDS)[number];
const COMMUNITY_IMAGE_COLUMN: Record<CommunityImageKind, "logo_url" | "cover_image_url"> = {
  logo: "logo_url",
  cover: "cover_image_url",
};

export async function setCommunityImage(communityId: string, kind: CommunityImageKind, imageUrl: string) {
  const user = await requireUser();

  // community-images is publicly rendered -- without this, an owner (the
  // only caller RLS/this check lets reach the update) could point a
  // logo/cover at an arbitrary external URL instead of a real upload,
  // bypassing the storage bucket's own type/size limits entirely (same
  // defense as addEventImage).
  const expectedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/community-images/${communityId}/`;
  if (!imageUrl.startsWith(expectedPrefix)) {
    return { error: "Image must come from this community's own upload" };
  }

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("communities")
    .select("owner_id")
    .eq("id", communityId)
    .single();
  if (fetchError || !existing) return { error: "Community not found" };
  if (existing.owner_id !== user.id) return { error: "Only the owner can edit this community" };

  const { error } = await supabase
    .from("communities")
    .update({ [COMMUNITY_IMAGE_COLUMN[kind]]: imageUrl })
    .eq("id", communityId);
  if (error) return { error: error.message };

  revalidatePath(`/communities/${communityId}`);
  return { error: null };
}

export async function removeCommunityImage(communityId: string, kind: CommunityImageKind, storagePath: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("communities")
    .select("owner_id")
    .eq("id", communityId)
    .single();
  if (fetchError || !existing) return { error: "Community not found" };
  if (existing.owner_id !== user.id) return { error: "Only the owner can edit this community" };

  await supabase.storage.from("community-images").remove([storagePath]);
  const { error } = await supabase
    .from("communities")
    .update({ [COMMUNITY_IMAGE_COLUMN[kind]]: null })
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

  const { data: community, error } = await supabase
    .from("communities")
    .insert({
      name: data.name,
      description: data.description,
      category: data.category,
      extra_categories: data.extra_categories,
      city: data.city || null,
      extra_cities: data.extra_cities,
      community_type: data.community_type,
      external_link: data.external_link,
      kind: "external",
      owner_id: null,
      claim_status: "unclaimed",
    })
    .select()
    .single();

  if (error || !community) {
    if (error?.message.includes("too quickly")) return { error: error.message };
    return { error: error?.message ?? "Could not submit this listing" };
  }

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

  const { error } = await supabase.from("claims").insert({
    community_id: communityId,
    claimant_user_id: user.id,
    name: data.name,
    phone: data.phone,
    email: data.email,
    proof: data.proof || null,
  });

  if (error) {
    if (error.message.includes("too quickly")) return { error: error.message };
    // 23505 = unique_violation -- claims_one_pending_per_community (0024):
    // someone else's claim was submitted in the moment between this page
    // loading and this submit.
    if (error.code === "23505") return { error: "A claim for this community is already pending review." };
    return { error: error.message };
  }

  revalidatePath(`/communities/${communityId}`);
  notifyAdminsOfPendingClaim(community.name).catch((e) =>
    console.error("Failed to send claim notification email:", e),
  );
  return { error: null };
}

// Heads-up + deep link only -- the actual approve/reject decision still
// happens through the authenticated in-app buttons in PendingClaimsSection.
// Deliberately not a "click here to approve" link: email clients and
// security scanners pre-fetch links automatically, which would trigger an
// approval with no real human decision behind it if the link itself did
// the approving. Fire-and-forget from the caller (never blocks the
// claimant's own submission on email delivery) -- a failed send here means
// a missed heads-up, not a broken claim.
async function notifyAdminsOfPendingClaim(communityName: string) {
  const admin = createAdminClient();
  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
  if (!admins || admins.length === 0) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${siteUrl}/host/dashboard#pending-claims`;

  await Promise.all(
    admins.map(async (a) => {
      const { data: userResult } = await admin.auth.admin.getUserById(a.id);
      const email = userResult.user?.email;
      if (!email) return;
      await sendEmail({
        to: email,
        subject: `New claim pending review: ${communityName}`,
        html: `
          <p>A new claim for <strong>${communityName}</strong> is waiting for review.</p>
          <p><a href="${link}">Review pending claims</a></p>
        `,
      });
    }),
  );
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
