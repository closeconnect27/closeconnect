import type { SupabaseClient } from "@supabase/supabase-js";

// Query layer only -- no dashboard page wired to this yet, deliberately.
// Zero historical page_views data exists until tracking has actually been
// live for a while, so a dashboard built today would just show empty
// charts; these are ready to plug into one once there's something real to
// show (SPEC.md Section 5's own explicit sequencing).

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
