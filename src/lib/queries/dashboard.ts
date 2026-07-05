import type { SupabaseClient } from "@supabase/supabase-js";
import type { Community } from "@/lib/queries/communities";

export type MyCommunity = Community & { role: "owner" | "moderator" };

/** Communities the user owns or moderates (SPEC.md Section 9's host
 * dashboard) -- both kinds, unlike getHostableCommunities in
 * lib/queries/events.ts which intentionally narrows to native-only because
 * it's answering a different question ("what can I attach an event to").
 * Here we want everything the host is responsible for managing. */
export async function getMyCommunities(supabase: SupabaseClient, userId: string) {
  const { data: memberships, error: mErr } = await supabase
    .from("community_members")
    .select("community_id, role")
    .eq("user_id", userId)
    .in("role", ["owner", "moderator"]);
  if (mErr) throw mErr;
  if (!memberships || memberships.length === 0) return [];

  const roleByCommunity = new Map(memberships.map((m) => [m.community_id as string, m.role as "owner" | "moderator"]));
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .in("id", [...roleByCommunity.keys()])
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data as Community[]).map((c) => ({ ...c, role: roleByCommunity.get(c.id)! })) as MyCommunity[];
}

export type MyEvent = {
  id: string;
  event_name: string;
  event_date: string;
  event_time: string | null;
  venue: string | null;
  city: string | null;
  category: string | null;
  status: "active" | "cancelled";
  community: { id: string; name: string } | null;
  registeredCount: number;
  checkedInCount: number;
};

export async function getMyEvents(supabase: SupabaseClient, userId: string) {
  const { data: events, error } = await supabase
    .from("events")
    .select("id, event_name, event_date, event_time, venue, city, category, status, community:communities(id,name)")
    .eq("host_id", userId)
    .order("event_date", { ascending: false });
  if (error) throw error;
  if (!events || events.length === 0) return [];

  const eventIds = events.map((e) => e.id as string);
  const { data: responses, error: rErr } = await supabase
    .from("form_responses")
    .select("owner_id, checked_in_at")
    .eq("owner_type", "event")
    .in("owner_id", eventIds);
  if (rErr) throw rErr;

  const registered = new Map<string, number>();
  const checkedIn = new Map<string, number>();
  for (const r of responses ?? []) {
    const id = r.owner_id as string;
    registered.set(id, (registered.get(id) ?? 0) + 1);
    if (r.checked_in_at) checkedIn.set(id, (checkedIn.get(id) ?? 0) + 1);
  }

  return (events as unknown as Omit<MyEvent, "registeredCount" | "checkedInCount">[]).map((e) => ({
    ...e,
    registeredCount: registered.get(e.id) ?? 0,
    checkedInCount: checkedIn.get(e.id) ?? 0,
  })) as MyEvent[];
}
