"use client";

import { Fragment } from "react";

// Port of reference_current_index.html's linkify(): bare https:// URLs and
// @handle mentions inside plain description text become clickable links.
// The original built raw HTML strings via innerHTML; this builds real React
// nodes instead -- same matching rules, but text stays text (React escapes
// it by construction) and only the matched URL/handle ever becomes an
// href, so there's no way for the rest of the string to inject markup.
const LINK_PATTERN = /(https?:\/\/[^\s<>"]+)|@([A-Za-z0-9_.]{1,30})/g;

export function Linkify({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(LINK_PATTERN)) {
    const [full, url, handle] = match;
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));

    if (url) {
      parts.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="break-all text-green underline"
        >
          {url}
        </a>,
      );
    } else if (handle) {
      parts.push(
        <a
          key={key++}
          href={`https://instagram.com/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-green"
        >
          @{handle}
        </a>,
      );
    }
    lastIndex = index + full.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return <Fragment>{parts}</Fragment>;
}
