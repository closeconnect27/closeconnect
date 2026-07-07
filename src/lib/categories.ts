// SPEC.md Section 3's visible category taxonomy (communities.html's cat-tabs),
// plus per-category visual metadata for card banners/tags -- ported from the
// spirit of reference/reference_current_index.html's CAT_VISUALS lookup
// (slug-keyed, with a fallback), but adapted to the 8 categories that are
// actually in the design mockup rather than the old app's 20-category
// legacy taxonomy (which was backed by a `categories` DB table SPEC.md's
// schema doesn't have -- categories here are a fixed code-level list, not a
// table). Category values only ever come from this list -- never pass raw
// user text into the .or() filter strings in lib/queries/communities.ts,
// since PostgREST's filter syntax treats commas/parens specially.
export const CATEGORIES = [
  { slug: "sports", label: "Sports & outdoors", emoji: "🏃", bg: "#0d2218", light: "#6ee7b7" },
  { slug: "tech", label: "Tech & builders", emoji: "💻", bg: "#0d0d2e", light: "#818cf8" },
  { slug: "arts", label: "Arts & culture", emoji: "🎭", bg: "#2a0e0e", light: "#fca5a5" },
  { slug: "food", label: "Food & drinks", emoji: "🍜", bg: "#2a1a0a", light: "#fdba74" },
  { slug: "wellness", label: "Wellness", emoji: "🧘", bg: "#0d1a0d", light: "#86efac" },
  { slug: "music", label: "Music", emoji: "🎵", bg: "#1a0d2e", light: "#c4b5fd" },
  { slug: "social", label: "Social", emoji: "🎉", bg: "#2a0a1a", light: "#f9a8d4" },
  { slug: "gaming", label: "Gaming", emoji: "🎮", bg: "#0d1a2e", light: "#93c5fd" },
] as const;

export const DEFAULT_CATEGORY_VISUAL = { bg: "#1a1a1a", light: "#d1d5db" };

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export function isCategorySlug(value: string): value is CategorySlug {
  return CATEGORIES.some((c) => c.slug === value);
}

export function getCategory(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function getCategoryVisual(slug: string) {
  return (
    getCategory(slug) ?? {
      ...DEFAULT_CATEGORY_VISUAL,
      slug,
      label: slug.charAt(0).toUpperCase() + slug.slice(1),
      emoji: "🏷️",
    }
  );
}
