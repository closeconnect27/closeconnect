import type { SupabaseClient } from "@supabase/supabase-js";
import { type CategorySlug, isCategorySlug } from "@/lib/categories";
import { type City, isCity } from "@/lib/cities";

// No generated Database types are wired into the Supabase client yet, so
// `.select("*")` resolves to `any` -- this is the one shared shape every
// community page/component types against instead of each re-declaring it.
export type Community = {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** Tiptap ProseMirror JSON -- null for rows created before the rich
   * editor existed, or a plain textarea submission (e.g. the external
   * community listing form). RichTextView falls back to rendering the
   * plain `description` above when this is null. */
  description_content: object | null;
  category: string;
  extra_categories: string[] | null;
  city: string | null;
  extra_cities: string[] | null;
  all_cities: boolean;
  kind: "native" | "external";
  // Legacy only (0083) -- every community is created as 'native' now and
  // its WhatsApp/Instagram link lives in whatsapp_url/instagram_url below
  // instead. Column stays for the handful of pre-0083 rows' history; new
  // rows never set it.
  external_link: string | null;
  join_mode: "open" | "request";
  // Optional, host-supplied social links.
  instagram_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  whatsapp_url: string | null;
  phone: string | null;
  // Nullable since 0024: an external community starts unowned (a public,
  // no-login submission) until a claim is approved.
  owner_id: string | null;
  claim_status: "unclaimed" | "pending" | "approved" | "rejected";
  avg_rating: number;
  rating_count: number;
  member_count: number;
  status: "active" | "hidden" | "reported";
  created_at: string;
  is_verified: boolean;
  // Assigned once at creation (or by backfill), not recomputed per render
  // -- see src/lib/unsplash.ts. Null only for rows that predate this
  // system and haven't been backfilled yet; CategoryImage is the fallback.
  unsplash_image_url: string | null;
  // Owner-controlled: when false, ordinary members can't see the full
  // member list -- the owner/moderators always show regardless (enforced
  // in MemberList, not RLS -- see 0052).
  members_list_visible: boolean;
  // Separate from members_list_visible above -- this hides just the
  // headline number (CommunityCard, the detail page header), not the
  // roster itself. A community can hide the count while keeping the list
  // visible, or vice versa.
  member_count_visible: boolean;
  is_founding: boolean;
  // null = unlimited (0057). Once member_count reaches this, no new join
  // can succeed through any path -- enforced at the DB level, not just by
  // hiding the Join button.
  member_limit: number | null;
  /** Null when unclaimed (external community with no owner yet). */
  owner: { id: string; display_name: string } | null;
};

/** The one place a community's canonical URL path segment gets decided --
 * every Link/redirect in the app should build hrefs through this, not
 * `.id` directly, so a row missing `slug` (a stale in-flight type from
 * before this existed) still degrades to the old, still-fully-supported
 * uuid form instead of producing `/communities/undefined`. */
export function communitySlugOrId(community: { id: string; slug?: string | null }): string {
  return community.slug || community.id;
}

export type CommunityFilters = {
  category?: string;
  /** Multiple cities match as OR -- a community matching any one of them
   * (as its primary city or in extra_cities) is included. */
  cities?: string[];
  kind?: "native" | "external";
  search?: string;
};

/**
 * The one place multi-category matching lives (SPEC.md Section 6): a
 * community matches a category if it's the primary `category` OR listed in
 * `extra_categories`. Reused by the browse grid, category sections, and
 * category counts below -- don't reimplement this per call site.
 */
export async function getCommunitiesByCategory(
  supabase: SupabaseClient,
  category: CategorySlug,
  opts: { limit?: number } = {},
) {
  let query = supabase
    .from("communities")
    .select("*")
    .eq("status", "active")
    .or(`category.eq.${category},extra_categories.cs.{${category}}`)
    .order("member_count", { ascending: false });

  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data as Community[];
}

export async function getCommunities(supabase: SupabaseClient, filters: CommunityFilters = {}) {
  let query = supabase.from("communities").select("*").eq("status", "active");

  if (filters.category && isCategorySlug(filters.category)) {
    query = query.or(`category.eq.${filters.category},extra_categories.cs.{${filters.category}}`);
  }
  const validCities = filters.cities?.filter(isCity) ?? [];
  if (validCities.length > 0) {
    query = query.or(["all_cities.eq.true", ...validCities.map((c) => `city.eq.${c},extra_cities.cs.{${c}}`)].join(","));
  }
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.search) query = query.ilike("name", `%${filters.search}%`);

  query = query.order("member_count", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data as Community[];
}

/**
 * The one place multi-city matching lives for communities, mirroring
 * getCommunitiesByCategory above: a community matches a city if it's the
 * primary `city` OR listed in `extra_cities`. Reused wherever a city filter
 * appears (search, browse, sidebar) -- don't reimplement this per call site.
 */
export async function getCommunitiesByCity(supabase: SupabaseClient, city: City, opts: { limit?: number } = {}) {
  let query = supabase
    .from("communities")
    .select("*")
    .eq("status", "active")
    .or(`all_cities.eq.true,city.eq.${city},extra_cities.cs.{${city}}`)
    .order("member_count", { ascending: false });

  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data as Community[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Which column a /communities/[id] route param resolves against -- shared
 * so every lookup (generateMetadata's own narrower query included) agrees
 * on the exact same rule getCommunityById uses below. */
export function communityLookupColumn(idOrSlug: string): "id" | "slug" {
  return UUID_PATTERN.test(idOrSlug) ? "id" : "slug";
}

// owner:profiles(...) must pin the FK explicitly (!communities_owner_id_fkey)
// -- community_members also FKs to profiles, so an unqualified embed can't
// tell which relationship "owner:profiles(...)" means and 404s the query.
/** Accepts either the raw id (every link created before slugs existed, and
 * every notification/email link already sent) or the slug (every link
 * built going forward) -- one lookup path for both, so callers never need
 * to know or care which form they were handed. */
export async function getCommunityById(supabase: SupabaseClient, idOrSlug: string) {
  const column = communityLookupColumn(idOrSlug);
  const { data, error } = await supabase
    .from("communities")
    .select("*, owner:profiles!communities_owner_id_fkey(id,display_name)")
    .eq(column, idOrSlug)
    .single();
  if (error) throw error;
  return data as Community;
}

/** Per-category community counts, matching the same primary-or-extra rule above. */
export async function getCommunityCategoryCounts(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("communities")
    .select("category, extra_categories")
    .eq("status", "active");
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const cats = new Set([row.category, ...((row.extra_categories as string[]) ?? [])]);
    for (const c of cats) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return counts;
}
