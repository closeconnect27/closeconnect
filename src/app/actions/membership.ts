"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { renderEmailShell, emailButton, escapeHtml } from "@/lib/emailTemplate";
import { trackServerEvent } from "@/lib/mixpanel/server";
import { getCommunityFormFields, getCommunityMembers } from "@/lib/queries/membership";
import { formAnswersSchema } from "@/lib/validation/forms";
import { createGroupSchema, type CreateGroupInput } from "@/lib/validation/community";

export async function joinOpenCommunity(communityId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("form_responses").insert({
    owner_type: "community",
    owner_id: communityId,
    respondent_id: user.id,
    response_data: {},
    status: "approved",
  });

  if (error) return { error: error.message };
  revalidatePath("/communities/[id]", "page");
  trackServerEvent("community_joined", user.id, { community_id: communityId, join_mode: "open" });
  return { error: null };
}

export async function submitJoinRequest(communityId: string, answers: Record<string, string>) {
  const user = await requireUser();

  // Never trust the client to have enforced shape/size limits (SPEC.md
  // Section 11) -- bounds key count and per-value length before anything
  // else runs.
  const parsedAnswers = formAnswersSchema.safeParse(answers);
  if (!parsedAnswers.success) {
    return { error: parsedAnswers.error.issues[0]?.message ?? "Invalid answers" };
  }

  const supabase = await createClient();

  // Never trust the client to have enforced "required" -- re-check server-side
  // against the community's own question definitions.
  const fields = await getCommunityFormFields(supabase, communityId);
  for (const field of fields) {
    if (field.is_required && !parsedAnswers.data[field.id]?.trim()) {
      return { error: `"${field.label}" is required` };
    }
  }

  const { error } = await supabase.from("form_responses").insert({
    owner_type: "community",
    owner_id: communityId,
    respondent_id: user.id,
    response_data: parsedAnswers.data,
    status: "pending",
  });

  // The rate-limit trigger and the one-pending-per-respondent unique index
  // (0010_security_hardening.sql) both raise Postgres exceptions with
  // user-facing text -- safe to surface as-is, same pattern as chat's
  // rate-limit message.
  if (error) {
    if (error.message.includes("too quickly")) return { error: error.message };
    if (error.code === "23505") return { error: "You already have a pending request for this community." };
    return { error: error.message };
  }
  revalidatePath("/communities/[id]", "page");
  // Awaited, not fire-and-forget -- Cloudflare Workers can terminate an
  // un-awaited promise the instant this action's response is sent,
  // killing the fetch to Resend before it completes. A failure here still
  // doesn't fail the join request itself (only logs).
  try {
    await notifyOwnerOfPendingRequest(communityId);
  } catch (e) {
    console.error("Failed to send join-request notification email:", e);
  }
  return { error: null };
}

// Same pattern as notifyAdminsOfPendingClaim (app/actions/communities.ts):
// heads-up + deep link only, never a one-click approve. The owner still has
// to open the dashboard and click Approve/Reject there.
async function notifyOwnerOfPendingRequest(communityId: string) {
  const admin = createAdminClient();
  const { data: community } = await admin.from("communities").select("name, owner_id").eq("id", communityId).single();
  if (!community?.owner_id) return;

  const { data: userResult } = await admin.auth.admin.getUserById(community.owner_id);
  const email = userResult.user?.email;
  if (!email) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${siteUrl}/host/dashboard#community-${communityId}`;

  await sendEmail({
    to: email,
    subject: `Someone wants in 👋 New request for ${community.name}`,
    html: renderEmailShell({
      preheader: `Someone just requested to join ${community.name} -- review it in your dashboard.`,
      bodyHtml: `
        <p style="margin:0 0 8px;font-size:17px;">Hey there 👋</p>
        <p style="margin:0 0 20px;">Someone just requested to join <strong>${escapeHtml(community.name)}</strong>. Take a look and let them in (or don't) whenever you get a sec.</p>
        <p style="margin:0;">${emailButton("Review the request", link)}</p>
      `,
    }),
  });
}

export async function createGroup(communityId: string, input: CreateGroupInput) {
  const user = await requireUser();

  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();

  // RLS (community_groups_insert_staff) is the real gate -- a non-staff
  // caller's insert simply fails rather than erroring silently past it.
  const { data: group, error } = await supabase
    .from("community_groups")
    .insert({ community_id: communityId, name: parsed.data.name, description: parsed.data.description || null })
    .select()
    .single();

  if (error || !group) return { error: error?.message ?? "Could not create group" };

  // The staff member who created it is already a community member (that's
  // what let them get here) -- auto-join them to the group they just made,
  // matching WhatsApp's behavior, instead of leaving them outside their own
  // new group.
  await supabase.from("community_group_members").insert({ group_id: group.id, user_id: user.id });

  revalidatePath("/communities/[id]", "page");
  return { error: null };
}

export async function joinGroup(communityId: string, groupId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("community_group_members")
    .insert({ group_id: groupId, user_id: user.id });

  if (error) return { error: error.message };
  revalidatePath("/communities/[id]", "page");
  return { error: null };
}

