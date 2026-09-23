import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormField } from "@/lib/queries/membership";
import { type City, isCity } from "@/lib/cities";

export type EventTicketType = {
  id: string;
  event_id: string;
  name: string;
  price: number;
  quantity_available: number | null;
  sort_order: number;
};

/** One row of a multi-day event's date list (0111) -- empty for a
 * single-day event, which uses the flat event_date/event_time columns
 * directly instead. Each entry can have its own venue (e.g. a multi-city
 * tour), unlike the top-level `venue` field which describes one place. */
export type EventDateEntry = {
  id: string;
  event_id: string;
  event_date: string;
  event_time: string | null;
  event_end_time: string | null;
  venue: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  venue_place_id: string | null;
  sort_order: number;
};

export type EventListItem = {
  id: string;
  host_id: string;
  community_id: string | null;
  event_name: string;
  description: string | null;
  /** Tiptap ProseMirror JSON -- null for rows created before the rich
   * editor existed. EventDescription (RichTextView) falls back to
   * rendering the plain `description` above when this is null. */
  description_content: object | null;
  // null means the event is a draft -- currently only reachable right after
  // duplicateEvent(), before the host has set a real date. Public listing
  // queries exclude these; the detail page 404s them for non-hosts.
  event_date: string | null;
  /** Optional end date for a multi-day event (0072) -- null, or equal to
   * event_date, means single-day. */
  event_end_date: string | null;
  event_time: string | null;
  /** Optional -- set alongside event_time via NewEventForm/EditEventForm's
   * start/end/duration trio (EventTimeFields), never on its own (0071). */
  event_end_time: string | null;
  event_mode: "online" | "offline";
  venue: string | null;
  /** Set together, only when the host picked a real Places Autocomplete
   * suggestion (VenueAutocomplete) -- null for a hand-typed venue, an
   * online event, or any event created before this column existed. */
  venue_lat: number | null;
  venue_lng: number | null;
  city: string | null;
  extra_cities: string[] | null;
  all_cities: boolean;
  category: string | null;
  extra_categories: string[] | null;
  status: "active" | "cancelled";
  // Assigned once at creation (or by backfill), not recomputed per render
  // -- see src/lib/unsplash.ts. Null only for rows predating this system.
  unsplash_image_url: string | null;
  avg_feedback_rating: number;
  feedback_count: number;
  created_at: string;
  host: { display_name: string } | null;
  community: { id: string; slug: string; name: string } | null;
  event_ticket_types: { price: number }[];
};

export type EventDetail = Omit<EventListItem, "host" | "community"> & {
  host: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    host_rating: number;
    host_rating_count: number;
    is_founding_host: boolean;
  } | null;
  community: { id: string; slug: string; name: string } | null;
};

export type EventRegistration = {
  id: string;
  respondent_id: string | null;
  response_data: Record<string, string>;
  status: "pending" | "approved" | "rejected" | "cancelled";
  checked_in_at: string | null;
  cancelled_at: string | null;
  cancelled_by: "attendee" | "organizer" | null;
  refund_status: "none" | "pending" | "processing" | "processed" | "failed";
  refund_amount_paise: number | null;
  cancellation_charge_paise: number | null;
  /** How many of `quantity` people have actually arrived -- 0.._quantity_,
   * not a binary flag (0055). checked_in_at above still just means
   * "checked in at all". */
  checked_in_count: number;
  quantity: number;
  payment_status: "unpaid" | "pending_verification" | "paid" | "failed";
  /** What the registrant typed back as their UPI reference/UTR number
   * (0066) -- purely informational, never verified programmatically. Only
   * meaningful once payment_status has moved past 'unpaid'. */
  payment_reference: string | null;
  created_at: string;
  ticket_type_id: string | null;
  event_ticket_types: { name: string } | null;
  profiles: { display_name: string } | null;
  form_response_addons: { name_snapshot: string; unit_price_paise: number; quantity: number }[];
};

