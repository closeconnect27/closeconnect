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

// General-purpose version of the same write-time-validate /
// render-time-sanitize pair above, for links with no fixed platform/host
// to allowlist (an event's meeting link can legitimately be Zoom, Google
// Meet, Teams, or anything else) -- scheme-restricted only. `.url()`
// alone (zod's validator, and the browser's own `new URL()`) accepts
// `javascript:`/`data:` URIs just fine, which is exactly the gap this closes.
export function isSafeHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function safeHttpsHref(url: string | null | undefined): string {
  if (!url || !isSafeHttpsUrl(url)) return "#";
  return url;
}

export function isInstagramLink(url: string | null | undefined): boolean {
  return !!url && url.includes("instagram.com");
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

export function isValidFacebookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /^(www\.|m\.)?facebook\.com$/.test(u.hostname) && u.pathname.length > 1;
  } catch {
    return false;
  }
}

// Same two hosts isValidExternalLink already recognizes as WhatsApp (group
// invite link or channel), factored out here so a community's whatsapp_url
// field can go through the same social-link validate/sanitize pair as
// Instagram/Facebook/LinkedIn instead of the separate external-link path.
export function isValidWhatsAppUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.hostname === "chat.whatsapp.com" && /^\/[A-Za-z0-9_-]{10,}$/.test(u.pathname)) return true;
    if (
      (u.hostname === "whatsapp.com" || u.hostname === "www.whatsapp.com") &&
      u.pathname.startsWith("/channel/") &&
      u.pathname.length > 10
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const SOCIAL_URL_VALIDATORS = {
  linkedin: isValidLinkedInUrl,
  github: isValidGithubUrl,
  instagram: isValidInstagramUrl,
  facebook: isValidFacebookUrl,
  whatsapp: isValidWhatsAppUrl,
} as const;

export function safeSocialHref(
  platform: keyof typeof SOCIAL_URL_VALIDATORS,
  url: string | null | undefined,
): string {
  if (!url || !SOCIAL_URL_VALIDATORS[platform](url)) return "#";
  return url;
}
