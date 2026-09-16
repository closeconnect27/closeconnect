"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconSend, IconTrash } from "@tabler/icons-react";
import { addComment, deleteComment } from "@/app/actions/feed";
import type { FeedComment } from "@/lib/queries/feed";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function initialsFor(name: string | null) {
  const words = (name ?? "?").trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0]?.slice(0, 2) ?? "?").toUpperCase();
}

function CommentAvatar({ url, name }: { url: string | null; name: string | null }) {
  if (url) {
    // profiles.avatar_url can point to any host (Google's CDN via Google
    // Sign-In, a Supabase-storage upload, etc.), not just next/image's
    // allowlisted remotePatterns -- plain <img>, same escape hatch
    // profile/[id]/page.tsx already uses for this exact column.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-tint text-[11px] font-bold text-green">
      {initialsFor(name)}
    </div>
  );
}

// Flat, oldest-first thread + composer -- mirrors mobile's
// feed/[id]/comments.tsx exactly (no threading/replies, a first cut for a
// brand-new comment feature).
export function CommentsSection({
  postId,
  initialComments,
  currentUserId,
  isLoggedIn,
}: {
  postId: string;
  initialComments: FeedComment[];
  currentUserId: string | null;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSend() {
    if (!isLoggedIn) {
      router.push(`/login?redirect=/feed/${postId}`);
      return;
    }
    if (!text.trim()) return;
    setError("");
    startTransition(async () => {
      const result = await addComment(postId, { content: text.trim() });
      if (result.error) {
        setError(result.error);
        return;
      }
      setText("");
      router.refresh();
    });
  }

  function handleDelete(commentId: string) {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    startTransition(async () => {
      await deleteComment(commentId, postId);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-[15px] font-bold text-text">Comments</h2>

      {comments.length === 0 ? (
        <p className="text-[13px] text-text3">No comments yet. Be the first to say something.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <Link href={`/profile/${c.author_id}`}>
                <CommentAvatar url={c.author_avatar} name={c.author_name} />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="rounded-card-sm border border-border bg-bg2 px-3 py-2">
                  <Link href={`/profile/${c.author_id}`} className="text-[12px] font-bold text-text hover:underline">
                    {c.author_name ?? "Someone"}
                  </Link>
                  <p className="whitespace-pre-wrap text-[13px] leading-snug text-text2">{c.content}</p>
                </div>
                <div className="mt-1 flex items-center gap-3 pl-1">
                  <span className="text-[11px] text-text3">{timeAgo(c.created_at)}</span>
                  {currentUserId === c.author_id && (
                    <button onClick={() => handleDelete(c.id)} aria-label="Delete comment" className="text-text3 hover:text-pink">
                      <IconTrash size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-[12px] text-pink">{error}</p>}

      <div className="flex items-end gap-2 border-t border-border pt-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment…"
          rows={1}
          className="max-h-24 flex-1 resize-none rounded-card-sm border border-border2 bg-bg3 px-3.5 py-2.5 text-[13px] transition focus:border-green"
        />
        <button
          onClick={handleSend}
          disabled={pending || !text.trim()}
          aria-label="Send comment"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green text-green-dark transition disabled:opacity-50"
        >
          <IconSend size={16} />
        </button>
      </div>
    </div>
  );
}
