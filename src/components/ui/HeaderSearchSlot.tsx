"use client";

import { useMemo } from "react";
import { useSetHeaderSlot } from "@/components/layout/HeaderSlotContext";
import { PageSearch } from "@/components/ui/PageSearch";

/** Puts this page's inline search bar in the global header instead of the
 * page body -- a thin client wrapper since the server page component
 * itself can't call the useSetHeaderSlot hook directly. Memoized so the
 * element passed to useSetHeaderSlot is referentially stable across
 * re-renders (registering it triggers a context update, which re-renders
 * this component's subtree -- a fresh element on every render would
 * re-fire the registration effect every time, looping). */
export function HeaderSearchSlot({ basePath, placeholder }: { basePath: string; placeholder: string }) {
  const content = useMemo(() => <PageSearch basePath={basePath} placeholder={placeholder} />, [basePath, placeholder]);
  useSetHeaderSlot(content);
  return null;
}
