import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { Link } from "@tiptap/extension-link";
import { ImageResize as ResizableImage } from "tiptap-extension-resize-image";

// Shared between the editable RichTextEditor and the read-only
// RichTextView -- both need the exact same schema to parse/render the
// same stored JSON correctly. ResizableImage replaces the base Image
// extension entirely (it wraps/extends it), so StarterKit's own image
// support stays off to avoid a duplicate node name.
export function richTextExtensions() {
  return [
    StarterKit.configure({ link: false }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Link.configure({ openOnClick: false, autolink: true }),
    ResizableImage.configure({ inline: false }),
  ];
}
