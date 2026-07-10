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
    immediatelyRender: false,
  });

  if (!editor) return null;
  if (!content && !plainFallback) return null;

  return (
    <div className={`rich-text-view ${className ?? ""}`}>
      <EditorContent editor={editor} />
    </div>
  );
}
