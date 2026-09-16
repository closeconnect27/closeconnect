"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { submitEventFeedbackSchema } from "@/lib/validation/eventFeedback";

export async function submitEventFeedback(eventId: string, rating: number, comment: string) {
  const user = await requireUser();

  const parsed = submitEventFeedbackSchema.safeParse({ rating, comment: comment || undefined });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid feedback" };
  }

  const supabase = await createClient();

  // Explicit pre-check, not just RLS (is_checked_in_attendee) as the only
  // gate -- same reasoning as submitRating: the UI already hides this for
  // anyone who hasn't checked in, so a clear "why" here is a better failure
  // mode than a generic RLS 42501 for the only way to reach this (a direct
  // call bypassing the UI).
  //
  // Plain select + .some(), not .maybeSingle() -- re-registering for the
  // same event is explicitly allowed (0059), and multiple session dates
  // (0073) add another reason a user can end up with more than one
  // form_responses row for this event. .maybeSingle() errors out the
  // instant a second row exists, which silently broke this check for
  // exactly the "registered twice / different sessions, but checked in on
  // one of them" case -- checked in on ANY of them is what should count,
  // same as getMyEventCheckIn's own query already does.
  const { data: registrations } = await supabase
    .from("form_responses")
    .select("checked_in_at")
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .eq("respondent_id", user.id);
  if (!registrations?.some((r) => r.checked_in_at)) {
    return { error: "Only attendees who checked in can leave feedback." };
  }

  // Upsert on the (event_id, user_id) primary key -- leaving feedback again
  // just updates your existing feedback rather than erroring.
  const { error } = await supabase.from("event_feedback").upsert({
    event_id: eventId,
    user_id: user.id,
    rating: parsed.data.rating,
    comment: parsed.data.comment ?? null,
  });

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { error: "You're not allowed to leave feedback on this event." };
    }
    return { error: error.message };
  }
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/manage`);
  return { error: null };
}
