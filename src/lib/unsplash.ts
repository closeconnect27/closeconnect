import { communitySeed, getCategoryPool } from "@/lib/categoryImages";

const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

// Picks from the same curated, verified-non-gradient pool CategoryImage's
// fallback uses (src/lib/categoryImages.ts) rather than a live search per
// entity -- Unsplash's demo-tier rate limit (50/hour) can't sustain one
// search call per community/event creation at any real traffic. Live
// search was used once, up front, to build that pool; this just assigns
// a specific photo from it to a specific entity, permanently.
export type AssignedPhoto = { photoId: string; imageUrl: string };

export function assignPhotoForEntity(category: string, entityId: string): AssignedPhoto {
  const pool = getCategoryPool(category);
  const photo = pool[communitySeed(entityId) % pool.length];
  return { photoId: photo.id, imageUrl: photo.raw };
}

// Required by Unsplash's API guidelines whenever a photo is actually used
// (not just browsed) -- fire-and-forget, never blocks or fails the
// caller's own create/backfill flow on Unsplash being reachable.
export function triggerDownloadPing(photoId: string) {
  if (!ACCESS_KEY) return;
  fetch(`https://api.unsplash.com/photos/${photoId}/download`, {
    headers: { Authorization: `Client-ID ${ACCESS_KEY}` },
  }).catch((e) => console.error(`Unsplash download ping failed for ${photoId}:`, e));
}
