"use client";

import { useEffect, useState } from "react";
import { IconLink, IconCheck } from "@tabler/icons-react";

// No toast system existed anywhere in the app before this (checked --
// there's no "share link" feature from an earlier phase to reuse either,
// despite the brief's assumption; this is new, self-contained UI). A
// single ephemeral confirmation next to the button covers this one use
// case without introducing a global toast provider/queue nothing else
// needs yet.
// `path` (not a full URL) on purpose -- this renders inside server
// components, where `window.location.origin` doesn't exist yet at render
// time. Resolving the origin here, at click-time in the browser, is the
// only place that's actually available.
export function CopyLinkButton({ path, label = "Copy invite link" }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function handleClick() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard API can fail (permissions, insecure context) -- fall back
      // to a manual-select prompt rather than pretending it worked.
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className="relative inline-flex">
      <button onClick={handleClick} className="btn-secondary px-4 py-2 text-[13px]">
        {copied ? <IconCheck size={14} className="text-green" /> : <IconLink size={14} />}
        {label}
      </button>
      {copied && (
        <div
          role="status"
          className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-text px-3 py-1.5 text-[12px] font-medium text-bg shadow-card-hover"
        >
          Link copied
        </div>
      )}
    </div>
  );
}
