export type ReferrerSource = "direct" | "search" | "social" | "instagram" | "linkedin" | "other";

// Simple domain-string matching -- no dependency, no IP/geo lookups,
// matching page_views' existing privacy posture. Order matters: check the
// more specific platforms (instagram/linkedin get their own bucket, not
// lumped into "social") before the generic social-network list.
const SEARCH_DOMAINS = ["google.", "bing.", "duckduckgo.", "yahoo.", "baidu."];
const SOCIAL_DOMAINS = ["facebook.", "twitter.", "x.com", "t.co", "reddit.", "whatsapp.", "wa.me", "telegram.", "t.me"];

export function classifyReferrer(referrer: string): ReferrerSource {
  if (!referrer) return "direct";
  let hostname: string;
  try {
    hostname = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "other";
  }

  if (hostname.includes("instagram.")) return "instagram";
  if (hostname.includes("linkedin.")) return "linkedin";
  if (SEARCH_DOMAINS.some((d) => hostname.includes(d))) return "search";
  if (SOCIAL_DOMAINS.some((d) => hostname.includes(d))) return "social";
  return "other";
}