export type EventFilters = {
  category?: string;
  /** Multiple cities match as OR -- an event matching any one of them (as
   * its primary city or in extra_cities) is included. */
  cities?: string[];
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

// host:profiles(...) must pin the FK explicitly (!events_host_id_fkey) --
// event_interests and event_feedback each add their own many-to-many bridge
// between events and profiles (via user_id), so PostgREST can no longer
// infer which relationship "host:profiles(...)" means and 404s the query
// entirely (PGRST201, ambiguous embed) without this hint.
const EVENT_LIST_SELECT =
  "*, host:profiles!events_host_id_fkey(display_name), community:communities(id,slug,name), event_ticket_types(price)";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getEvents(supabase: SupabaseClient, filters: EventFilters = {}) {
  // Draft events (null event_date, only reachable via duplicateEvent before
  // the host sets a real date) never belong in a public listing -- excluded
  // unconditionally rather than relying on the date filters below, which
  // only apply in some call shapes (e.g. includePast: true with no explicit
  // dateFrom skips them entirely).
  let query = supabase.from("events").select(EVENT_LIST_SELECT).eq("status", "active").not("event_date", "is", null);

  if (filters.category) query = query.or(`category.eq.${filters.category},extra_categories.cs.{${filters.category}}`);
  const validCities = filters.cities?.filter(isCity) ?? [];
  if (validCities.length > 0) {
    query = query.or(["all_cities.eq.true", ...validCities.map((c) => `city.eq.${c},extra_cities.cs.{${c}}`)].join(","));
  }
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

/**
 * The one place multi-city matching lives for events, mirroring
 * getCommunitiesByCity: an event matches a city if it's the primary `city`
 * OR listed in `extra_cities`. Reused wherever a city filter appears.
 */
export async function getEventsByCity(supabase: SupabaseClient, city: City, opts: { limit?: number } = {}) {
  let query = supabase
    .from("events")
    .select(EVENT_LIST_SELECT)
    .eq("status", "active")
    .not("event_date", "is", null)
    .gte("event_date", todayIso())
    .or(`all_cities.eq.true,city.eq.${city},extra_cities.cs.{${city}}`)
    .order("event_date", { ascending: true });

  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as EventListItem[];
}

/** Every event the signed-in user has an approved registration for
 * (status='approved' -- form_responses also holds rejected/pending
 * community-membership-form rows under the same table, owner_type='event'
 * scopes to just this), most recently registered first. Used by "My
 * events" (the registered half -- hosted events reuse getEvents({hostId})
 * instead). Upcoming only (event_date >= today) -- "My events" is meant to
 * read as "what's coming up," not a lifetime history; a past registration
 * a customer attended months ago cluttering this list was the actual
 * complaint that led here. */
export async function getMyRegisteredEvents(supabase: SupabaseClient, userId: string): Promise<EventListItem[]> {
  const { data: registrations } = await supabase
    .from("form_responses")
    .select("owner_id, created_at")
    .eq("owner_type", "event")
    .eq("respondent_id", userId)
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  const eventIds = [...new Set((registrations ?? []).map((r) => r.owner_id as string))];
  if (eventIds.length === 0) return [];

  const { data, error } = await supabase.from("events").select(EVENT_LIST_SELECT).in("id", eventIds).gte("event_date", todayIso());
  if (error) throw error;
  const byId = new Map(((data ?? []) as unknown as EventListItem[]).map((e) => [e.id, e]));
  // Registration recency order, not the event query's own -- a returned
  // row can be missing (event deleted) so this filters through byId rather
  // than assuming every id resolved.
  return eventIds.map((id) => byId.get(id)).filter((e): e is EventListItem => !!e);
}

export async function getEventById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("events")
    .select(
      "*, host:profiles!events_host_id_fkey(id,display_name,avatar_url,host_rating,host_rating_count,is_founding_host), community:communities(id,slug,name)",
    )
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

export type EventAddon = {
  id: string;
  event_id: string;
  name: string;
  price: number;
  quantity_available: number | null;
  is_active: boolean;
  sort_order: number;
};

/** Active add-ons only -- for checkout/registration-time reads. The
 * organizer's own editor (AddonBuilder) reads the full set including
 * inactive/retired ones through its own direct query instead, same split
 * getFaqsForEvent/getFaqsForEventEditor already establish. */
export async function getEventAddons(supabase: SupabaseClient, eventId: string): Promise<EventAddon[]> {
  const { data, error } = await supabase.from("event_addons").select("*").eq("event_id", eventId).eq("is_active", true).order("sort_order");
  if (error) throw error;
  return data as EventAddon[];
}

export async function getEventDateEntries(supabase: SupabaseClient, eventId: string) {
  const { data, error } = await supabase
    .from("event_date_entries")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order");
  if (error) throw error;
  return data as EventDateEntry[];
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
      "id, respondent_id, response_data, status, checked_in_at, cancelled_at, cancelled_by, refund_status, refund_amount_paise, cancellation_charge_paise, checked_in_count, quantity, payment_status, payment_reference, created_at, ticket_type_id, event_ticket_types(name), profiles(display_name), form_response_addons(name_snapshot, unit_price_paise, quantity)",
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

/** Whether the signed-in user has an approved registration for this event
 * with checked_in_at set -- the gate for leaving event feedback. Re-registering
 * is allowed (0059), so a user can have more than one row here -- checked in
 * on any one of them counts. */
export async function getMyEventCheckIn(supabase: SupabaseClient, eventId: string, userId: string) {
  const { data } = await supabase
    .from("form_responses")
    .select("checked_in_at")
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .eq("respondent_id", userId);
  return (data ?? []).some((r) => r.checked_in_at);
}

/** How many times the signed-in user has already registered for this event
 * (0059 dropped the one-per-account DB constraint) -- used to prompt "you've
 * already registered, register again?" before a repeat submission. */
export async function getMyRegistrationCount(supabase: SupabaseClient, eventId: string, userId: string) {
  const { count } = await supabase
    .from("form_responses")
    .select("id", { count: "exact", head: true })
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .eq("respondent_id", userId);
  return count ?? 0;
}

export type MyEventRegistration = {
  id: string;
  payment_status: "unpaid" | "pending_verification" | "paid" | "failed";
  ticket_type_id: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  amount_paid_paise: number | null;
  refund_status: "none" | "pending" | "processing" | "processed" | "failed";
  refund_amount_paise: number | null;
  cancellation_charge_paise: number | null;
};

/** The signed-in user's most recent registration for this event, if any --
 * lets EventRegistration reconstruct its post-registration/post-payment
 * view on reload instead of always starting from the blank form. Those
 * views were previously driven entirely by client-only state (done/
 * razorpayPaid), so paying and then revisiting or refreshing the page lost
 * the confirmation and showed the registration form again -- worse, trying
 * to register again from there could open a second Razorpay payment for an
 * already-paid ticket. */
export async function getMyLatestRegistration(supabase: SupabaseClient, eventId: string, userId: string): Promise<MyEventRegistration | null> {
  const { data } = await supabase
    .from("form_responses")
    .select("id, payment_status, ticket_type_id, status, amount_paid_paise, refund_status, refund_amount_paise, cancellation_charge_paise")
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .eq("respondent_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as MyEventRegistration | null;
}

/** Returns null for anyone RLS doesn't consider authorized (not the host,
 * no confirmed/paid registration for this event) -- event_meeting_links'
 * own RLS (0069) is the real gate here, not this function; this just
 * turns "no row visible" into a plain null instead of every caller having
 * to think about PostgREST's zero-rows-vs-error distinction. Never call
 * this to *decide* whether to show a "register to see the link" prompt --
 * a null here can mean either "not authorized" or "host hasn't set one
 * yet," which look identical from here (by design: revealing which one
 * it is would leak whether a link exists to someone not entitled to it). */
export async function getEventMeetingLink(supabase: SupabaseClient, eventId: string) {
  const { data } = await supabase.from("event_meeting_links").select("meeting_link").eq("event_id", eventId).maybeSingle();
  return data?.meeting_link as string | null | undefined;
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
