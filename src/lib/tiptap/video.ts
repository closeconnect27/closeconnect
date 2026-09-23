import { Node, mergeAttributes } from "@tiptap/core";

// Community descriptions' one embedded video (RichTextEditor's allowVideo
// prop) -- a plain, non-resizable atom node, unlike ResizableImage: one
// file, always shown at full width, no resize handles. Kept deliberately
// minimal (a single `src` attr) so it's easy to mirror in the mobile app's
// own hand-rolled WebView renderer, which reads/writes this exact JSON
// shape (src/lib/richText.ts there).
export const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "video[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["video", mergeAttributes(HTMLAttributes, { controls: "true", style: "max-width:100%" })];
  },
});
