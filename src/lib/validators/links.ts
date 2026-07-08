// Ported from reference/reference_current_index.html (proven in production).
// Two separate checks on purpose: isValidExternalLink gates writes (owner
// submitting/editing a community), safeJoinHref sanitizes at render time so
// an old/malformed DB row can never produce a javascript: or arbitrary-host
// href -- defense in depth, not redundant.

export function isValidExternalLink(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    // WhatsApp community/group invite
    if (u.hostname === "chat.whatsapp.com" && /^\/[A-Za-z0-9_-]{10,}$/.test(u.pathname)) {
      return true;
    }
    // WhatsApp channel
    if (
      (u.hostname === "whatsapp.com" || u.hostname === "www.whatsapp.com") &&
      u.pathname.startsWith("/channel/") &&
      u.pathname.length > 10
    ) {
      return true;
    }
    // Instagram profile (root path alone is rejected)
    if (
      (u.hostname === "instagram.com" || u.hostname === "www.instagram.com") &&
      u.pathname.length > 1
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function safeJoinHref(url: string | null | undefined): string {
  if (!url) return "#";
  try {
    const u = new URL(url);
    if (
      u.protocol === "https:" &&
      (u.hostname === "chat.whatsapp.com" ||
        ((u.hostname === "whatsapp.com" || u.hostname === "www.whatsapp.com") &&
          u.pathname.startsWith("/channel/")) ||
        u.hostname === "instagram.com" ||
        u.hostname === "www.instagram.com")
    ) {
      return url;
    }
  } catch {
    // fall through to '#'
  }
  return "#";
}

export function isInstagramLink(url: string | null | undefined): boolean {
  return !!url && url.includes("instagram.com");
}

// Ticket payment links (SPEC.md Section 8): actual checkout/webhook handling
// is a later phase -- for now this is just an external redirect, same shape
// as the WhatsApp/Instagram link validators above. reference_current_events.html
// (the proven production pattern this ports) applies *no* validation at all
// beyond HTML-escaping the link before rendering it as an <a href> -- its own
// field hint says "Razorpay (or similar)", i.e. other providers are
// expected too, not just Razorpay's own domains. Matching that bar plus the
// https-only floor called for explicitly: well-formed https:// URL, any
// host. Still parsed through URL() rather than accepted as a raw string, so
// a javascript: URI or similar can't slip into a rendered href -- that part
// isn't optional the way the domain restriction was.
export function isValidPaymentLink(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function safePaymentHref(url: string | null | undefined): string {
  if (!url || !isValidPaymentLink(url)) return "#";
  return url;
}

// Member profile social links (Branch 1) -- same write-time validate /
// render-time sanitize pair as the links above, domain-restricted to each
// platform's real profile URLs rather than accepting any https:// link
// under a "LinkedIn" label.
export function isValidLinkedInUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /^(www\.)?linkedin\.com$/.test(u.hostname) && u.pathname.length > 1;
  } catch {
    return false;
  }
}

export function isValidGithubUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /^(www\.)?github\.com$/.test(u.hostname) && u.pathname.length > 1;
  } catch {
    return false;
  }
}

export function isValidInstagramUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /^(www\.)?instagram\.com$/.test(u.hostname) && u.pathname.length > 1;
  } catch {
    return false;
  }
}

const SOCIAL_URL_VALIDATORS = {
  linkedin: isValidLinkedInUrl,
  github: isValidGithubUrl,
  instagram: isValidInstagramUrl,
} as const;

export function safeSocialHref(
  platform: keyof typeof SOCIAL_URL_VALIDATORS,
  url: string | null | undefined,
): string {
  if (!url || !SOCIAL_URL_VALIDATORS[platform](url)) return "#";
  return url;
}
