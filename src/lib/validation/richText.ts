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
