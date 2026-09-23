"use client";

import { useState } from "react";
import { ChatInfoPanel } from "@/components/dm/ChatInfoPanel";

type OtherParticipant = { id: string; display_name: string; avatar_url: string | null };

// Wraps the thread header's avatar+name button -- tapping it opens
// ChatInfoPanel (Profile/Mute/Block/Delete chat/Media & links) instead of
// navigating straight to /profile/[id], mirroring the native app's own
// header-name -> chat-info flow.
export function DmThreadHeader({
  threadId,
  otherParticipant,
  initialMuted,
  initialBlocked,
}: {
  threadId: string;
  otherParticipant: OtherParticipant;
  initialMuted: boolean;
  initialBlocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Owned here, not inside ChatInfoPanel -- the panel is conditionally
  // mounted ({open && <ChatInfoPanel .../>}), so state local to IT gets
  // reset to the original server-fetched initialMuted/initialBlocked
  // every time it's closed and reopened in the same page view. For block
  // that was a real bug: re-block after a stale-reopen hit the DB's
  // (blocker_id, blocked_id) primary key and failed silently (no error UI
  // existed for it), leaving the panel stuck showing "Block" forever
  // until a full reload. Lifting the state here, where it survives the
  // panel's own mount/unmount, fixes that at the source.
  const [muted, setMuted] = useState(initialMuted);
  const [blocked, setBlocked] = useState(initialBlocked);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 items-center gap-2.5 text-left">
        {otherParticipant.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
          <img src={otherParticipant.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-tint text-[14px] font-bold text-green">
            {otherParticipant.display_name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="min-w-0 flex-1 truncate font-heading text-[16px] font-bold text-text transition hover:text-green">{otherParticipant.display_name}</span>
      </button>

      {open && (
        <ChatInfoPanel
          threadId={threadId}
          otherParticipant={otherParticipant}
          muted={muted}
          onMutedChange={setMuted}
          blocked={blocked}
          onBlockedChange={setBlocked}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
