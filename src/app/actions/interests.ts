"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { trackServerEvent } from "@/lib/mixpanel/server";

export async function markInterested(eventId: string, visibleToHost: boolean) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("event_interests").insert({
    event_id: eventId,
    user_id: user.id,
    visible_to_host: visibleToHost,
  });

  if (error) {
    // 23505 = unique_violation -- already marked interested (the primary
    // key is (event_id, user_id)), not worth surfacing as a real error.
    if (error.code === "23505") return { error: null };
    return { error: error.message };
  }

  revalidatePath(`/events/${eventId}`);
  trackServerEvent("event_interested", user.id, { event_id: eventId, visible_to_host: visibleToHost });
  return { error: null };
}

export async function unmarkInterested(eventId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("event_interests").delete().eq("event_id", eventId).eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath(`/events/${eventId}`);
  return { error: null };
}
