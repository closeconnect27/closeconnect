"use client";

import { useState } from "react";
import { IconInbox, IconX } from "@tabler/icons-react";
import { DmModal } from "@/components/communities/DmModal";
import type { DmThreadSummary, DmMessage } from "@/lib/queries/dm";

// Owner/moderator-facing entry point for "Reach out to admin" -- a
// standalone button in the community's action row (next to Edit/
// Analytics), not buried inside the Members tab -- that placement was a
// real "I only get the notification but no place to view it" complaint,
// since nothing about the Members tab reads as "this is where messages
// are." Always rendered for staff (even with zero threads yet) so the
// feature itself is discoverable before anyone's used it.
export function DmInboxSection({
  communityId,
  threads,
  messagesByThread,
  currentUserId,
}: {
  communityId: string;
  threads: DmThreadSummary[];
  messagesByThread: Record<string, DmMessage[]>;
  currentUserId: string;
}) {
  const [listOpen, setListOpen] = useState(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const openThread = threads.find((t) => t.id === openThreadId);

  return (
    <>
      <button onClick={() => setListOpen(true)} className="btn-secondary px-4 py-2 text-[13px]">
        <IconInbox size={14} />
        Messages{threads.length > 0 ? ` (${threads.length})` : ""}
      </button>

      {listOpen && !openThread && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setListOpen(false)}
        >
          <div className="flex max-h-[70vh] w-full max-w-[440px] flex-col overflow-hidden rounded-card bg-bg2 shadow-card-hover">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <span className="font-heading text-[14px] font-bold">Member messages</span>
              <button onClick={() => setListOpen(false)} className="text-text2 transition hover:text-text">
                <IconX size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {threads.length === 0 ? (
                <p className="p-5 text-center text-[13px] text-text3">No one has reached out yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {threads.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setOpenThreadId(t.id)}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-bg3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-text">{t.member_name}</p>
                        {t.last_message && <p className="mt-0.5 truncate text-[12px] text-text3">{t.last_message}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {openThread && (
        <DmModal
          communityId={communityId}
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
