"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconX } from "@tabler/icons-react";
import { fetchPostReactors } from "@/app/actions/feed";
import { REACTIONS, type ReactionKey, type PostReactor } from "@/lib/queries/feed";

const REACTION_EMOJI: Record<ReactionKey, string> = Object.fromEntries(REACTIONS.map((r) => [r.key, r.emoji])) as Record<ReactionKey, string>;

function initialsFor(name: string | null) {
  const words = (name ?? "?").trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0]?.slice(0, 2) ?? "?").toUpperCase();
}

function ReactorAvatar({ url, name }: { url: string | null; name: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-tint text-[13px] font-bold text-green">
      {initialsFor(name)}
    </div>
  );
}

/** LinkedIn-style "who reacted" breakdown -- All + one tab per reaction
 * that's actually present on this post (each showing its emoji and
 * count), a scrollable list of people below. Fetched lazily on open, not
 * pre-loaded with every feed page (a post could have hundreds of
 * reactions; most viewers never open this). */
export function ReactionsModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [reactors, setReactors] = useState<PostReactor[] | null>(null);
  const [tab, setTab] = useState<ReactionKey | "all">("all");

  useEffect(() => {
    let cancelled = false;
    fetchPostReactors(postId).then((data) => {
      if (!cancelled) setReactors(data);
    });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const counts = new Map<ReactionKey, number>();
  for (const r of reactors ?? []) counts.set(r.reaction, (counts.get(r.reaction) ?? 0) + 1);
  const presentReactions = REACTIONS.filter((r) => (counts.get(r.key) ?? 0) > 0);
  const visible = (reactors ?? []).filter((r) => tab === "all" || r.reaction === tab);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="card-elevated flex max-h-[70vh] w-full flex-col rounded-t-card border border-border bg-bg2 sm:max-w-sm sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-heading text-[15px] font-bold text-text">Reactions</h2>
          <button onClick={onClose} aria-label="Close" className="text-text3 transition hover:text-text2">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
          <button
            onClick={() => setTab("all")}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
              tab === "all" ? "bg-green-tint text-green" : "text-text2 hover:bg-bg3"
            }`}
          >
            All {reactors ? reactors.length : ""}
          </button>
          {presentReactions.map((r) => (
            <button
              key={r.key}
              onClick={() => setTab(r.key)}
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                tab === r.key ? "bg-green-tint text-green" : "text-text2 hover:bg-bg3"
              }`}
            >
              <span>{r.emoji}</span>
              {counts.get(r.key)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {reactors === null ? (
            <p className="py-6 text-center text-[13px] text-text3">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text3">No reactions yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {visible.map((r) => (
                <Link key={r.user_id} href={`/profile/${r.user_id}`} onClick={onClose} className="flex items-center gap-3 py-2.5">
                  <div className="relative">
                    <ReactorAvatar url={r.avatar_url} name={r.display_name} />
                    <span className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-bg2 text-[10px] leading-none">
                      {REACTION_EMOJI[r.reaction]}
                    </span>
                  </div>
                  <span className="text-[13px] font-semibold text-text">{r.display_name ?? "Someone"}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
