import type { SupabaseClient } from "@supabase/supabase-js";

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
    { count: pendingVerifications },
    { count: openReports },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("communities").select("*", { count: "exact", head: true }).eq("kind", "native"),
    supabase.from("communities").select("*", { count: "exact", head: true }).eq("kind", "external"),
    supabase.from("events").select("*", { count: "exact", head: true }),
    supabase.from("form_responses").select("*", { count: "exact", head: true }).eq("owner_type", "event"),
    supabase.from("claims").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("verification_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("reports").select("*", { count: "exact", head: true }).eq("status", "open"),
  ]);

  return {
    totalUsers: totalUsers ?? 0,
    nativeCommunities: nativeCommunities ?? 0,
    externalCommunities: externalCommunities ?? 0,
    totalEvents: totalEvents ?? 0,
    totalRegistrations: totalRegistrations ?? 0,
    pendingClaims: pendingClaims ?? 0,
    pendingVerifications: pendingVerifications ?? 0,
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
