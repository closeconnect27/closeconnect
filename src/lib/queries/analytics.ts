import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReferrerSource } from "@/lib/referrerSource";

export async function getViewCount(supabase: SupabaseClient, targetType: "community" | "event", targetId: string) {
  // RLS (page_views_select_owner_or_host) is the real gate -- a non-owner
  // caller just gets 0 back rather than an error, same "silent zero rows"
  // pattern used everywhere else RLS is the enforcement.
  const { count, error } = await supabase
    .from("page_views")
    .select("*", { count: "exact", head: true })
    .eq("target_type", targetType)
    .eq("target_id", targetId);
  if (error) throw error;
  return count ?? 0;
}

/** Daily view counts for a trend chart -- {date: "2026-07-01", count: 4}[]. */
export async function getViewsByDay(supabase: SupabaseClient, targetType: "community" | "event", targetId: string) {
  const { data, error } = await supabase
    .from("page_views")
    .select("viewed_on")
    .eq("target_type", targetType)
    .eq("target_id", targetId);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const day = row.viewed_on as string;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Where views are actually coming from -- classify_referrer's own bucket
 * set (direct/search/social/instagram/linkedin/other), captured on every
 * page_views row since 0038 but never surfaced anywhere until now. */
export async function getReferrerBreakdown(supabase: SupabaseClient, targetType: "community" | "event", targetId: string) {
  const { data, error } = await supabase
    .from("page_views")
    .select("referrer_source")
    .eq("target_type", targetType)
    .eq("target_id", targetId);
  if (error) throw error;

  const counts = new Map<ReferrerSource, number>();
  for (const row of data ?? []) {
    const source = (row.referrer_source as ReferrerSource) ?? "direct";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return [...counts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
}

/** Web vs app -- same shape as getReferrerBreakdown, grouped by platform
 * (0138) instead of referrer_source. Every row was implicitly "web" until
 * the mobile app started writing its own page_views rows tagged 'app'. */
export async function getPlatformBreakdown(supabase: SupabaseClient, targetType: "community" | "event", targetId: string) {
  const { data, error } = await supabase
    .from("page_views")
    .select("platform")
    .eq("target_type", targetType)
    .eq("target_id", targetId);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const platform = (row.platform as string) ?? "web";
    counts.set(platform, (counts.get(platform) ?? 0) + 1);
  }
  return [...counts.entries()].map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count);
}

export type JoinRequestMetrics = {
  byDay: { date: string; pending: number; approved: number; rejected: number }[];
  totals: { pending: number; approved: number; rejected: number };
};

/** Join-request volume for a community, grouped by status and day. */
export async function getJoinRequestMetrics(supabase: SupabaseClient, communityId: string): Promise<JoinRequestMetrics> {
  const { data, error } = await supabase
    .from("form_responses")
    .select("status, created_at")
    .eq("owner_type", "community")
    .eq("owner_id", communityId);
  if (error) throw error;

  const byDayMap = new Map<string, { pending: number; approved: number; rejected: number }>();
  const totals = { pending: 0, approved: 0, rejected: 0 };
  for (const row of data ?? []) {
    const day = (row.created_at as string).slice(0, 10);
    const status = row.status as "pending" | "approved" | "rejected";
    const entry = byDayMap.get(day) ?? { pending: 0, approved: 0, rejected: 0 };
    entry[status] += 1;
    byDayMap.set(day, entry);
    totals[status] += 1;
  }

  const byDay = [...byDayMap.entries()]
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { byDay, totals };
}

/** Registration volume for an event, grouped by day. */
export async function getEventRegistrationMetrics(supabase: SupabaseClient, eventId: string) {
  const { data, error } = await supabase
    .from("form_responses")
    .select("created_at")
    .eq("owner_type", "event")
    .eq("owner_id", eventId);
  if (error) throw error;

  const byDayMap = new Map<string, number>();
  for (const row of data ?? []) {
    const day = (row.created_at as string).slice(0, 10);
    byDayMap.set(day, (byDayMap.get(day) ?? 0) + 1);
  }
  const byDay = [...byDayMap.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { byDay, total: (data ?? []).length };
}

export type AddonMetric = {
  addonId: string | null; // null = the add-on was later deleted (not archived); name_snapshot is all that's left of it
  name: string;
  price: number | null; // live event_addons.price -- null for a deleted add-on, which only has historical unit prices
  quantityAvailable: number | null;
  unitsSold: number;
  revenuePaise: number;
  refundsPaise: number;
  isActive: boolean | null; // null for a deleted add-on
};

export type EventAddonMetrics = {
  addons: AddonMetric[];
  totalAddonRevenuePaise: number;
  totalRefundsPaise: number;
  attachRate: number | null; // fraction of paid bookings that included at least one add-on
  averageAddonSpendPaise: number; // total add-on revenue / paid bookings (0 if no paid bookings)
};

/** Section 89 of the spec this was built from: units sold/revenue/refunds
 * per add-on, plus attach rate and average add-on spend across the whole
 * event. "Sold"/"Revenue" only ever count a still-active (non-refunded)
 * form_response_addons line on a PAID registration -- an abandoned/unpaid
 * checkout never actually charged anyone for the add-on it briefly held,
 * and a refunded line's money has already been given back, so neither
 * belongs in a live revenue number (refundsPaise reports it separately
 * instead). A deleted (not archived) add-on still shows up here, grouped
 * by its name_snapshot, since its historical sales are still real -- only
 * a currently-configured add-on gets price/quantityAvailable/isActive. */
export async function getEventAddonMetrics(supabase: SupabaseClient, eventId: string): Promise<EventAddonMetrics> {
  const [{ data: liveAddons }, { data: lines }, { data: paidRegs }] = await Promise.all([
    supabase.from("event_addons").select("id, name, price, quantity_available, is_active").eq("event_id", eventId).order("sort_order"),
    supabase
      .from("form_response_addons")
      .select("registration_id, addon_id, name_snapshot, unit_price_paise, quantity, status, refund_amount_paise, form_responses!inner(owner_id, owner_type, payment_status)")
      .eq("form_responses.owner_id", eventId)
      .eq("form_responses.owner_type", "event")
      .eq("form_responses.payment_status", "paid"),
    supabase.from("form_responses").select("id").eq("owner_type", "event").eq("owner_id", eventId).eq("payment_status", "paid"),
  ]);

  type LineRow = { registration_id: string; addon_id: string | null; name_snapshot: string; unit_price_paise: number; quantity: number; status: string; refund_amount_paise: number };
  const rows = (lines ?? []) as unknown as LineRow[];

  const byKey = new Map<string, { addonId: string | null; name: string; unitsSold: number; revenuePaise: number; refundsPaise: number }>();
  for (const r of rows) {
    const key = r.addon_id ?? `deleted:${r.name_snapshot}`;
    const entry = byKey.get(key) ?? { addonId: r.addon_id, name: r.name_snapshot, unitsSold: 0, revenuePaise: 0, refundsPaise: 0 };
    if (r.status === "active") {
      entry.unitsSold += r.quantity;
      entry.revenuePaise += r.unit_price_paise * r.quantity;
    }
    entry.refundsPaise += r.refund_amount_paise;
    byKey.set(key, entry);
  }

  const addons: AddonMetric[] = (liveAddons ?? []).map((a) => {
    const stats = byKey.get(a.id) ?? { unitsSold: 0, revenuePaise: 0, refundsPaise: 0 };
    byKey.delete(a.id);
    return {
      addonId: a.id,
      name: a.name,
      price: a.price,
      quantityAvailable: a.quantity_available,
      unitsSold: stats.unitsSold,
      revenuePaise: stats.revenuePaise,
      refundsPaise: stats.refundsPaise,
      isActive: a.is_active,
    };
  });
  // Whatever's left in byKey is a deleted add-on's historical sales, not
  // represented by any current event_addons row.
  for (const stats of byKey.values()) {
    addons.push({ addonId: null, name: stats.name, price: null, quantityAvailable: null, unitsSold: stats.unitsSold, revenuePaise: stats.revenuePaise, refundsPaise: stats.refundsPaise, isActive: null });
  }

  const totalAddonRevenuePaise = addons.reduce((sum, a) => sum + a.revenuePaise, 0);
  const totalRefundsPaise = addons.reduce((sum, a) => sum + a.refundsPaise, 0);
  const paidBookingCount = (paidRegs ?? []).length;
  const bookingsWithAddons = new Set(rows.filter((r) => r.status === "active").map((r) => r.registration_id)).size;
  const attachRate = paidBookingCount === 0 ? null : bookingsWithAddons / paidBookingCount;
  const averageAddonSpendPaise = paidBookingCount === 0 ? 0 : Math.round(totalAddonRevenuePaise / paidBookingCount);

  return { addons, totalAddonRevenuePaise, totalRefundsPaise, attachRate, averageAddonSpendPaise };
}

/** Computed at query time, never stored -- conversion drifts as both inputs
 * change, so a cached value would just go stale. Returns null rather than
 * dividing by zero when there's no view data yet. */
export function computeConversionRate(views: number, registrations: number): number | null {
  if (views === 0) return null;
  return registrations / views;
}

/** approved / total, per the literal spec -- not approved / (approved +
 * rejected), so a pile of still-pending requests visibly drags the rate
 * down rather than being excluded, which is arguably the more honest
 * "how well is this community converting interest into members" number.
 * Null (not 0) when there have been no requests at all yet, same
 * div-by-zero convention as computeConversionRate. */
export function computeAcceptanceRate(totals: JoinRequestMetrics["totals"]): number | null {
  const total = totals.pending + totals.approved + totals.rejected;
  if (total === 0) return null;
  return totals.approved / total;
}

/** New members per calendar month for a community -- community_members
 * itself has no is_native/kind filter to apply here since it's already
 * community-scoped by community_id. */
export async function getNewMembersByMonth(supabase: SupabaseClient, communityId: string) {
  const { data, error } = await supabase
    .from("community_members")
    .select("joined_at")
    .eq("community_id", communityId);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const month = (row.joined_at as string).slice(0, 7); // "2026-07"
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export type ActiveMember = { userId: string; displayName: string; messageCount: number };

/** Ranked by message count in this community's groups -- community_messages
 * references group_id, not community_id directly, so this resolves the
 * community's own groups first rather than a single joined query
 * PostgREST could do (same two-step-then-merge shape as
 * getMyRegisteredEvents for a polymorphic/indirect relationship). Not a
 * new table -- exactly per spec, a live count over the existing table. */
export async function getMostActiveMembers(supabase: SupabaseClient, communityId: string, limit = 5) {
  const { data: groups, error: groupsError } = await supabase
    .from("community_groups")
    .select("id")
    .eq("community_id", communityId);
  if (groupsError) throw groupsError;
  if (!groups || groups.length === 0) return [];

  const { data: messages, error: messagesError } = await supabase
    .from("community_messages")
    .select("user_id")
    .in(
      "group_id",
      groups.map((g) => g.id),
    );
  if (messagesError) throw messagesError;
  if (!messages || messages.length === 0) return [];

  const countByUser = new Map<string, number>();
  for (const row of messages) {
    const userId = row.user_id as string;
    countByUser.set(userId, (countByUser.get(userId) ?? 0) + 1);
  }

  const topUserIds = [...countByUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([userId]) => userId);

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", topUserIds);
  if (profilesError) throw profilesError;
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  return topUserIds.map((userId) => ({
    userId,
    displayName: nameById.get(userId) ?? "Someone",
    messageCount: countByUser.get(userId)!,
  })) as ActiveMember[];
}

export type TopEvent = { eventId: string; eventName: string; registrations: number; views: number };

/** Which of this community's events actually drove registrations --
 * same two-step "get the community's events, then batch-query the generic
 * form_responses/page_views tables for those event ids" shape as
 * getJoinRequestMetrics/getMostActiveMembers, since neither table has a
 * community_id of its own to filter on directly. */
export async function getTopEventsByRegistrations(supabase: SupabaseClient, communityId: string, limit = 5): Promise<TopEvent[]> {
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, event_name")
    .eq("community_id", communityId);
  if (eventsError) throw eventsError;
  if (!events || events.length === 0) return [];

  const eventIds = events.map((e) => e.id);

  const { data: registrations, error: registrationsError } = await supabase
    .from("form_responses")
    .select("owner_id")
    .eq("owner_type", "event")
    .in("owner_id", eventIds);
  if (registrationsError) throw registrationsError;

  const { data: views, error: viewsError } = await supabase
    .from("page_views")
    .select("target_id")
    .eq("target_type", "event")
    .in("target_id", eventIds);
  if (viewsError) throw viewsError;

  const registrationsByEvent = new Map<string, number>();
  for (const row of registrations ?? []) {
    const eventId = row.owner_id as string;
    registrationsByEvent.set(eventId, (registrationsByEvent.get(eventId) ?? 0) + 1);
  }
  const viewsByEvent = new Map<string, number>();
  for (const row of views ?? []) {
    const eventId = row.target_id as string;
    viewsByEvent.set(eventId, (viewsByEvent.get(eventId) ?? 0) + 1);
  }

  return events
    .map((e) => ({
      eventId: e.id as string,
      eventName: e.event_name as string,
      registrations: registrationsByEvent.get(e.id) ?? 0,
      views: viewsByEvent.get(e.id) ?? 0,
    }))
    .sort((a, b) => b.registrations - a.registrations)
    .slice(0, limit);
}

export type TopPost = { postId: string; excerpt: string; reactionCount: number; commentCount: number; totalEngagement: number };

/** Which posts actually got interacted with -- reactions + comments, each
 * counted with its own batched .in("post_id", ids) query against the two
 * per-post tables, same two-step-then-merge shape as getTopEventsByRegistrations
 * above. excerpt truncation matches the existing ~80-char inline slice
 * convention (queries/reports.ts's message-content preview) rather than a
 * new shared helper. */
export async function getTopPostsByEngagement(supabase: SupabaseClient, communityId: string, limit = 5): Promise<TopPost[]> {
  const { data: posts, error: postsError } = await supabase
    .from("community_posts")
    .select("id, content, created_at")
    .eq("community_id", communityId);
  if (postsError) throw postsError;
  if (!posts || posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);

  const { data: reactions, error: reactionsError } = await supabase
    .from("community_post_reactions")
    .select("post_id")
    .in("post_id", postIds);
  if (reactionsError) throw reactionsError;

  const { data: comments, error: commentsError } = await supabase
    .from("community_post_comments")
    .select("post_id")
    .in("post_id", postIds);
  if (commentsError) throw commentsError;

  const reactionsByPost = new Map<string, number>();
  for (const row of reactions ?? []) {
    const postId = row.post_id as string;
    reactionsByPost.set(postId, (reactionsByPost.get(postId) ?? 0) + 1);
  }
  const commentsByPost = new Map<string, number>();
  for (const row of comments ?? []) {
    const postId = row.post_id as string;
    commentsByPost.set(postId, (commentsByPost.get(postId) ?? 0) + 1);
  }

  return posts
    .map((p) => {
      const reactionCount = reactionsByPost.get(p.id) ?? 0;
      const commentCount = commentsByPost.get(p.id) ?? 0;
      const content = p.content as string;
      return {
        postId: p.id as string,
        excerpt: content.length > 80 ? `${content.slice(0, 80)}…` : content,
        reactionCount,
        commentCount,
        totalEngagement: reactionCount + commentCount,
      };
    })
    .sort((a, b) => b.totalEngagement - a.totalEngagement)
    .slice(0, limit);
}

/** Registrations vs check-ins across ALL of this community's events combined
 * (not per-event -- keep it simple, per spec). checked_in_count (0055) is
 * summed against the total form_responses row count for the same event ids
 * getTopEventsByRegistrations resolves. */
export async function getEventCheckInRate(supabase: SupabaseClient, communityId: string): Promise<{ registrations: number; checkedIn: number }> {
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id")
    .eq("community_id", communityId);
  if (eventsError) throw eventsError;
  if (!events || events.length === 0) return { registrations: 0, checkedIn: 0 };

  const { data: registrations, error: registrationsError } = await supabase
    .from("form_responses")
    .select("checked_in_count")
    .eq("owner_type", "event")
    .in(
      "owner_id",
      events.map((e) => e.id),
    );
  if (registrationsError) throw registrationsError;

  const rows = registrations ?? [];
  const checkedIn = rows.reduce((sum, row) => sum + ((row.checked_in_count as number) ?? 0), 0);
  return { registrations: rows.length, checkedIn };
}
