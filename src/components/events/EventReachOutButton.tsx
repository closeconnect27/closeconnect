"use client";

import { useState } from "react";
import { IconMessage2 } from "@tabler/icons-react";
import { EventDmModal } from "@/components/events/EventDmModal";
import type { EventDmMessage } from "@/lib/queries/eventDm";

// Mirrors src/components/communities/ReachOutButton.tsx ("contact host"
// instead of "reach out to admin").
export function EventReachOutButton({
  eventId,
  eventName,
  threadId,
  initialMessages,
  currentUserId,
  hasUnread,
}: {
  eventId: string;
  eventName: string;
  threadId: string | null;
  initialMessages: EventDmMessage[];
  currentUserId: string;
  hasUnread: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary relative px-4 py-2 text-[13px]">
        <IconMessage2 size={14} />
        Contact host
        {hasUnread && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-pink" />}
      </button>

      {open && (
        <EventDmModal
          eventId={eventId}
          threadId={threadId}
          initialMessages={initialMessages}
          currentUserId={currentUserId}
          otherPartyName={eventName}
          mode="member"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
