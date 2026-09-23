"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/ui/RichTextEditor";
import { serializeDescriptionContent, isEditorContentEmpty, type EditorContentValue } from "@/lib/validation/richText";
import { updatePost } from "@/app/actions/feed";
import type { PostForEdit } from "@/lib/queries/feed";

// Mirrors mobile's feed/[id]/edit.tsx: the community is fixed (can't be
// reassigned -- community_posts_update_own_or_staff, 0104, pins it
// server-side too), only the content is editable.
export function EditPostForm({ post }: { post: PostForEdit }) {
  const router = useRouter();
  const [content, setContent] = useState<EditorContentValue>({
    json: (post.content_content as object | null) ?? null,
    text: post.content,
  });
  const editorRef = useRef<RichTextEditorHandle>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function handleSave() {
    // Read the live editor directly, not React state -- see richText.ts's
    // isEditorContentEmpty comment for why this replaced the earlier
    // ref+300ms-wait workaround.
    const finalContent = editorRef.current?.getContent() ?? content;
    if (isEditorContentEmpty(finalContent)) {
      setError("Write something to post, or add a photo");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await updatePost(post.id, {
        content: finalContent.text,
        content_content: serializeDescriptionContent(finalContent.json),
      });
      if (result?.error) setError(result.error);
      else router.push("/feed/my-posts");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text3">Posting as {post.community_name ?? "Community"}</p>

      <RichTextEditor
        ref={editorRef}
        content={content.json}
        onChange={setContent}
        placeholder="Write something…"
        imageUpload={{ bucket: "community-post-images", entityId: post.community_id }}
      />

      {error && <p className="text-center text-[13px] text-pink">{error}</p>}

      <div className="mt-2 flex gap-3">
        <button type="button" onClick={() => router.back()} className="btn-secondary flex-1 justify-center py-3 text-[14px]">
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={pending} className="btn-primary flex-1 justify-center py-3 text-[14px]">
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
