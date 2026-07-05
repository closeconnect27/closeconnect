"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getCommunityFormFields } from "@/lib/queries/membership";

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
  const supabase = await createClient();

  // Never trust the client to have enforced "required" -- re-check server-side
  // against the community's own question definitions.
  const fields = await getCommunityFormFields(supabase, communityId);
  for (const field of fields) {
    if (field.is_required && !answers[field.id]?.trim()) {
      return { error: `"${field.label}" is required` };
    }
  }

  const { error } = await supabase.from("form_responses").insert({
    owner_type: "community",
    owner_id: communityId,
    respondent_id: user.id,
    response_data: answers,
    status: "pending",
  });

  if (error) return { error: error.message };
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
