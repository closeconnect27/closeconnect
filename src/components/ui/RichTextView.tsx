"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { richTextExtensions } from "@/lib/tiptap/extensions";

/**
 * Read-only render of a stored Tiptap JSON doc. Client-side (a real
 * Tiptap instance in editable:false mode), not server-side HTML
 * generation -- this app deploys to Cloudflare Workers, and @tiptap/html
 * needs happy-dom (a full DOM emulation) as a peer dependency, which is
 * a real risk in that runtime (bundle size, partial Node API support).
 * Rendering with the same real browser DOM Tiptap already targets avoids
 * that risk entirely, at the cost of shipping the editor's JS to view a
 * description -- an accepted, well-understood tradeoff, not a gap.
 *
 * `plainFallback` renders when there's no rich content yet (legacy rows
 * before this system existed) -- their plain-text `description` column,
 * as a single paragraph.
 */
export function RichTextView({
  content,
  plainFallback,
  className,
}: {
  content: object | null;
  plainFallback?: string | null;
  className?: string;
}) {
  const editor = useEditor({
    extensions: richTextExtensions(),
    content: content ?? (plainFallback ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: plainFallback }] }] } : ""),
    editable: false,
    // true here, unlike RichTextEditor's editable instance -- this is a
    // READ-ONLY view of server-fetched, deterministic content (same JSON
    // on the server and the client, no user input involved), so there's
    // no hydration-mismatch risk to guard against. false was silently
    // producing an empty <div> in the server-rendered HTML until client
    // JS hydrated -- confirmed directly (curled a live page, zero
    // occurrences of "ProseMirror" in the raw response) -- meaning every
    // community/event/profile description was invisible to anything that
    // doesn't execute JS (most search crawlers, social link unfurlers),
    // a real regression against the plain-text description this replaced.
    immediatelyRender: true,
  });

  if (!editor) return null;
  if (!content && !plainFallback) return null;

  return (
    <div className={`rich-text-view ${className ?? ""}`}>
      <EditorContent editor={editor} />
    </div>
  );
}
