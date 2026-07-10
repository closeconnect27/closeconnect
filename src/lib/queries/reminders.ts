import type { SupabaseClient } from "@supabase/supabase-js";

export type EventReminder = {
  id: string;
  event_id: string;
  send_at: string;
  message: string | null;
  sent: boolean;
  created_at: string;
};

/** Host/admin only (RLS: event_reminders_select_host_or_admin, 0022). */
export async function getEventReminders(supabase: SupabaseClient, eventId: string) {
  const { data, error } = await supabase
    .from("event_reminders")
    .select("*")
    .eq("event_id", eventId)
    .order("send_at", { ascending: false });
  if (error) throw error;
  return data as EventReminder[];
}
