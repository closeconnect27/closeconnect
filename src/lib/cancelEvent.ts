import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEventCancelledEmail } from "@/lib/eventRegistrationEmails";

// Shared by the web Server Action (src/app/actions/events.ts) and the
// mobile route (src/app/api/mobile/events/[id]/cancel/route.ts) -- same
// reasoning as accountDeletion.ts: both just authenticate the caller their
// own way and hand off an already-RLS-scoped client + the caller's id here.
//
// `supabase` must be a client authenticated as the calling user (cookies on
// web, bearer token on mobile) -- RLS (events_update_host_or_admin) is the
// real gate on the update itself; the admin client is only used afterward,
// to write into OTHER people's own notification rows, which
// notifications_insert_self would otherwise block.
export async function cancelEventForHost(supabase: SupabaseClient, eventId: string, callerId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from("events").update({ status: "cancelled" }).eq("id", eventId).select();
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not allowed to cancel this event" };

  const { data: registrants } = await supabase
    .from("form_responses")
    .select("respondent_id, response_data")
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .neq("respondent_id", callerId);
  const admin = createAdminClient();
  const seen = new Set<string>();
  for (const r of registrants ?? []) {
    if (!r.respondent_id || seen.has(r.respondent_id)) continue;
    seen.add(r.respondent_id);
    const responseData = r.response_data as unknown as { name?: string; email?: string } | null;
    await admin.from("notifications").insert({
      user_id: r.respondent_id,
      type: "event_cancelled",
      title: "Event cancelled",
      body: "The organizer cancelled an event you registered for. See our refund policy for details.",
      link: `/events/${eventId}`,
    });
    if (responseData?.email) {
      try {
        await sendEventCancelledEmail(supabase, {
          email: responseData.email,
          eventId,
          registrantName: responseData.name ?? "there",
        });
      } catch (e) {
        console.error("Failed to send event-cancelled email:", e);
      }
    }
  }

  return { error: null };
}
