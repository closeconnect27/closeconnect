import type { SupabaseClient } from "@supabase/supabase-js";

export type PayoutLine = {
  registrationId: string;
  eventId: string;
  eventName: string;
  quantity: number;
  amountRupees: number;
};

export type OrganizerPayout = {
  hostId: string;
  hostName: string;
  hostEmail: string | null;
  totalOwedRupees: number;
  lines: PayoutLine[];
};

/** Every paid-but-not-yet-forwarded ticket, grouped by the event's host --
 * "amount owed to each organizer" computed straight from this app's own
 * data (payment_status='paid', payout_status still 'pending', 0065's own
 * columns) rather than by hand-reconciling a Razorpay export. Admin-only
 * (crosses every host's financial data) -- call with a service-role client
 * from an already-is_admin-gated Server Component, same posture as every
 * other admin query in this app (RLS on form_responses only ever grants a
 * row's own respondent or event host, never a platform admin). */
export async function getPayoutSummary(admin: SupabaseClient): Promise<OrganizerPayout[]> {
  const { data: rows, error } = await admin
    .from("form_responses")
    .select("id, owner_id, quantity, event_ticket_types(price)")
    .eq("owner_type", "event")
    .eq("payment_status", "paid")
    .eq("payout_status", "pending");
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  // owner_id has no real FK (it's the polymorphic event/community id column,
  // see form_responses' own definition) -- PostgREST can't embed `events`
  // through it, so the event/host lookup is a separate query, not a join.
  const eventIds = [...new Set(rows.map((r) => r.owner_id as string))];
  const { data: events, error: eventsError } = await admin.from("events").select("id, event_name, host_id").in("id", eventIds);
  if (eventsError) throw eventsError;
  const eventById = new Map((events ?? []).map((e) => [e.id as string, e]));

  const hostIds = [...new Set((events ?? []).map((e) => e.host_id as string))];
  const { data: profiles } = await admin.from("profiles").select("id, display_name").in("id", hostIds);
  const nameByHostId = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));

  // profiles has no email column by design (see lib/email.ts) -- only
  // reachable via the admin auth API, same reasoning as every other
  // "email an organizer" call site in this app. One call per host, not a
  // bulk lookup (no such API exists in supabase-js) -- host counts are
  // small enough that N parallel calls is simpler than paginating
  // listUsers() and filtering.
  const emailByHostId = new Map(
    await Promise.all(
      hostIds.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        return [id, data.user?.email ?? null] as const;
      }),
    ),
  );

  const byHost = new Map<string, OrganizerPayout>();
  for (const row of rows) {
    const event = eventById.get(row.owner_id as string);
    if (!event) continue;
    const price = (row.event_ticket_types as unknown as { price: number } | null)?.price ?? 0;
    // A free ticket's payment_status is 'paid' too (0041's own backfill
    // convention -- it just means "nothing left to do", not "money
    // collected"), so no amount was ever owed for it. Filtered here rather
    // than backfilling payout_status for every free registration going
    // forward -- registerForEvent never sets it either way, so this is the
    // one place that actually needs to know the difference.
    if (price <= 0) continue;
    const amountRupees = price * (row.quantity as number);

    const hostId = event.host_id as string;
    if (!byHost.has(hostId)) {
      byHost.set(hostId, {
        hostId,
        hostName: nameByHostId.get(hostId) ?? "Unknown",
        hostEmail: emailByHostId.get(hostId) ?? null,
        totalOwedRupees: 0,
        lines: [],
      });
    }
    const entry = byHost.get(hostId)!;
    entry.totalOwedRupees += amountRupees;
    entry.lines.push({
      registrationId: row.id as string,
      eventId: event.id as string,
      eventName: event.event_name as string,
      quantity: row.quantity as number,
      amountRupees,
    });
  }

  return [...byHost.values()].sort((a, b) => b.totalOwedRupees - a.totalOwedRupees);
}
