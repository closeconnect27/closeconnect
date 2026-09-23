"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { validatePlatformFaq, type PlatformFaq, type PlatformFaqCategory } from "@/lib/platformFaqs";

/** Public -- every published FAQ, ordered for display. An admin previewing
 * drafts (section 26) gets everything via the same RLS policy's is_admin()
 * branch, so this one function serves both the public page and the admin
 * management screen. */
export async function listPlatformFaqs(): Promise<PlatformFaq[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_faqs").select("id, question, answer, category, display_order, is_published").order("category").order("display_order");
  return (data ?? []) as PlatformFaq[];
}

async function requireAdmin() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) throw new Error("Admin only");
  return { user, supabase };
}

export async function createPlatformFaq(input: { question: string; answer: string; category: PlatformFaqCategory }) {
  const { user, supabase } = await requireAdmin();
  const validationError = validatePlatformFaq(input);
  if (validationError) return { error: validationError };

  const { count } = await supabase.from("platform_faqs").select("*", { count: "exact", head: true }).eq("category", input.category);
  const { error } = await supabase.from("platform_faqs").insert({
    question: input.question.trim(),
    answer: input.answer.trim(),
    category: input.category,
    display_order: count ?? 0,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/faqs");
  revalidatePath("/admin/faqs");
  return { error: null };
}

export async function updatePlatformFaq(id: string, input: { question: string; answer: string; category: PlatformFaqCategory; is_published: boolean }) {
  const { user, supabase } = await requireAdmin();
  const validationError = validatePlatformFaq(input);
  if (validationError) return { error: validationError };

  const { error } = await supabase
    .from("platform_faqs")
    .update({ question: input.question.trim(), answer: input.answer.trim(), category: input.category, is_published: input.is_published, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/faqs");
  revalidatePath("/admin/faqs");
  return { error: null };
}

export async function deletePlatformFaq(id: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("platform_faqs").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/faqs");
  revalidatePath("/admin/faqs");
  return { error: null };
}

export async function togglePlatformFaqPublished(id: string, isPublished: boolean) {
  const { user, supabase } = await requireAdmin();
  const { error } = await supabase.from("platform_faqs").update({ is_published: isPublished, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/faqs");
  revalidatePath("/admin/faqs");
  return { error: null };
}

/** Swaps display_order with the adjacent FAQ in the same category --
 * simple up/down reordering rather than drag-and-drop, same trade-off
 * FormFieldBuilder's moveField already makes for this codebase. */
export async function reorderPlatformFaq(id: string, direction: "up" | "down") {
  const { supabase } = await requireAdmin();
  const { data: faq } = await supabase.from("platform_faqs").select("category, display_order").eq("id", id).single();
  if (!faq) return { error: "FAQ not found" };

  const { data: neighbor } = await supabase
    .from("platform_faqs")
    .select("id, display_order")
    .eq("category", faq.category)
    .order("display_order", { ascending: direction === "up" ? false : true })
    .lt("display_order", direction === "up" ? faq.display_order : Number.MAX_SAFE_INTEGER)
    .gt("display_order", direction === "down" ? faq.display_order : -1)
    .limit(1)
    .maybeSingle();
  if (!neighbor) return { error: null };

  await supabase.from("platform_faqs").update({ display_order: neighbor.display_order }).eq("id", id);
  await supabase.from("platform_faqs").update({ display_order: faq.display_order }).eq("id", neighbor.id);
  revalidatePath("/faqs");
  revalidatePath("/admin/faqs");
  return { error: null };
}
