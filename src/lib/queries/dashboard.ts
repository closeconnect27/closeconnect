import type { SupabaseClient } from "@supabase/supabase-js";
import type { Community } from "@/lib/queries/communities";

export type MyCommunity = Community & { role: "owner" | "moderator" };

/** Communities the user owns or moderates (SPEC.md Section 9's host
 * dashboard) -- both kinds, unlike getHostableCommunities in
 * lib/queries/events.ts which intentionally narrows to native-only because
 * it's answering a different question ("what can I attach an event to").
 * Here we want everything the host is responsible for managing.
 *
 * communities.owner_id, not community_members.role, is the authoritative
 * signal for ownership -- role is a separate, mutable row that can drift
 * from it (e.g. if a membership row is ever removed and rejoined through a
 * normal join flow, which always defaults to role='member'). Querying
 * community_members alone would silently drop an owner's own community from
 * their dashboard the moment that happened, rather than just mislabeling it.
 * Moderator status has no other source of truth, so that part still comes
 * from community_members. */
export async function getMyCommunities(supabase: SupabaseClient, userId: string) {
  const { data: owned, error: ownedErr } = await supabase
    .from("communities")
    .select("*")
    .eq("owner_id", userId);
  if (ownedErr) throw ownedErr;

  const { data: modMemberships, error: modErr } = await supabase
    .from("community_members")
    .select("community_id")
    .eq("user_id", userId)
    .eq("role", "moderator");
  if (modErr) throw modErr;

  const ownedIds = new Set((owned ?? []).map((c) => c.id));
  const moderatedIds = [...new Set((modMemberships ?? []).map((m) => m.community_id as string))].filter(
    (id) => !ownedIds.has(id),
  );

  let moderated: Community[] = [];
  if (moderatedIds.length > 0) {
    const { data, error } = await supabase.from("communities").select("*").in("id", moderatedIds);
    if (error) throw error;
    moderated = data as Community[];
  }

  const result: MyCommunity[] = [
    ...(owned as Community[]).map((c) => ({ ...c, role: "owner" as const })),
    ...moderated.map((c) => ({ ...c, role: "moderator" as const })),
  ];
  return result.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export type MyEvent = {
  id: string;
  event_name: string;
  event_date: string | null;
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
