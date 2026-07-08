"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Lets a page inject content into the middle of the global Header (e.g. an
// inline search bar on /communities and /events) without Header itself
// needing to know about every page that wants this -- Header just renders
// whatever's currently registered, or its default nav links if nothing is.
const HeaderSlotContext = createContext<{
  content: ReactNode;
  setContent: (content: ReactNode) => void;
} | null>(null);

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  return <HeaderSlotContext.Provider value={{ content, setContent }}>{children}</HeaderSlotContext.Provider>;
}

export function useHeaderSlotContent() {
  const ctx = useContext(HeaderSlotContext);
  return ctx?.content ?? null;
}

/** Called from within a page to put `content` in the header while that page
 * is mounted -- automatically cleared on unmount/navigation so the next
 * page doesn't inherit it. */
export function useSetHeaderSlot(content: ReactNode) {
  const ctx = useContext(HeaderSlotContext);
  useEffect(() => {
    ctx?.setContent(content);
    return () => ctx?.setContent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);
}
