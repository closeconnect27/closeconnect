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

// Same escape/shell/button visual language as src/lib/emailTemplate.ts and
// src/lib/email.ts on the Next.js side -- duplicated rather than shared
// because this is a separately-deployed Deno Edge Function with no access
// to that bundle, not a different design.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderReminderEmail(eventName: string, dateLabel: string, venue: string | null, message: string | null, eventLink: string) {
  const name = escapeHtml(eventName);
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f6f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f4;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 8px 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#1a1a1a;">
          Close<span style="color:#1a7a5e;">connect</span>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #e5e7e5;border-radius:16px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;">
          <p style="margin:0 0 8px;font-size:17px;">📣 A quick update on <strong>${name}</strong></p>
          <div style="background:#edf7f3;border-radius:12px;padding:18px 20px;margin:16px 0;font-size:14px;">
            <strong>${dateLabel}</strong>${venue ? `<br/>${escapeHtml(venue)}` : ""}
          </div>
          ${message ? `<p style="margin:0 0 20px;">${escapeHtml(message)}</p>` : ""}
          <p style="margin:24px 0 0;">
            <a href="${eventLink}" style="display:inline-block;padding:14px 30px;background:#1a7a5e;color:#ffffff;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;">View the event</a>
          </p>
        </td></tr>
        <tr><td style="padding:24px 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#6b6f6b;">
          <p style="margin:0;">&copy; ${new Date().getFullYear()} CloseConnect</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendReminderEmail(to: string, eventName: string, dateLabel: string, venue: string | null, message: string | null, eventId: string) {
  const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "https://closeconnect.in";
  const body = {
    from: "CloseConnect <notifications@closeconnect.in>",
    to,
    subject: `Reminder: ${eventName}`,
    html: renderReminderEmail(eventName, dateLabel, venue, message, `${siteUrl}/events/${eventId}`),
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
        await sendReminderEmail(userResult.user.email, event.event_name, dateLabel, event.venue, reminder.message, reminder.event_id);
      }),
    );

    // In-app notification alongside the email above -- this is the
    // scheduled-reminder counterpart to notify_event_reminder_now (0061),
    // which only covers a reminder due *immediately* at insert time; a
    // future-dated one is only ever actually delivered here, on the cron
    // tick that finds it due, so this is the one place that can notify for
    // it. Service-role client already bypasses RLS, same as the email send
    // above -- no separate policy needed for this insert.
    if (respondentIds.length > 0) {
      const { error: notifyError } = await supabase.from("notifications").insert(
        respondentIds.map((userId) => ({
          user_id: userId,
          type: "event_message",
          title: "Message from the host",
          body: reminder.message,
          link: `/events/${reminder.event_id}`,
        })),
      );
      if (notifyError) console.error(`Reminder ${reminder.id}: failed to insert notifications: ${notifyError.message}`);
    }

    processed += 1;
  }

  return new Response(JSON.stringify({ processed, skipped, due: (due ?? []).length }), {
    headers: { "Content-Type": "application/json" },
  });
});
