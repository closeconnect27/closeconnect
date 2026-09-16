"use client";

import { useState } from "react";
import { IconMessage2 } from "@tabler/icons-react";
import { DmModal } from "@/components/communities/DmModal";
import type { DmMessage } from "@/lib/queries/dm";

export function ReachOutButton({
  communityId,
  communityName,
  threadId,
  initialMessages,
  currentUserId,
  hasUnread = false,
}: {
  communityId: string;
  communityName: string;
  threadId: string | null;
  initialMessages: DmMessage[];
  currentUserId: string;
  hasUnread?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary relative px-4 py-2 text-[13px]">
        <IconMessage2 size={14} />
        Reach out to admin
        {hasUnread && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-pink" />}
      </button>

      {open && (
        <DmModal
          communityId={communityId}
          threadId={threadId}
          initialMessages={initialMessages}
          currentUserId={currentUserId}
          otherPartyName={communityName}
          mode="member"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
