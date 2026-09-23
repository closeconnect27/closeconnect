"use client";

import { forwardRef, useImperativeHandle, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import {
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconH1,
  IconH2,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconList,
  IconListNumbers,
  IconBlockquote,
  IconMinus,
  IconLink,
  IconMoodSmile,
  IconPhoto,
  IconVideo,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconLoader2,
} from "@tabler/icons-react";
import { richTextExtensions } from "@/lib/tiptap/extensions";
import { uploadDescriptionImage } from "@/lib/uploadDescriptionImage";

// All system font stacks, not a webfont -- no @font-face/network request,
// keeping this consistent with the rest of the app's Cloudflare Workers
// deployment (a webfont would add a bundle-size/runtime risk for a
// cosmetic toolbar option, the same reasoning that ruled out @tiptap/html
// + happy-dom for rendering).
const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Serif", value: "Georgia, serif" },
  { label: "Classic serif", value: "'Times New Roman', Times, serif" },
  { label: "Sans", value: "Helvetica, Arial, sans-serif" },
  { label: "Rounded", value: "ui-rounded, system-ui" },
  { label: "Condensed", value: "'Arial Narrow', sans-serif" },
  { label: "Mono", value: "ui-monospace, monospace" },
  { label: "Handwriting", value: "'Brush Script MT', cursive" },
];

const FONT_SIZES = [
  { label: "Small", value: "13px" },
  { label: "Normal", value: "" },
  { label: "Large", value: "20px" },
  { label: "Huge", value: "28px" },
];

// #1a1a1a (near-black) used to be here as a 6th swatch -- it's the exact
// same hex as --bg3, this editor's own dark-mode background, so picking it
// made the selected text invisible against its own container. Every color
// below is checked to have real contrast against both themes' surfaces.
const COLORS = ["#e5484d", "#f5a623", "#12a150", "#0b6bcb", "#8e4ec6", "#0d9488"];

// Single-codepoint emoji only -- the original list had "❤️" (U+2764 +
// U+FE0F variation selector), a multi-codepoint sequence more prone to
// being split at the wrong boundary by insertContent/text-node merging
// than a plain single-codepoint emoji like the heart below.
const EMOJI = ["😀", "😂", "🎉", "💖", "👍", "🔥", "✨", "🙌", "😍", "🤔", "🥳", "👏", "💯", "🚀", "😅", "🙏"];

const MAX_IMAGES = 5;
// Must match the community-images/event-images bucket's own limits (0018,
// 0008) -- otherwise a file that passes this check still fails the actual
// upload with a confusing storage-level error.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// A reel, not a gallery -- one video per description, matching 0131's
// posture for community_posts.video_path.
const MAX_VIDEOS = 1;
// Must match the community-images bucket's own limit (0137).
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

/** Imperative escape hatch for a caller that needs the editor's CURRENT
 * content synchronously at some later moment (e.g. right before a submit)
 * instead of trusting whatever the last onChange happened to report. See
 * NewPostForm/EditPostForm's handlePost/handleSave for why this exists --
 * onChange is unthrottled and always fresh, so it was never the source of
 * the "write something to post" bug, but validating a COPY of the content
 * (React state, however carefully mirrored/re-synced/delayed) is
 * structurally racy in a way reading the live editor directly isn't. */
export type RichTextEditorHandle = { getContent: () => { json: object; text: string } };

/**
 * Shared rich text editor for community/event descriptions and (a
 * restricted configuration of) profile bios -- text formatting, colors,
 * fonts, emoji, a divider ("shape"), links, and inline images (capped at
 * 5, uploaded straight into the content rather than a separate gallery).
 * Community descriptions can also embed one video (allowVideo) -- a reel,
 * not a gallery, so it's capped at 1 by default.
 * Content is stored as Tiptap's own JSON doc (onChange gets both the json
 * and a plain-text extract for search/preview use), not HTML -- avoids
 * ever needing to sanitize arbitrary HTML on render.
 */
