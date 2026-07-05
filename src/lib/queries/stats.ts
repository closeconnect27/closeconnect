import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Real counts only -- no placeholder/fabricated numbers. If a metric would
 * be misleading at current scale (e.g. member_count is only meaningful for
 * native communities), it's computed honestly from what's actually there.
 */
export async function getPlatformStats(supabase: SupabaseClient) {
  const { count: communityCount } = await supabase
    .from("communities")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  const { data: memberRows } = await supabase
    .from("communities")
    .select("member_count")
    .eq("status", "active")
    .eq("kind", "native");

  const totalMembers = (memberRows ?? []).reduce((sum, r) => sum + (r.member_count ?? 0), 0);

  const { data: cityRows } = await supabase
    .from("communities")
    .select("city")
    .eq("status", "active")
    .not("city", "is", null);

  const cityCount = new Set((cityRows ?? []).map((r) => r.city)).size;

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const { count: upcomingEventCount } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("status", "active")
    .gte("event_date", todayIso);

  return {
    communityCount: communityCount ?? 0,
    totalMembers,
    cityCount,
    upcomingEventCount: upcomingEventCount ?? 0,
  };
}
