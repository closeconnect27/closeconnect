"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getCommunityFormFields } from "@/lib/queries/membership";
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
  revalidatePath(`/communities/${communityId}`);
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
  revalidatePath(`/communities/${communityId}`);
  return { error: null };
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

  revalidatePath(`/communities/${communityId}`);
  return { error: null };
}

export async function joinGroup(communityId: string, groupId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("community_group_members")
    .insert({ group_id: groupId, user_id: user.id });

  if (error) return { error: error.message };
  revalidatePath(`/communities/${communityId}`);
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

  revalidatePath(`/communities/${communityId}`);
  revalidatePath("/host/dashboard");
  return { error: null };
}
