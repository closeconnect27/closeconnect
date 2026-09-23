"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { validateFaqs, type EventFaq } from "@/lib/eventFaqs";

/** Public -- only published, non-hidden FAQs, for the event page's
 * accordion and the checkout FAQ access point. Explicit filters here
 * rather than relying purely on RLS, so a host previewing their own
 * event's public page never sees their own unpublished drafts mixed in
 * with what a real visitor sees. */
export async function getFaqsForEvent(eventId: string): Promise<EventFaq[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_faqs")
    .select("question, answer, category, is_published")
    .eq("event_id", eventId)
    .eq("is_published", true)
    .eq("is_hidden_by_admin", false)
    .order("sort_order");
  return (data ?? []) as EventFaq[];
}

/** Host-only view -- every FAQ regardless of publish/moderation state, for
 * the create/edit forms. RLS (is_event_host) is the real gate: a
 * non-host caller just gets nothing back here rather than an error, same
 * posture as every other host-only read in this app. */
export async function getFaqsForEventEditor(eventId: string): Promise<EventFaq[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("event_faqs").select("question, answer, category, is_published").eq("event_id", eventId).order("sort_order");
  return (data ?? []) as EventFaq[];
}

/** Organizer-only (RLS: event_faqs_insert_host/update_host/delete_host on
 * is_event_host). Not gated by the ticket-types registration freeze -- an
 * FAQ has no coupling to existing registrations. Replace-all (delete then
 * insert), matching the ticket-types save convention. is_hidden_by_admin
 * is never touched here -- the protect_event_faq_admin_moderation trigger
 * would silently preserve it anyway even if it were, but this action never
 * even tries. */
export async function saveFaqsForEvent(eventId: string, faqs: EventFaq[]) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error: validationError, faqs: cleaned } = validateFaqs(faqs);
  if (validationError) return { error: validationError };

  const { error: deleteError } = await supabase.from("event_faqs").delete().eq("event_id", eventId);
  if (deleteError) return { error: deleteError.message };

  if (cleaned.length > 0) {
    const { data, error } = await supabase
      .from("event_faqs")
      .insert(cleaned.map((f, i) => ({ event_id: eventId, question: f.question, answer: f.answer, category: f.category, is_published: f.is_published, sort_order: i, created_by: user.id, updated_by: user.id })))
      .select();
    if (error) return { error: error.message };
    if (!data || data.length !== cleaned.length) return { error: "You don't have permission to edit this event." };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/edit`);
  return { error: null };
}

// ===========================================================================
// ADMIN MODERATION (section 43)
// ===========================================================================

export type EventFaqModerationRow = EventFaq & { id: string; eventId: string; eventName: string; isHiddenByAdmin: boolean };

async function requireAdmin() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) throw new Error("Admin only");
  return { user, supabase };
}

export async function listAllEventFaqsForAdmin(): Promise<EventFaqModerationRow[]> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("event_faqs")
    .select("id, event_id, question, answer, category, is_published, is_hidden_by_admin, events(event_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    eventId: r.event_id as string,
    eventName: (r.events as unknown as { event_name: string } | null)?.event_name ?? "Event",
    question: r.question as string,
    answer: r.answer as string,
    category: r.category as EventFaq["category"],
    is_published: r.is_published as boolean,
    isHiddenByAdmin: r.is_hidden_by_admin as boolean,
  }));
}

/** Hides/unhides without touching the organizer's own question/answer text
 * (section 43: "Do not silently modify organizer content") -- a visibility
 * flag only, enforced against a host clearing it by the
 * protect_event_faq_admin_moderation trigger. */
export async function setEventFaqHiddenByAdmin(faqId: string, hidden: boolean) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("event_faqs").update({ is_hidden_by_admin: hidden }).eq("id", faqId);
  if (error) return { error: error.message };
  revalidatePath("/admin/event-faqs");
  return { error: null };
}
