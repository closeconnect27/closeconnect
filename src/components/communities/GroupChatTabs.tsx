"use client";

import { useState } from "react";

const TABS = [
  { key: "chat", label: "Chat" },
  { key: "media", label: "Media & links" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// Same tab-switcher shape as CommunityTabs -- server-rendered content
// passed in as children per tab, this stays a plain client component with
// no data-fetching of its own. Defaults to "chat" so opening a group never
// changes what a returning user already expects to see first.
//
// This whole component fills its parent (flex-1, propagated from the page
// down through this to GroupChat -- see that component's own h-full ->
// flex-1 comment) rather than sizing itself off content, so the chat page
// can occupy the full screen instead of a small fixed-height box with
// dead space below it.
export function GroupChatTabs({ chat, media }: { chat: React.ReactNode; media: React.ReactNode }) {
  const [active, setActive] = useState<TabKey>("chat");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="mb-4 flex shrink-0 gap-1 rounded-full border border-border2 bg-bg3 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={
              active === t.key
                ? "flex-1 rounded-full bg-green px-4 py-2 text-[13px] font-bold text-green-dark transition"
                : "flex-1 rounded-full px-4 py-2 text-[13px] font-medium text-text2 transition hover:text-text"
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={active === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>{chat}</div>
      <div className={active === "media" ? "min-h-0 flex-1 overflow-y-auto" : "hidden"}>{media}</div>
    </div>
  );
}
