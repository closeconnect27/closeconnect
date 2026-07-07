import type { SupabaseClient } from "@supabase/supabase-js";
import type { Community } from "@/lib/queries/communities";

export type JoinedCommunity = Community & { role: "moderator" | "member" };

/** Communities this user has joined but does not own -- the "My Communities"
 * / joined half of the Profile page split (owned half is
 * lib/queries/dashboard.ts's getMyCommunities, reused as-is since
 * communities.owner_id is already the authoritative signal there). Excludes
 * anything owner_id says this user actually owns, even if a stale
 * community_members row also exists for it. */
export async function getMyJoinedCommunities(supabase: SupabaseClient, userId: string) {
  const { data: memberships, error: mErr } = await supabase
    .from("community_members")
    .select("community_id, role")
    .eq("user_id", userId);
  if (mErr) throw mErr;
  if (!memberships || memberships.length === 0) return [];

  const roleByCommunity = new Map(memberships.map((m) => [m.community_id as string, m.role as string]));
  const { data, error } = await supabase.from("communities").select("*").in("id", [...roleByCommunity.keys()]);
  if (error) throw error;

  return (data as Community[])
    .filter((c) => c.owner_id !== userId)
    .map((c) => ({ ...c, role: roleByCommunity.get(c.id) as "moderator" | "member" }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at)) as JoinedCommunity[];
}

export type MyRegisteredEvent = {
  responseId: string;
  checkedInAt: string | null;
  ticketTypeId: string | null;
  id: string;
  event_name: string;
  // A registrant can never actually reach a draft (null-dated) event to
  // register for it in the first place, but the underlying column is
  // nullable, so this stays honest about that rather than asserting non-null.
  event_date: string | null;
  event_time: string | null;
  venue: string | null;
  city: string | null;
  category: string | null;
  status: "active" | "cancelled";
};

/** Events this user has registered for. form_responses
 * is polymorphic (owner_id points to either communities or events depending
 * on owner_type, so it has no real foreign key PostgREST could embed
 * through) -- fetched in two steps and merged in JS rather than a single
 * embedded select. */
export async function getMyRegisteredEvents(supabase: SupabaseClient, userId: string) {
  const { data: responses, error: rErr } = await supabase
    .from("form_responses")
    .select("id, owner_id, checked_in_at, ticket_type_id, created_at")
    .eq("owner_type", "event")
    .eq("respondent_id", userId)
    .order("created_at", { ascending: false });
  if (rErr) throw rErr;
  if (!responses || responses.length === 0) return [];

  const eventIds = [...new Set(responses.map((r) => r.owner_id as string))];
  const { data: events, error: eErr } = await supabase
    .from("events")
    .select("id, event_name, event_date, event_time, venue, city, category, status")
    .in("id", eventIds);
  if (eErr) throw eErr;

  const eventById = new Map((events ?? []).map((e) => [e.id, e]));
  return responses
    .map((r) => {
      const event = eventById.get(r.owner_id as string);
      if (!event) return null;
      return {
        ...event,
        responseId: r.id as string,
        checkedInAt: r.checked_in_at as string | null,
        ticketTypeId: r.ticket_type_id as string | null,
      };
    })
    .filter((e): e is MyRegisteredEvent => e !== null);
}
