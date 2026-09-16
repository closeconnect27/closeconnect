"use client";

import { useState } from "react";
import { IconInbox, IconX } from "@tabler/icons-react";
import { EventDmModal } from "@/components/events/EventDmModal";
import { isThreadUnread } from "@/lib/queries/dmReads";
import type { EventDmThreadSummary, EventDmMessage } from "@/lib/queries/eventDm";

// Mirrors src/components/communities/DmInboxSection.tsx ("contact host"
// instead of "reach out to admin"). The badge shows unread THREAD count
// (a thread whose last message the host hasn't opened yet), not total
// thread count -- see isThreadUnread's comment.
export function EventDmInboxSection({
  eventId,
  threads,
  messagesByThread,
  currentUserId,
  readTimestamps,
  autoOpenThreadId,
}: {
  eventId: string;
  threads: EventDmThreadSummary[];
  messagesByThread: Record<string, EventDmMessage[]>;
  currentUserId: string;
  readTimestamps: Map<string, string>;
  // Deep-link target from a notification click (?dmThread=<id>) -- opens
  // straight into that thread instead of just the inbox list.
  autoOpenThreadId?: string | null;
}) {
  const [listOpen, setListOpen] = useState(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(autoOpenThreadId ?? null);
  const openThread = threads.find((t) => t.id === openThreadId);

  const unreadCount = threads.filter((t) =>
    isThreadUnread(t.last_message_at, t.last_sender_id, currentUserId, readTimestamps.get(t.id)),
  ).length;

  return (
    <>
      <button onClick={() => setListOpen(true)} className="btn-secondary relative px-4 py-2 text-[13px]">
        <IconInbox size={14} />
        Messages{threads.length > 0 ? ` (${threads.length})` : ""}
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-pink px-1 font-mono text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {listOpen && !openThread && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setListOpen(false)}
        >
          <div className="flex max-h-[70vh] w-full max-w-[440px] flex-col overflow-hidden rounded-card bg-bg2 shadow-card-hover">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <span className="font-heading text-[14px] font-bold">Attendee messages</span>
              <button onClick={() => setListOpen(false)} className="text-text2 transition hover:text-text">
                <IconX size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {threads.length === 0 ? (
                <p className="p-5 text-center text-[13px] text-text3">No one has reached out yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {threads.map((t) => {
                    const unread = isThreadUnread(t.last_message_at, t.last_sender_id, currentUserId, readTimestamps.get(t.id));
                    return (
                      <button
                        key={t.id}
                        onClick={() => setOpenThreadId(t.id)}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-bg3"
                      >
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate text-[13px] font-bold text-text">
                            {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green" />}
                            {t.member_name}
                          </p>
                          {t.last_message && <p className="mt-0.5 truncate text-[12px] text-text3">{t.last_message}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {openThread && (
        <EventDmModal
          eventId={eventId}
          threadId={openThread.id}
          initialMessages={messagesByThread[openThread.id] ?? []}
          currentUserId={currentUserId}
          otherPartyName={openThread.member_name}
          mode="staff"
          onClose={() => setOpenThreadId(null)}
        />
      )}
    </>
  );
}