export const RichTextEditor = forwardRef<RichTextEditorHandle, {
  content: object | null;
  onChange: (value: { json: object; text: string }) => void;
  placeholder?: string;
  /** Which bucket/entity images (and, when allowVideo is on, video) upload
   * under -- required when allowImages or allowVideo is true. */
  imageUpload?: { bucket: "community-images" | "event-images" | "community-post-images"; entityId: string };
  allowImages?: boolean;
  maxImages?: number;
  /** Community descriptions only -- a single embedded video, not a gallery.
   * Off everywhere else this shared editor is used (event descriptions,
   * feed posts, bio). */
  allowVideo?: boolean;
  maxVideos?: number;
}>(function RichTextEditor({
  content,
  onChange,
  placeholder = "Write something…",
  imageUpload,
  allowImages = true,
  maxImages = MAX_IMAGES,
  allowVideo = false,
  maxVideos = MAX_VIDEOS,
}, ref) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      ...richTextExtensions(),
      Placeholder.configure({ placeholder }),
    ],
    content: content ?? "",
    immediatelyRender: false,
    // ^ this component re-renders on every keystroke (onUpdate below lifts
    // state to the parent, which re-renders and passes new props back
    // down) -- with no deps array, @tiptap/react's useEditor defaults to
    // `[]` internally in a way that means "no deps to gate on," so on
    // EVERY render it re-diffs options and, since `extensions` above is a
    // brand-new array/instances every render (richTextExtensions() and
    // Placeholder.configure() both construct fresh objects), the diff
    // never matches -- editor.setOptions() fires on every single
    // keystroke, forcing a synchronous view.updateState() resync. That's
    // real, wasted work on every keystroke, and a redundant view resync
    // firing right as ProseMirror is mid-transaction from that same
    // keystroke is exactly the kind of thing that can race and drop the
    // just-typed character from the model -- a very plausible mechanism
    // for "the editor shows text but getText()/submit says empty," worse
    // right after mount (typing fast, right away) than later. Passing an
    // explicit deps array here (placeholder is the only thing that
    // actually needs to recreate the editor) routes useEditor down its
    // other, cheap "did deps actually change" path instead, so a plain
    // re-render from typing no longer touches the editor's options at
    // all. See RichTextEditorHandle's DOM-textContent fallback below for
    // the belt-and-suspenders half of this fix.
    onUpdate: ({ editor }) => {
      onChange({ json: editor.getJSON(), text: editor.getText() });
    },
    // Belt-and-suspenders for mobile (Capacitor/Android WebView): some
    // keyboards (predictive/glide typing) drive input through IME
    // composition events, and the OS renders the composing text visually
    // before ProseMirror's own compositionend handling commits it as a
    // transaction. Normally that still fires onUpdate once composition
    // ends -- but tapping straight from the keyboard to a submit button
    // (no separate tap to blur first) can race that commit, leaving the
    // parent's `content` state one keystroke-batch behind what's visibly
    // on screen: the user sees their text, submits, and gets "Write
    // something to post" back. Re-syncing on blur (which a submit button
    // tap always triggers first) closes that race regardless of which
    // step actually dropped the update.
    onBlur: ({ editor }) => {
      onChange({ json: editor.getJSON(), text: editor.getText() });
    },
    // Without this, pasting or dragging an image (very natural in a rich
    // editor) falls through to Tiptap's own default image handling, which
    // needs a data: URI -- but allowBase64 is deliberately off (a pasted
    // screenshot could otherwise bloat the stored JSONB row arbitrarily),
    // so the default path silently inserts an imageResize node with no
    // src at all. Confirmed this exact shape already sitting in production
    // data (a real community's description). Routing both paths through
    // the same upload flow as the toolbar button fixes it instead of just
    // suppressing the broken insert.
    editorProps: {
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
        if (!file) return false;
        event.preventDefault();
        if (allowImages) void handleImagePick(file);
        else setError("Images aren't supported here.");
        return true;
      },
      handleDrop: (_view, event) => {
        const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
        if (!file) return false;
        event.preventDefault();
        if (allowImages) void handleImagePick(file);
        else setError("Images aren't supported here.");
        return true;
      },
    },
  }, [placeholder]);

  // Reads the live editor directly, not any React state copy of it --
  // called synchronously at submit time by NewPostForm/EditPostForm (and
  // any other caller that needs it), so there's no timing window between
  // "what's on screen" and "what gets validated/sent."
  //
  // text falls back to the contenteditable's own DOM textContent when
  // ProseMirror's getText() comes back empty -- the two should never
  // disagree, but getText() reads ProseMirror's MODEL, and the useEditor
  // setOptions-churn bug above (now fixed) is a real example of how that
  // model can end up a keystroke behind what's actually rendered on
  // screen. Reading the DOM directly is what the user (and a screenshot)
  // would call "empty," so it's the more trustworthy signal for this one
  // yes/no check specifically -- the JSON sent to the server still comes
  // from getJSON()/getText(), this only affects whether the empty-content
  // error blocks a submit the user can plainly see has text in it.
  useImperativeHandle(ref, () => ({
    getContent: () => {
      const text = editor?.getText() ?? "";
      const domText = editor && !editor.isDestroyed ? editor.view.dom.textContent ?? "" : "";
      return { json: editor?.getJSON() ?? {}, text: text.trim() ? text : domText };
    },
  }), [editor]);

  if (!editor) return null;

  function countImages() {
    let count = 0;
    // tiptap-extension-resize-image registers its node as "imageResize"
    // (confirmed from its source, not documented) -- "image" is StarterKit's
    // own bundled node, which stays unused here since ResizableImage
    // replaces it, but checked too in case content ever has one from
    // elsewhere.
    editor?.state.doc.descendants((node) => {
      if (node.type.name === "imageResize" || node.type.name === "image") count++;
    });
    return count;
  }

  function countVideos() {
    let count = 0;
    editor?.state.doc.descendants((node) => {
      if (node.type.name === "video") count++;
    });
    return count;
  }

  async function handleImagePick(file: File) {
    setError("");
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, or WebP images are allowed");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Images must be under 3MB");
      return;
    }
    if (countImages() >= maxImages) {
      setError(`Only up to ${maxImages} images per description`);
      return;
    }
    if (!imageUpload) return;

    setUploading(true);
    const result = await uploadDescriptionImage(file, imageUpload.bucket, imageUpload.entityId);
    setUploading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    editor!.chain().focus().setImage({ src: result.url! }).run();
    onChange({ json: editor!.getJSON(), text: editor!.getText() });
  }

  async function handleVideoPick(file: File) {
    setError("");
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      setError("Only MP4, WebM, or MOV videos are allowed");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError("Videos must be under 50MB");
      return;
    }
    if (countVideos() >= maxVideos) {
      setError(`Only up to ${maxVideos} video per description`);
      return;
    }
    if (!imageUpload) return;

    setVideoUploading(true);
    const result = await uploadDescriptionImage(file, imageUpload.bucket, imageUpload.entityId);
    setVideoUploading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    editor!.chain().focus().insertContent({ type: "video", attrs: { src: result.url! } }).run();
    onChange({ json: editor!.getJSON(), text: editor!.getText() });
  }

  function setLink() {
    const url = window.prompt("Link URL");
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  const imageCount = countImages();
  const videoCount = countVideos();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-card-sm border border-border2 bg-bg3 p-1.5">
        <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="Bold">
          <IconBold size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="Italic">
          <IconItalic size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} label="Underline">
          <IconUnderline size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} label="Strikethrough">
          <IconStrikethrough size={15} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} label="Heading 1">
          <IconH1 size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="Heading 2">
          <IconH2 size={15} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} label="Align left">
          <IconAlignLeft size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} label="Align center">
          <IconAlignCenter size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} label="Align right">
          <IconAlignRight size={15} />
        </ToolbarButton>

        <Divider />

        <select
          aria-label="Font family"
          onChange={(e) => {
            if (e.target.value) editor.chain().focus().setFontFamily(e.target.value).run();
            else editor.chain().focus().unsetFontFamily().run();
          }}
          className="rounded-card-sm border border-border2 bg-bg2 px-2 py-1.5 text-[12px]"
          defaultValue=""
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Font size"
          onChange={(e) => {
            if (e.target.value) editor.chain().focus().setFontSize(e.target.value).run();
            else editor.chain().focus().unsetFontSize().run();
          }}
          className="rounded-card-sm border border-border2 bg-bg2 px-2 py-1.5 text-[12px]"
          defaultValue=""
        >
          {FONT_SIZES.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 px-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Text color ${c}`}
              onClick={() => editor.chain().focus().setColor(c).run()}
              className="h-5 w-5 shrink-0 rounded-full border border-border2"
              style={{ background: c }}
            />
          ))}
          <button
            type="button"
            aria-label="Reset color"
            onClick={() => editor.chain().focus().unsetColor().run()}
            className="text-[11px] text-text3 hover:text-text2"
          >
            Reset
          </button>
        </div>

        <Divider />

        <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Bullet list">
          <IconList size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Numbered list">
          <IconListNumbers size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} label="Quote">
          <IconBlockquote size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} label="Divider">
          <IconMinus size={15} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("link")} onClick={setLink} label="Link">
          <IconLink size={15} />
        </ToolbarButton>

        <EmojiPicker onPick={(emoji) => editor.chain().focus().insertContent(emoji).run()} />

        {allowImages && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImagePick(file);
                e.target.value = "";
              }}
            />
            <ToolbarButton
              onClick={() => fileInputRef.current?.click()}
              label={`Insert image (${imageCount}/${maxImages})`}
              disabled={uploading || imageCount >= maxImages}
            >
              {uploading ? <IconLoader2 size={15} className="animate-spin" /> : <IconPhoto size={15} />}
            </ToolbarButton>
          </>
        )}

        {allowVideo && (
          <>
            <input
              ref={videoInputRef}
              type="file"
              accept={ALLOWED_VIDEO_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleVideoPick(file);
                e.target.value = "";
              }}
            />
            <ToolbarButton
              onClick={() => videoInputRef.current?.click()}
              label={`Insert video (${videoCount}/${maxVideos})`}
              disabled={videoUploading || videoCount >= maxVideos}
            >
              {videoUploading ? <IconLoader2 size={15} className="animate-spin" /> : <IconVideo size={15} />}
            </ToolbarButton>
          </>
        )}

        <Divider />

        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} label="Undo">
          <IconArrowBackUp size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} label="Redo">
          <IconArrowForwardUp size={15} />
        </ToolbarButton>
      </div>

      {allowImages && (
        <span className="text-[11px] text-text3">
          {imageCount}/{maxImages} images used
        </span>
      )}
      {allowVideo && (
        <span className="text-[11px] text-text3">
          {videoCount}/{maxVideos} video used
        </span>
      )}
      {error && <p className="text-[12px] text-pink">{error}</p>}

      <div className="rich-text-editor rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus-within:border-green">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

function ToolbarButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-card-sm transition disabled:opacity-40 ${
        active ? "bg-green-tint text-green" : "text-text2 hover:bg-bg2"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border2" />;
}

function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <ToolbarButton onClick={() => setOpen((v) => !v)} label="Emoji">
        <IconMoodSmile size={15} />
      </ToolbarButton>
      {open && (
        <div className="card-elevated absolute left-0 top-full z-30 mt-1 grid w-72 grid-cols-8 gap-1 rounded-card-sm bg-bg2 p-2">
          {/* Explicit w-72 -- inside an absolutely-positioned, width:auto
              parent, grid-cols-8's `repeat(8, minmax(0, 1fr))` has no
              shrink-to-fit basis to size the 1fr tracks against, so every
              column collapsed to 0px (confirmed via getComputedStyle:
              gridTemplateColumns was literally "0px 0px 0px 0px 0px 0px 0px
              0px") -- emoji rendered stacked/overlapping instead of in a
              grid. A fixed container width gives the columns something
              real to divide. */}
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onPick(e);
                setOpen(false);
              }}
              className="rounded-card-sm p-1 text-[16px] hover:bg-bg3"
              style={{ fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif' }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
