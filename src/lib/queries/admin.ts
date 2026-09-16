import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReferrerSource } from "@/lib/referrerSource";

/** Admin dashboard's platform-wide numbers -- distinct from getPlatformStats
 * (stats.ts), which is the public homepage's smaller, always-public set.
 * Everything here is a real count, no fabricated numbers, gated to admins
 * by the page itself (RLS on most of these tables is broad/public-select
 * already, so the gate is at the route, not the query). */
export async function getAdminPlatformStats(supabase: SupabaseClient) {
  const [
    { count: totalUsers },
    { count: nativeCommunities },
    { count: externalCommunities },
    { count: totalEvents },
    { count: totalRegistrations },
    { count: pendingClaims },
    { count: openReports },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("communities").select("*", { count: "exact", head: true }).eq("kind", "native"),
    supabase.from("communities").select("*", { count: "exact", head: true }).eq("kind", "external"),
    supabase.from("events").select("*", { count: "exact", head: true }),
    supabase.from("form_responses").select("*", { count: "exact", head: true }).eq("owner_type", "event"),
    supabase.from("claims").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("reports").select("*", { count: "exact", head: true }).eq("status", "open"),
  ]);

  return {
    totalUsers: totalUsers ?? 0,
    nativeCommunities: nativeCommunities ?? 0,
    externalCommunities: externalCommunities ?? 0,
    totalEvents: totalEvents ?? 0,
    totalRegistrations: totalRegistrations ?? 0,
    pendingClaims: pendingClaims ?? 0,
    openReports: openReports ?? 0,
  };
}

/** New profiles per calendar month, platform-wide -- same shape as
 * getNewMembersByMonth (analytics.ts) but unscoped to one community. */
export async function getNewUsersByMonth(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("profiles").select("created_at");
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const month = (row.created_at as string).slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export type TopContentRow = { id: string; name: string; views: number };

/** "Which events/communities got the most interactions", platform-wide --
 * page_views has no real FK to events/communities (it's the same
 * polymorphic target_type/target_id shape as form_responses.owner_id, see
 * getPayoutSummary's own note on why that means two queries, not an
 * embedded join), so this groups views by target_id first, then fetches
 * names only for the ones that actually made the top N. Admin-only: reads
 * across every host's page_views rows, which page_views_select_owner_or_host
 * would otherwise scope to just the caller's own content -- call with a
 * service-role client from an already-is_admin-gated page, same posture as
 * every other admin query in this app. */
export async function getTopContent(supabase: SupabaseClient, targetType: "community" | "event", limit = 10): Promise<TopContentRow[]> {
  const { data, error } = await supabase.from("page_views").select("target_id").eq("target_type", targetType);
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const counts = new Map<string, number>();
  for (const row of data) {
    const id = row.target_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);

  const table = targetType === "community" ? "communities" : "events";
  const nameColumn = targetType === "community" ? "name" : "event_name";
  const { data: rows, error: namesError } = await supabase.from(table).select(`id, ${nameColumn}`).in("id", topIds);
  if (namesError) throw namesError;
  const nameById = new Map((rows ?? []).map((r) => [r.id as string, (r as Record<string, unknown>)[nameColumn] as string]));

  // Deleted/inaccessible content can still have old page_views rows --
  // skipped here rather than shown as "Untitled", since there's nothing
  // useful to link to or act on for a target that no longer exists.
  return topIds.filter((id) => nameById.has(id)).map((id) => ({ id, name: nameById.get(id)!, views: counts.get(id)! }));
}

/** Platform-wide version of getReferrerBreakdown (analytics.ts) -- same
 * bucket classification, unscoped to one target. */
export async function getPlatformReferrerBreakdown(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("page_views").select("referrer_source");
  if (error) throw error;

  const counts = new Map<ReferrerSource, number>();
  for (const row of data ?? []) {
    const source = (row.referrer_source as ReferrerSource) ?? "direct";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return [...counts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
}
