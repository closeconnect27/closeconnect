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
}: {
  communityId: string;
  communityName: string;
  threadId: string | null;
  initialMessages: DmMessage[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary px-4 py-2 text-[13px]">
        <IconMessage2 size={14} />
        Reach out to admin
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
