"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { IconMessageCircle, IconShare, IconCheck, IconPinFilled, IconPinnedFilled, IconCalendarEvent } from "@tabler/icons-react";
import { reactToPost, togglePinPost, votePoll } from "@/app/actions/feed";
import { communitySlugOrId } from "@/lib/queries/communities";
import { RichTextView } from "@/components/ui/RichTextView";
import { REACTIONS, type FeedPost, type ReactionKey } from "@/lib/queries/feed";

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

const REACTION_EMOJI: Record<ReactionKey, string> = Object.fromEntries(REACTIONS.map((r) => [r.key, r.emoji])) as Record<ReactionKey, string>;

/** One card in the feed grid -- header (community avatar/name + author +
 * timestamp) links to the community, body renders content_content via the
 * shared RichTextView (falling back to plain content + image_paths for
 * pre-rich-editor rows, exactly like mobile's feed.tsx), then an optional
 * poll block and event-recap chip, action row is reaction/comment-count/
 * share. `canModerate` gates the pin/unpin button, mirroring mobile's
 * staffCommunityIds check. */
export function FeedPostCard({ post, isLoggedIn, canModerate }: { post: FeedPost; isLoggedIn: boolean; canModerate: boolean }) {
  const router = useRouter();
  const [myReaction, setMyReaction] = useState(post.my_reaction);
  const [reactionTotal, setReactionTotal] = useState(post.reaction_total);
  const [isPinned, setIsPinned] = useState(post.is_pinned);
  const [poll, setPoll] = useState(post.poll);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  function handleReact(reaction: ReactionKey) {
    if (!isLoggedIn) {
      router.push(`/login?redirect=/feed`);
      return;
    }
    const removing = myReaction === reaction;
    const prevReaction = myReaction;
    setReactionTotal((c) => c + (removing ? -1 : prevReaction ? 0 : 1));
    setMyReaction(removing ? null : reaction);
    setPickerOpen(false);
    startTransition(async () => {
      await reactToPost(post.id, removing ? null : reaction);
    });
  }

  function handleTogglePin() {
    const next = !isPinned;
    setIsPinned(next);
    startTransition(async () => {
      await togglePinPost(post.id, next);
    });
  }

  function handleVote(optionId: string) {
    if (!isLoggedIn) {
      router.push(`/login?redirect=/feed`);
      return;
    }
    if (!poll) return;
    const prevOptionId = poll.myVoteOptionId;
    if (prevOptionId === optionId) return;
    if (poll.closesAt && new Date(poll.closesAt) < new Date()) return;
    setPoll({
      ...poll,
      myVoteOptionId: optionId,
      totalVotes: poll.totalVotes + (prevOptionId ? 0 : 1),
      options: poll.options.map((o) => {
        if (o.id === prevOptionId) return { ...o, voteCount: Math.max(0, o.voteCount - 1) };
        if (o.id === optionId) return { ...o, voteCount: o.voteCount + 1 };
        return o;
      }),
    });
    startTransition(async () => {
      await votePoll(poll.id, optionId);
    });
  }

  async function handleShare() {
    const url = `${window.location.origin}/feed/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  const communityHref = `/communities/${communitySlugOrId({ id: post.community_id, slug: post.community_slug })}`;
  const imageUrls = post.content_content ? [] : post.image_urls;
  const pollClosed = !!poll?.closesAt && new Date(poll.closesAt) < new Date();

  return (
    <div className="card-elevated flex flex-col gap-3 rounded-card border border-border bg-bg2 p-4">
      {isPinned && (
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-green">
          <IconPinnedFilled size={13} />
          Pinned
        </div>
      )}

      {/* Two separate links, not one nested inside the other -- nested <a>
          is invalid HTML (confirmed via a real hydration error: browsers
          silently close the outer anchor early, which React then flags as
          a client/server mismatch). Community avatar+name link to the
          community; author name links to their profile; both sit in the
          same flex row instead of one wrapping the other. */}
      <div className="flex items-center gap-2.5">
        <Link href={communityHref} className="shrink-0">
          {post.community_image_url ? (
            <Image
              src={post.community_image_url}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-tint text-[13px] font-bold text-green">
              {initialsFor(post.community_name)}
            </div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={communityHref} className="line-clamp-1 block font-heading text-[14px] font-bold text-text hover:underline">
            {post.community_name ?? "Community"}
          </Link>
          <p className="text-[12px] text-text3">
            <Link href={`/profile/${post.author_id}`} className="hover:text-text2 hover:underline">
              {post.author_name ?? "Host"}
            </Link>{" "}
            · {timeAgo(post.created_at)}
          </p>
        </div>
        {canModerate && (
          <button onClick={handleTogglePin} aria-label={isPinned ? "Unpin post" : "Pin post"} className="shrink-0 text-text3 transition hover:text-text2">
            <IconPinFilled size={16} className={isPinned ? "text-green" : undefined} />
          </button>
        )}
      </div>

      {post.event_id && (
        <Link
          href={`/events/${post.event_id}`}
          className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border2 bg-bg3 px-2.5 py-1 text-[11px] font-semibold text-text2 transition hover:border-green"
        >
          <IconCalendarEvent size={14} />
          Event recap{post.event_name ? ` · ${post.event_name}` : ""}
        </Link>
      )}

      {post.video_url ? (
        <>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text2">{post.content}</p>
          <video src={post.video_url} controls muted className="max-h-[480px] w-full rounded-card-sm bg-black object-contain" />
        </>
      ) : post.content_content ? (
        <div className="text-[14px] leading-relaxed text-text2">
          <RichTextView content={post.content_content as object} plainFallback={post.content} />
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text2">{post.content}</p>
          {imageUrls.length > 0 && (
            <div className={imageUrls.length > 1 ? "flex gap-2 overflow-x-auto" : ""}>
              {imageUrls.map((path, i) => (
                <img
                  key={i}
                  src={path}
                  alt=""
                  className={imageUrls.length > 1 ? "h-48 w-64 shrink-0 rounded-card-sm object-cover" : "h-48 w-full rounded-card-sm object-cover"}
                />
              ))}
            </div>
          )}
        </>
      )}

      {poll && (
        <div className="flex flex-col gap-2">
          {poll.options.map((opt) => {
            const pct = poll.totalVotes > 0 ? Math.round((opt.voteCount / poll.totalVotes) * 100) : 0;
            const mine = poll.myVoteOptionId === opt.id;
            const showResults = !!poll.myVoteOptionId || pollClosed;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={showResults}
                onClick={() => handleVote(opt.id)}
                className={`relative overflow-hidden rounded-card-sm border px-3 py-2.5 text-left transition ${
                  mine ? "border-green" : "border-border2 hover:border-green"
                } ${showResults ? "cursor-default" : "cursor-pointer"}`}
              >
                {showResults && (
                  <span className={`absolute inset-y-0 left-0 ${mine ? "bg-green-tint" : "bg-bg3"}`} style={{ width: `${pct}%` }} />
                )}
                <span className="relative flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-text">{opt.label}</span>
                  {showResults && <span className="text-[12px] font-bold text-text3">{pct}%</span>}
                </span>
              </button>
            );
          })}
          <p className="text-[11px] text-text3">
            {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}
            {pollClosed ? " · Poll closed" : ""}
          </p>
        </div>
      )}

      <div className="relative flex items-center gap-5 border-t border-border pt-3">
        {pickerOpen && (
          <div className="absolute bottom-full left-0 mb-2 flex gap-2 rounded-full border border-border2 bg-bg3 px-3 py-2 shadow-lg">
            {REACTIONS.map((r) => (
              <button key={r.key} type="button" onClick={() => handleReact(r.key)} className="text-[20px] transition hover:scale-125" aria-label={r.key}>
                {r.emoji}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => handleReact("like")}
          onContextMenu={(e) => {
            e.preventDefault();
            setPickerOpen((v) => !v);
          }}
          onDoubleClick={() => setPickerOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[13px] text-text3 transition hover:text-text2"
          title="Click to react, right-click for more reactions"
        >
          <span className="text-[16px] leading-none">{myReaction ? REACTION_EMOJI[myReaction] : "\u{1F90D}"}</span>
          {reactionTotal > 0 && <span className="font-medium">{reactionTotal}</span>}
        </button>
        <Link href={`/feed/${post.id}`} className="flex items-center gap-1.5 text-[13px] text-text3 transition hover:text-text2">
          <IconMessageCircle size={17} />
          {post.comment_count > 0 && <span className="font-medium">{post.comment_count}</span>}
        </Link>
        <div className="flex-1" />
        <button onClick={handleShare} className="relative text-text3 transition hover:text-text2" aria-label="Copy link to post">
          {copied ? <IconCheck size={17} className="text-green" /> : <IconShare size={17} />}
        </button>
      </div>
    </div>
  );
}
