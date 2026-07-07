// Scheduled event reminders (Phase 11 Section 6). Invoked on a schedule
// (pg_cron + pg_net -- see the commented-out migration this repo ships
// alongside this function, not yet applied pending sign-off) via HTTP POST,
// same as any other Edge Function trigger.
//
// Security: this is the ONLY place in the app that reads registrant emails
// via a service-role client. auth.admin.getUserById() and the service role
// key never appear in any client-facing code path -- every other query in
// this app reaches form_responses/profiles through a normal anon-key client
// bound by RLS.
//
// Atomicity: each due reminder is claimed with a conditional
// `update ... where sent = false` BEFORE sending any email, not after.
// If two overlapping invocations ever raced (a slow run still going when
// the next scheduled tick fires), only one can successfully claim a given
// reminder -- `.select()` on the update returns zero rows for the loser,
// which skips it. The tradeoff this accepts: a crash *after* claiming but
// *before* finishing the send loop means some registrants in that batch
// might not get the email, and the next run won't retry them (the row is
// already marked sent). That's the deliberate choice here -- an occasional
// missed reminder is a much better failure mode for a non-critical feature
// than duplicate reminders to everyone who registered.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function formatEventDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

async function sendReminderEmail(to: string, eventName: string, dateLabel: string, venue: string | null, message: string | null) {
  const body = {
    from: "Close.Connect <notifications@closeconnect.in>",
    to,
    subject: `Reminder: ${eventName}`,
    html: `
      <h2>${eventName}</h2>
      <p>${dateLabel}${venue ? ` &middot; ${venue}` : ""}</p>
      ${message ? `<p>${message}</p>` : ""}
    `,
  };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`Resend send failed for ${to}: ${res.status} ${await res.text()}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: due, error: dueError } = await supabase
    .from("event_reminders")
    .select("id, event_id, message")
    .eq("sent", false)
    .lte("send_at", new Date().toISOString());

  if (dueError) {
    console.error("Failed to query due reminders:", dueError.message);
    return new Response(JSON.stringify({ error: dueError.message }), { status: 500 });
  }

  let processed = 0;
  let skipped = 0;

  for (const reminder of due ?? []) {
    // Claim first, send second -- see the atomicity note above.
    const { data: claimed, error: claimError } = await supabase
      .from("event_reminders")
      .update({ sent: true })
      .eq("id", reminder.id)
      .eq("sent", false)
      .select();

    if (claimError || !claimed || claimed.length === 0) {
      skipped += 1;
      continue;
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("event_name, event_date, venue")
      .eq("id", reminder.event_id)
      .single();
    if (eventError || !event || !event.event_date) {
      console.error(`Reminder ${reminder.id}: event ${reminder.event_id} not found or has no date`);
      continue;
    }

    const { data: registrations, error: regError } = await supabase
      .from("form_responses")
      .select("respondent_id")
      .eq("owner_type", "event")
      .eq("owner_id", reminder.event_id);
    if (regError) {
      console.error(`Reminder ${reminder.id}: could not load registrants: ${regError.message}`);
      continue;
    }

    const dateLabel = formatEventDate(event.event_date);
    const respondentIds = [...new Set((registrations ?? []).map((r) => r.respondent_id).filter((id): id is string => !!id))];

    await Promise.all(
      respondentIds.map(async (userId) => {
        const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(userId);
        if (userError || !userResult.user?.email) return;
        await sendReminderEmail(userResult.user.email, event.event_name, dateLabel, event.venue, reminder.message);
      }),
    );

    processed += 1;
  }

  return new Response(JSON.stringify({ processed, skipped, due: (due ?? []).length }), {
    headers: { "Content-Type": "application/json" },
  });
});
