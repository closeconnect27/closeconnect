"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export type AddonInput = { id?: string; name: string; price: number; quantity_available: number | null; is_active: boolean };

/** Host-only view -- every add-on regardless of is_active, for the
 * organizer's own editor (same split as getFaqsForEvent/
 * getFaqsForEventEditor). RLS (is_event_host) is the real gate. */
export async function getAddonsForEventEditor(eventId: string): Promise<(AddonInput & { id: string })[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("event_addons").select("id, name, price, quantity_available, is_active").eq("event_id", eventId).order("sort_order");
  return (data ?? []) as (AddonInput & { id: string })[];
}

/** Organizer-only (RLS: event_addons_insert_host/update_host/delete_host).
 * Per-row upsert, NOT a delete-then-reinsert-all -- unlike FAQs/policy,
 * every add-on's id is a real foreign key historical orders reference
 * (form_response_addons.addon_id); recreating an unchanged row with a
 * fresh id would needlessly null out that link on every single save (see
 * the AddonDraft/schema's own comments). An add-on the host actually
 * removes from the list IS deleted (its own historical orders keep their
 * name_snapshot/unit_price_paise regardless, on delete set null) -- to
 * stop selling something without losing its history, deactivate it
 * (is_active) instead of deleting it. */
export async function saveAddonsForEvent(eventId: string, addons: AddonInput[]) {
  await requireUser();
  const supabase = await createClient();

  const cleaned = addons
    .map((a) => ({ ...a, name: a.name.trim(), price: Number.isFinite(a.price) && a.price >= 0 ? a.price : 0 }))
    .filter((a) => a.name);
  if (cleaned.some((a) => a.name.length > 120)) return { error: "An add-on name can be at most 120 characters." };

  const { data: existing } = await supabase.from("event_addons").select("id").eq("event_id", eventId);
  const existingIds = new Set((existing ?? []).map((r) => r.id as string));
  const keptIds = new Set(cleaned.filter((a) => a.id).map((a) => a.id!));
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));

  if (toDelete.length > 0) {
    const { error } = await supabase.from("event_addons").delete().in("id", toDelete);
    if (error) return { error: error.message };
  }

  for (const [i, a] of cleaned.entries()) {
    const row = { event_id: eventId, name: a.name, price: a.price, quantity_available: a.quantity_available, is_active: a.is_active, sort_order: i };
    if (a.id && existingIds.has(a.id)) {
      const { error } = await supabase.from("event_addons").update(row).eq("id", a.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("event_addons").insert(row);
      if (error) return { error: error.message };
    }
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/edit`);
  return { error: null };
}
