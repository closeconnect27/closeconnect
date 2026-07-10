"use client";

import { useState } from "react";

const TABS = [
  { key: "about", label: "About" },
  { key: "groups", label: "Groups" },
  { key: "members", label: "Members" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// Post-join layout only (SPEC: "once they have joined there should be 3
// cols" -- tabs here, not literal desktop columns, since this app is
// single-column/mobile-first throughout). Server-rendered content is
// passed in as children per tab rather than fetched here, so this stays a
// plain client component with no data-fetching of its own.
export function CommunityTabs({
  groups,
  about,
  members,
}: {
  groups: React.ReactNode;
  about: React.ReactNode;
  members: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("about");
  const content = { groups, about, members }[active];

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-1 rounded-full border border-border2 bg-bg3 p-1">
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
      {content}
    </div>
  );
}
