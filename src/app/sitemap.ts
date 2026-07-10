import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

const SITE_URL = "https://closeconnect.in";

// Only real, public, unique-content pages -- no query-string variants
// (category/city filters are the same /communities page with different
// results, not distinct canonical URLs) and no profile/admin/host/login
// pages, which are either privacy-sensitive or auth-gated and shouldn't
// be indexed at all.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  const [{ data: communities }, { data: events }] = await Promise.all([
    supabase.from("communities").select("id, created_at").eq("status", "active"),
    supabase.from("events").select("id, created_at").eq("status", "active").not("event_date", "is", null),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/communities`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/events`, changeFrequency: "hourly", priority: 0.9 },
  ];

  const communityRoutes: MetadataRoute.Sitemap = (communities ?? []).map((c) => ({
    url: `${SITE_URL}/communities/${c.id}`,
    lastModified: c.created_at,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const eventRoutes: MetadataRoute.Sitemap = (events ?? []).map((e) => ({
    url: `${SITE_URL}/events/${e.id}`,
    lastModified: e.created_at,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  return [...staticRoutes, ...communityRoutes, ...eventRoutes];
}
