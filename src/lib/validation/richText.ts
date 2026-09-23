import { z } from "zod";

export const MAX_DESCRIPTION_IMAGES = 5;
// A reel, not a gallery -- matches 0131's posture for community_posts.video_path.
export const MAX_DESCRIPTION_VIDEOS = 1;

/** Shared by community/event/feed description schemas -- the JSON itself
 * (Tiptap's doc shape) isn't deeply validated by zod here; the >5-images
 * rule is the one thing worth enforcing server-side too (client already
 * blocks it in RichTextEditor), since that's the actual abuse/cost
 * surface (storage), not the formatting content.
 *
 * Video is community-description-only (RichTextEditor's allowVideo prop
 * is only wired at that one call site) -- this hard-blocks a video node
 * here too, the same defense-in-depth reasoning as bioContentField below,
 * so an event/feed/bio description can't carry one no matter how it got
 * there. Use communityDescriptionContentField for community descriptions
 * instead, which allows up to MAX_DESCRIPTION_VIDEOS. */
export const descriptionContentField = z
  .unknown()
  .nullable()
  .optional()
  .refine((json) => countDescriptionImages(json) <= MAX_DESCRIPTION_IMAGES, {
    message: `A description can have at most ${MAX_DESCRIPTION_IMAGES} images`,
  })
  .refine((json) => countDescriptionVideos(json) === 0, {
    message: "Videos aren't supported here",
  });

/** Community descriptions only -- the one place RichTextEditor's
 * allowVideo is turned on. Otherwise identical to descriptionContentField. */
export const communityDescriptionContentField = z
  .unknown()
  .nullable()
  .optional()
  .refine((json) => countDescriptionImages(json) <= MAX_DESCRIPTION_IMAGES, {
    message: `A description can have at most ${MAX_DESCRIPTION_IMAGES} images`,
  })
  .refine((json) => countDescriptionVideos(json) <= MAX_DESCRIPTION_VIDEOS, {
    message: `A description can have at most ${MAX_DESCRIPTION_VIDEOS} video`,
  });

/** Bio has no imageUpload wired in RichTextEditor (no per-profile bucket
 * path for it), so this is a hard 0, not just a smaller MAX_DESCRIPTION_IMAGES
 * -- defense in depth against an image node reaching the server some other
 * way (a hand-crafted request, a future editor bug). Same reasoning covers
 * video, which bio never had wired either. */
export const bioContentField = z
  .unknown()
  .nullable()
  .optional()
  .refine((json) => countDescriptionImages(json) === 0, {
    message: "Bio can't include images",
  })
  .refine((json) => countDescriptionVideos(json) === 0, {
    message: "Bio can't include videos",
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

export function countDescriptionVideos(json: unknown): number {
  if (!json || typeof json !== "object") return 0;
  let count = 0;
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; content?: unknown[] };
    if (n.type === "video") count++;
    if (Array.isArray(n.content)) n.content.forEach(walk);
  }
  walk(json);
  return count;
}

export type EditorContentValue = { json: object | null; text: string };

/** Used to validate content read SYNCHRONOUSLY and directly from the live
 * editor (RichTextEditorHandle.getContent(), called at submit time) --
 * not from React state. An earlier version of this file had a
 * `isEditorContentEmptyAfterFlush` that instead re-checked a React-state
 * copy after a 300ms wait, working around a suspected onChange/state-sync
 * race on the theory that a fast typist's last keystroke hadn't
 * propagated yet. That diagnosis turned out to be wrong for the website
 * (RichTextEditor's onUpdate is unthrottled and always current -- traced
 * end-to-end, see git history): validating any COPY of the content,
 * however freshly re-synced, is structurally racy in a way reading the
 * live editor directly isn't, so NewPostForm/EditPostForm now do that
 * instead and this only needs to be a plain synchronous check. Mobile's
 * own closeconnect-mobile isDocEmptyAfterFlush is a different, correctly-
 * diagnosed fix for a real Capacitor WebView IME-composition lag and is
 * unrelated to this. */
export function isEditorContentEmpty(content: EditorContentValue): boolean {
  return !content.text.trim() && countDescriptionImages(content.json) === 0 && countDescriptionVideos(content.json) === 0;
}
