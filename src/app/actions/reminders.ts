"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { eventReminderSchema, type EventReminderInput } from "@/lib/validation/event";

/** One mechanism for both "message everyone right now" (e.g. "running
 * late") and "schedule a reminder for later" -- both just insert an
 * event_reminders row; the already-deployed pg_cron job (every 5 minutes)
 * and send-event-reminders Edge Function pick up whatever's due
 * (send_at <= now()) and email every registrant, regardless of which flow
 * created the row. Host/admin only -- RLS (event_reminders_insert_host_or_admin,
 * 0022) backs this up independently. */
export async function createEventReminder(eventId: string, input: EventReminderInput) {
  const user = await requireUser();

  const parsed = eventReminderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const supabase = await createClient();

  const { data: event, error: fetchError } = await supabase.from("events").select("host_id").eq("id", eventId).single();
  if (fetchError || !event) return { error: "Event not found" };

  if (event.host_id !== user.id) {
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return { error: "Only the host can do this" };
  }

  const { error } = await supabase.from("event_reminders").insert({
    event_id: eventId,
    message: data.message,
    // No send_at means "now" -- the row is immediately due, so it goes out
    // on the very next cron tick (within 5 minutes) without needing a
    // separate "send immediately" code path.
    send_at: data.send_at ?? new Date().toISOString(),
  });
  if (error) return { error: error.message };

  revalidatePath(`/events/${eventId}/manage`);
  return { error: null };
}
