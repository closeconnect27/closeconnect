"use client";

import { useState } from "react";
import { IconMessage2 } from "@tabler/icons-react";
import { DmModal } from "@/components/communities/DmModal";
import type { DmThreadSummary, DmMessage } from "@/lib/queries/dm";

// Owner/moderator-facing inbox for "Reach out to admin" -- lives in the
// Members tab, only rendered at all once at least one member has ever
// reached out (page.tsx only fetches threads for isStaff).
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
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const openThread = threads.find((t) => t.id === openThreadId);

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-1.5 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">
        <IconMessage2 size={13} />
        Member messages
      </h2>
      <div className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg2">
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
    </div>
  );
}
