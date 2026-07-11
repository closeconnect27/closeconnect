import { z } from "zod";

export const MAX_DESCRIPTION_IMAGES = 5;

/** Shared by community/event description schemas -- the JSON itself
 * (Tiptap's doc shape) isn't deeply validated by zod here; the >5-images
 * rule is the one thing worth enforcing server-side too (client already
 * blocks it in RichTextEditor), since that's the actual abuse/cost
 * surface (storage), not the formatting content. */
export const descriptionContentField = z
  .unknown()
  .nullable()
  .optional()
  .refine((json) => countDescriptionImages(json) <= MAX_DESCRIPTION_IMAGES, {
    message: `A description can have at most ${MAX_DESCRIPTION_IMAGES} images`,
  });

/** Bio has no imageUpload wired in RichTextEditor (no per-profile bucket
 * path for it), so this is a hard 0, not just a smaller MAX_DESCRIPTION_IMAGES
 * -- defense in depth against an image node reaching the server some other
 * way (a hand-crafted request, a future editor bug). */
export const bioContentField = z
  .unknown()
  .nullable()
  .optional()
  .refine((json) => countDescriptionImages(json) === 0, {
    message: "Bio can't include images",
  });

// Server Actions serialize their arguments over React's Flight protocol,
// which -- confirmed empirically, not theoretically -- silently drops
// attrs on nodes buried in a large, deeply-nested plain object graph (a
// real Tiptap doc with an inline image reliably lost the image node's
// `src` crossing this exact boundary, even though the browser's own
// in-memory state was provably correct right up to the call). A JSON
// STRING has no such risk: Flight serializes primitives losslessly.
// Every place a rich-text doc crosses a "use server" boundary needs to
// go as a string, not the raw object -- these two helpers are the one
// pair of (de)serialize calls to use for that, client and server side.
export function serializeDescriptionContent(json: object | null | undefined): string | null {
  return json ? JSON.stringify(json) : null;
}

export function deserializeDescriptionContent(value: string | null | undefined): unknown {
  if (!value) return null;
  return JSON.parse(value);
}

export function countDescriptionImages(json: unknown): number {
  if (!json || typeof json !== "object") return 0;
  let count = 0;
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; content?: unknown[] };
    if (n.type === "imageResize" || n.type === "image") count++;
    if (Array.isArray(n.content)) n.content.forEach(walk);
  }
  walk(json);
  return count;
}
