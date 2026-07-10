import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Auth-gated or privacy-sensitive -- editing/management surfaces,
      // the admin/host dashboards, and profile pages (which have their
      // own visibility setting that a public crawl would bypass).
      disallow: ["/admin", "/host/dashboard", "/profile/", "/login", "/api/"],
    },
    sitemap: "https://closeconnect.in/sitemap.xml",
  };
}
