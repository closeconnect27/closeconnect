"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { createCommunitySchema, type CreateCommunityInput } from "@/lib/validation/community";

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
