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