export async function reviewJoinRequest(
  communityId: string,
  responseId: string,
  decision: "approved" | "rejected",
) {
  await requireUser();
  const supabase = await createClient();

  // RLS (form_responses_update_owner) is the real gate here -- a non-staff
  // caller's update simply matches zero rows rather than erroring.
  const { data, error } = await supabase
    .from("form_responses")
    .update({ status: decision })
    .eq("id", responseId)
    .select();

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not allowed to review this request" };

  revalidatePath("/communities/[id]", "page");
  revalidatePath("/host/dashboard");
  return { error: null };
}

/** Any admin can promote/demote any OTHER member now (0109), not just the
 * owner -- explicit check here (SPEC.md Section 11), not just RLS. RLS
 * (community_members_update_staff, 0109) is the real backstop: its `with
 * check` requires the CALLER to already be staff in this community (or a
 * platform admin), and it separately protects the owner's own row from
 * being touched by a plain admin. Never targets the owner's own row here
 * either, regardless of who's calling -- stepping down as owner happens
 * through transferCommunityOwnership, not a plain role change, so
 * "message the host"-style features can always assume owner_id points at
 * someone who still actually holds the 'owner' role. */
export async function setMemberRole(communityId: string, targetUserId: string, role: "moderator" | "member") {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: community, error: fetchError } = await supabase
    .from("communities")
    .select("owner_id")
    .eq("id", communityId)
    .single();
  if (fetchError || !community) return { error: "Community not found" };
  if (targetUserId === community.owner_id) return { error: "The owner's role can't be changed this way" };

  if (community.owner_id !== user.id) {
    const { data: membership } = await supabase
      .from("community_members")
      .select("role")
      .eq("community_id", communityId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership?.role !== "owner" && membership?.role !== "moderator") {
      return { error: "Only an admin can change member roles" };
    }
  }

  const { data, error } = await supabase
    .from("community_members")
    .update({ role })
    .eq("community_id", communityId)
    .eq("user_id", targetUserId)
    .select();

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That person isn't a member of this community" };

  revalidatePath("/communities/[id]", "page");
  return { error: null };
}

/** No requireUser() -- community_members_select_public (0001) is already
 * unconditional, same data MemberList's initial server-rendered page
 * already exposes; this is just the next page of the exact same read, not
 * a new privilege. */
export async function loadMoreCommunityMembers(communityId: string, offset: number) {
  const supabase = await createClient();
  const members = await getCommunityMembers(supabase, communityId, offset);
  return { members };
}

export async function removeMember(communityId: string, targetUserId: string) {
  const user = await requireUser();

  // Removing yourself through this action would orphan the community if
  // you're the owner (no other staff signal survives it), and doesn't make
  // sense for a moderator either -- "Remove" here is for removing other
  // people. Checked before anything else, and explicitly, not left as an
  // assumption nobody would click it on themselves.
  if (targetUserId === user.id) {
    return { error: "You can't remove yourself this way." };
  }

  const supabase = await createClient();

  // RLS (community_members_delete_self_or_staff) is the real gate -- a
  // non-staff caller's delete simply matches zero rows rather than
  // erroring. It also already refuses to let staff delete the owner's own
  // row (role <> 'owner' in the policy), so a moderator can't remove the
  // owner through this same path.
  const { data, error } = await supabase
    .from("community_members")
    .delete()
    .eq("community_id", communityId)
    .eq("user_id", targetUserId)
    .select();

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not allowed to remove this member" };

  revalidatePath("/communities/[id]", "page");
  return { error: null };
}

/** The self-removal counterpart to removeMember (which explicitly refuses
 * to target the caller's own row). The owner specifically can't just
 * leave -- "message the host"-style features need owner_id to always
 * point at someone still actually in the community, so an owner must
 * transfer ownership to another member first (newOwnerUserId), via
 * transfer_community_ownership (0109). Without it, this returns a clear
 * `needsOwnerHandoff` signal the UI uses to prompt for a successor instead
 * of a raw RLS "not allowed" once the delete matches zero rows (RLS,
 * community_members_delete_self_or_staff, still blocks an owner's own row
 * outright -- that's the real backstop, this is just the friendlier
 * front door). Once transferred, the caller is left as a plain 'moderator'
 * row, which the same delete step below removes same as any other admin
 * leaving. Also leaves every one of this community's groups
 * (community_group_members has no FK cascade off community_members --
 * these are two independent join tables keyed by community_id only
 * through community_groups), so leaving the community doesn't strand a
 * ghost membership in its Common Room/Broadcast or any other group. */
export async function leaveCommunity(communityId: string, newOwnerUserId?: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return { error: "You're not a member of this community" };

  if (membership.role === "owner") {
    if (!newOwnerUserId) {
      return {
        error: "Choose someone to hand ownership to before you leave -- a community always needs an owner.",
        needsOwnerHandoff: true,
      };
    }
    const { error: transferError } = await supabase.rpc("transfer_community_ownership", {
      p_community_id: communityId,
      p_new_owner_id: newOwnerUserId,
    });
    if (transferError) return { error: transferError.message };
  }

  const { data: groups } = await supabase.from("community_groups").select("id").eq("community_id", communityId);
  const groupIds = (groups ?? []).map((g) => g.id as string);
  if (groupIds.length > 0) {
    await supabase.from("community_group_members").delete().eq("user_id", user.id).in("group_id", groupIds);
  }

  const { error } = await supabase
    .from("community_members")
    .delete()
    .eq("community_id", communityId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/communities/[id]", "page");
  trackServerEvent("community_left", user.id, { community_id: communityId });
  return { error: null };
}
