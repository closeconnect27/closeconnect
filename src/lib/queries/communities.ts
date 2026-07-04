import type { SupabaseClient } from "@supabase/supabase-js";
import { type CategorySlug, isCategorySlug } from "@/lib/categories";

// No generated Database types are wired into the Supabase client yet, so
// `.select("*")` resolves to `any` -- this is the one shared shape every
// community page/component types against instead of each re-declaring it.
export type Community = {
  id: string;
  name: string;
  description: string;
  category: string;
  extra_categories: string[] | null;
  city: string | null;
  community_type: "online" | "offline" | "both";
  kind: "native" | "external";
  external_link: string | null;
  join_mode: "open" | "request";
  cover_image_url: string | null;
  owner_id: string;
  claim_status: "unclaimed" | "pending" | "approved" | "rejected";
  avg_rating: number;
  rating_count: number;
  member_count: number;
  status: "active" | "hidden" | "reported";
  created_at: string;
};

export type CommunityFilters = {
  category?: string;
  city?: string;
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
  if (filters.city) query = query.eq("city", filters.city);
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.search) query = query.ilike("name", `%${filters.search}%`);

  query = query.order("member_count", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data as Community[];
}

export async function getCommunityById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("communities").select("*").eq("id", id).single();
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
