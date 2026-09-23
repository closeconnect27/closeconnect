"use client";

import { usePathname } from "next/navigation";
import { IconEdit } from "@tabler/icons-react";
import { MessagesInbox } from "@/components/messages/MessagesInbox";
import type { ProfileDmThreadSummary } from "@/lib/queries/profileDm";

// WhatsApp Web/Instagram-DM-style split pane: the thread list sits in a
// fixed-width sidebar that's always there on desktop, and the selected
// conversation fills the rest. On a narrow viewport there's only room for
// one pane at a time, so this shows the list OR the open thread based on
// the current route -- /messages itself means "no thread open," anything
// under /messages/[id] means one is.
export function MessagesShell({
  threads,
  currentUserId,
  readTimestamps,
  myName,
  children,
}: {
  threads: ProfileDmThreadSummary[];
  currentUserId: string;
  readTimestamps: Map<string, string>;
  myName: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isThreadOpen = pathname !== "/messages";

  return (
    <div className="mx-auto flex w-full min-h-0 max-w-6xl flex-1 overflow-hidden">
      <aside
        className={`w-full shrink-0 flex-col overflow-hidden border-border sm:flex sm:w-[360px] sm:border-r ${
          isThreadOpen ? "hidden sm:flex" : "flex"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-6 sm:px-5">
          <h1 className="min-w-0 flex-1 truncate font-heading text-[18px] font-bold text-text">{myName ?? " "}</h1>
          <button
            type="button"
            onClick={() => document.getElementById("dm-search-input")?.focus()}
            aria-label="New message"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border2 text-text2 transition hover:border-green hover:text-green"
          >
            <IconEdit size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
          <MessagesInbox threads={threads} currentUserId={currentUserId} readTimestamps={readTimestamps} />
        </div>
      </aside>
      <section className={`min-w-0 flex-1 flex-col ${isThreadOpen ? "flex" : "hidden sm:flex"}`}>{children}</section>
    </div>
  );
}
