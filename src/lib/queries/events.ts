import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormField } from "@/lib/queries/membership";

export type EventTicketType = {
  id: string;
  event_id: string;
  name: string;
  price: number;
  payment_link: string | null;
  quantity_available: number | null;
  sort_order: number;
};

export type EventImage = {
  id: string;
  event_id: string;
  image_url: string;
  sort_order: number;
};

export type EventListItem = {
  id: string;
  host_id: string;
  community_id: string | null;
  event_name: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  venue: string | null;
  city: string | null;
  category: string | null;
  cover_image_url: string | null;
  status: "active" | "cancelled";
  created_at: string;
  host: { display_name: string } | null;
  community: { id: string; name: string } | null;
  event_ticket_types: { price: number }[];
};

export type EventDetail = Omit<EventListItem, "host" | "community"> & {
  host: { id: string; display_name: string; avatar_url: string | null; host_rating: number } | null;
  community: { id: string; name: string } | null;
};

export type EventRegistration = {
  id: string;
  respondent_id: string | null;
  response_data: Record<string, string>;
  status: "pending" | "approved" | "rejected";
  checked_in_at: string | null;
  created_at: string;
  ticket_type_id: string | null;
  event_ticket_types: { name: string } | null;
  profiles: { display_name: string } | null;
};

export type EventFilters = {
  category?: string;
  city?: string;
  communityId?: string;
  hostId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  /** Host-facing views (e.g. "my events") need past events too -- the public
   * browse grid never should, so this defaults to hiding anything before
   * today rather than requiring every call site to remember to filter. */
  includePast?: boolean;
};

const EVENT_LIST_SELECT =
  "*, host:profiles(display_name), community:communities(id,name), event_ticket_types(price)";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getEvents(supabase: SupabaseClient, filters: EventFilters = {}) {
  let query = supabase.from("events").select(EVENT_LIST_SELECT).eq("status", "active");

  if (filters.category) query = query.eq("category", filters.category);
  if (filters.city) query = query.eq("city", filters.city);
  if (filters.communityId) query = query.eq("community_id", filters.communityId);
  if (filters.hostId) query = query.eq("host_id", filters.hostId);
  if (filters.dateFrom) query = query.gte("event_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("event_date", filters.dateTo);
  if (filters.search) query = query.ilike("event_name", `%${filters.search}%`);
  if (!filters.dateFrom && !filters.includePast) query = query.gte("event_date", todayIso());

  query = query.order("event_date", { ascending: true }).order("event_time", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as EventListItem[];
}

export async function getEventById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("events")
    .select("*, host:profiles(id,display_name,avatar_url,host_rating), community:communities(id,name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as EventDetail;
}

export async function getEventTicketTypes(supabase: SupabaseClient, eventId: string) {
  const { data, error } = await supabase
    .from("event_ticket_types")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order");
  if (error) throw error;
  return data as EventTicketType[];
}

export async function getEventImages(supabase: SupabaseClient, eventId: string) {
  const { data, error } = await supabase
    .from("event_images")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order");
  if (error) throw error;
  return data as EventImage[];
}

export async function getEventFormFields(supabase: SupabaseClient, eventId: string) {
  const { data, error } = await supabase
    .from("form_fields")
    .select("*")
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .order("sort_order");
  if (error) throw error;
  return data as FormField[];
}

/** Native communities the user can attach an event to -- owner or moderator
 * only, matching the reference's loadHostableCommunities gate. External
 * (link-out) communities are excluded: events are a native-platform feature,
 * an external community has no real presence here for an event to belong to.
 *
 * communities.owner_id is authoritative for ownership, not
 * community_members.role (a separate, mutable row that can drift from it) --
 * see the matching note on getMyCommunities in lib/queries/dashboard.ts.
 * Querying community_members alone here would silently block an owner from
 * attaching an event to their own community if that row was ever wrong. */
export async function getHostableCommunities(supabase: SupabaseClient, userId: string) {
  const { data: modMemberships, error: mErr } = await supabase
    .from("community_members")
    .select("community_id")
    .eq("user_id", userId)
    .eq("role", "moderator");
  if (mErr) throw mErr;

  const modIds = (modMemberships ?? []).map((m) => m.community_id as string);

  const { data, error } = await supabase
    .from("communities")
    .select("id, name, owner_id")
    .or(`owner_id.eq.${userId}${modIds.length ? `,id.in.(${modIds.join(",")})` : ""}`)
    .eq("kind", "native")
    .eq("status", "active");
  if (error) throw error;
  return data as { id: string; name: string }[];
}

export async function getEventRegistrations(supabase: SupabaseClient, eventId: string) {
  const { data, error } = await supabase
    .from("form_responses")
    .select(
      "id, respondent_id, response_data, status, checked_in_at, created_at, ticket_type_id, event_ticket_types(name), profiles(display_name)",
    )
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as EventRegistration[];
}

/** Public per-ticket-type registration counts via a security-definer RPC --
 * form_responses rows themselves are PII and stay owner/respondent-only. */
export async function getTicketAvailability(supabase: SupabaseClient, eventId: string) {
  const counts = new Map<string, number>();

  // One retry on a genuine network-level failure (fetch throwing/rejecting,
  // e.g. a transient connection reset to Supabase) before soft-failing --
  // seen in practice self-resolving on a manual page refresh, which is
  // exactly what a retry automates instead of surfacing to the user. This is
  // distinct from an actual Postgres/PostgREST error (bad function, RLS,
  // etc.), which retrying wouldn't fix and which still soft-fails below.
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.rpc("get_ticket_registration_counts", { p_event_id: eventId });
    if (!error) {
      for (const row of data ?? []) {
        counts.set(row.ticket_type_id as string, Number(row.registered_count));
      }
      return counts;
    }
    lastError = error.message;
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // Soft-fail rather than 500ing the whole public event page: this is
  // supplementary "X left" display, not core functionality.
  console.error("get_ticket_registration_counts failed after retry:", lastError);
  return counts;
}

export async function getEventRegistrationById(supabase: SupabaseClient, eventId: string, responseId: string) {
  const { data, error } = await supabase
    .from("form_responses")
    .select("id, response_data, checked_in_at, created_at")
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .eq("id", responseId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; response_data: Record<string, string>; checked_in_at: string | null; created_at: string } | null;
}
