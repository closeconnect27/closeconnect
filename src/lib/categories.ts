import type { ComponentType } from "react";
import {
  IconRun,
  IconCode,
  IconPalette,
  IconToolsKitchen2,
  IconYoga,
  IconMusic,
  IconConfetti,
  IconDeviceGamepad2,
  IconPlane,
  IconCamera,
  IconBook2,
  IconPaw,
  IconBabyCarriage,
  IconSchool,
  IconCoin,
  IconBuildingSkyscraper,
  IconBriefcase,
  IconRainbow,
  IconSparkles,
  IconShoppingBag,
  IconTag,
} from "@tabler/icons-react";

type CategoryIcon = ComponentType<{ size?: number; className?: string }>;

// Full taxonomy, restored to match the old live site's actual category set
// (previously trimmed to 8 for the initial design mockup -- see git history
// on this file). The old site's own categories table isn't something this
// schema has an equivalent for (categories are a fixed code-level list
// here, not a table -- see lib/queries/communities.ts's warning about
// PostgREST filter syntax), so this list is sourced from two things the old
// site itself shipped and used to render/filter with, not invented fresh:
// reference/reference_current_index.html's CAT_VISUALS lookup (the 21
// slugs, each with a background+light color pair -- ours here are the
// first gradient stop as a flat bg, the light value unchanged) is the
// slug/color source; icon and emoji per category are new, chosen to match
// the existing 8's style since the old site's own emoji lived only in its
// `categories` DB table, not in this static reference file.
export const CATEGORIES = [
  { slug: "sports", label: "Sports & outdoors", emoji: "🏃", icon: IconRun, bg: "#0d2218", light: "#6ee7b7" },
  { slug: "tech", label: "Tech & builders", emoji: "💻", icon: IconCode, bg: "#0d0d2e", light: "#818cf8" },
  { slug: "arts", label: "Arts & culture", emoji: "🎭", icon: IconPalette, bg: "#2a0e0e", light: "#fca5a5" },
  { slug: "food", label: "Food & drinks", emoji: "🍜", icon: IconToolsKitchen2, bg: "#2a1a0a", light: "#fdba74" },
  { slug: "wellness", label: "Wellness", emoji: "🧘", icon: IconYoga, bg: "#0d1a0d", light: "#86efac" },
  { slug: "music", label: "Music", emoji: "🎵", icon: IconMusic, bg: "#1a0d2e", light: "#c4b5fd" },
  { slug: "social", label: "Social", emoji: "🎉", icon: IconConfetti, bg: "#2a0a1a", light: "#f9a8d4" },
  { slug: "gaming", label: "Gaming", emoji: "🎮", icon: IconDeviceGamepad2, bg: "#0d1a2e", light: "#93c5fd" },
  { slug: "travel", label: "Travel & outdoors", emoji: "✈️", icon: IconPlane, bg: "#0c2a4a", light: "#93c5fd" },
  { slug: "photography", label: "Photography", emoji: "📷", icon: IconCamera, bg: "#111827", light: "#e5e7eb" },
  { slug: "books", label: "Books & reading", emoji: "📚", icon: IconBook2, bg: "#1c1a0a", light: "#fde68a" },
  { slug: "pets", label: "Pets & animals", emoji: "🐾", icon: IconPaw, bg: "#0f2a1e", light: "#bbf7d0" },
  { slug: "parenting", label: "Parenting", emoji: "👶", icon: IconBabyCarriage, bg: "#3b0764", light: "#ddd6fe" },
  { slug: "education", label: "Education", emoji: "🎓", icon: IconSchool, bg: "#0a2342", light: "#bfdbfe" },
  { slug: "finance", label: "Finance", emoji: "💰", icon: IconCoin, bg: "#064e3b", light: "#6ee7b7" },
  { slug: "business", label: "Business", emoji: "💼", icon: IconBuildingSkyscraper, bg: "#172554", light: "#93c5fd" },
  { slug: "lgbtq", label: "LGBTQ+", emoji: "🏳️‍🌈", icon: IconRainbow, bg: "#7f1d1d", light: "#fbcfe8" },
  { slug: "jobs", label: "Jobs & careers", emoji: "🧑‍💼", icon: IconBriefcase, bg: "#0f172a", light: "#a5b4fc" },
  { slug: "beauty", label: "Beauty", emoji: "💄", icon: IconSparkles, bg: "#4a0a2e", light: "#f9a8d4" },
  { slug: "shopping", label: "Shopping", emoji: "🛍️", icon: IconShoppingBag, bg: "#1a0a3e", light: "#ddd6fe" },
  { slug: "other", label: "Other", emoji: "🏷️", icon: IconTag, bg: "#1f2937", light: "#d1d5db" },
] as const satisfies readonly { slug: string; label: string; emoji: string; icon: CategoryIcon; bg: string; light: string }[];

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
      icon: IconTag,
    }
  );
}
