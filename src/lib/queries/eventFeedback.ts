import type { SupabaseClient } from "@supabase/supabase-js";

export async function getMyEventFeedback(supabase: SupabaseClient, eventId: string, userId: string) {
  const { data } = await supabase
    .from("event_feedback")
    .select("rating, comment")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as { rating: number; comment: string | null } | null;
}

export type EventFeedbackEntry = {
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  display_name: string;
};

// Two-step (form_responses/profiles style): event_feedback has no FK-based
// embed path to profiles that PostgREST can traverse in one call here since
// we only need display_name, so a plain join keeps this simple instead.
export async function getEventFeedbackList(supabase: SupabaseClient, eventId: string): Promise<EventFeedbackEntry[]> {
  const { data: feedback } = await supabase
    .from("event_feedback")
    .select("user_id, rating, comment, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (!feedback || feedback.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", feedback.map((f) => f.user_id));
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  return feedback.map((f) => ({ ...f, display_name: nameById.get(f.user_id) ?? "Someone" }));
}
