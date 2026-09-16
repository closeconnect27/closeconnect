"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { deletePost } from "@/app/actions/feed";
import { RichTextView } from "@/components/ui/RichTextView";
import type { MyFeedPost } from "@/lib/queries/feed";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// Mirrors mobile's feed/my-posts.tsx: view + edit + delete own posts --
// posting itself lives on /feed/new (or /create on mobile), this is purely
// "manage what I've already posted".
export function MyPostsList({ initialPosts }: { initialPosts: MyFeedPost[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete(postId: string) {
    setConfirmingId(null);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    startTransition(async () => {
      await deletePost(postId);
    });
  }

  if (posts.length === 0) {
    return <p className="py-16 text-center text-[13px] text-text3">You haven&apos;t posted anything yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {posts.map((post) => (
        <div key={post.id} className="card-elevated flex flex-col gap-2.5 rounded-card border border-border bg-bg2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="line-clamp-1 font-heading text-[14px] font-bold text-text">{post.community_name ?? "Community"}</p>
            <span className="shrink-0 text-[11px] text-text3">{timeAgo(post.created_at)}</span>
          </div>

          {post.content_content ? (
            <div className="line-clamp-4 text-[13px] leading-snug text-text2">
              <RichTextView content={post.content_content as object} plainFallback={post.content} />
            </div>
          ) : (
            <p className="line-clamp-4 whitespace-pre-wrap text-[13px] leading-snug text-text2">{post.content}</p>
          )}

          <div className="flex gap-2">
            <Link href={`/feed/${post.id}/edit`} className="btn-secondary px-3 py-1.5 text-[12px]">
              <IconPencil size={13} />
              Edit
            </Link>
            {confirmingId === post.id ? (
              <>
                <button onClick={() => handleDelete(post.id)} className="rounded-full border border-pink/40 bg-pink-tint px-3 py-1.5 text-[12px] font-semibold text-pink">
                  Confirm delete
                </button>
                <button onClick={() => setConfirmingId(null)} className="btn-secondary px-3 py-1.5 text-[12px]">
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmingId(post.id)} className="btn-secondary px-3 py-1.5 text-[12px] text-pink">
                <IconTrash size={13} />
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
