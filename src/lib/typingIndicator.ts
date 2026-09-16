"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Auto-clear window for a stale "typing" signal that never got a matching
// "stopped" (a tab closed mid-type, a dropped connection, etc.) -- without
// this the other party's "X is typing…" text could get stuck on forever.
const STOPPED_TIMEOUT_MS = 4000;

/** One realtime broadcast channel per thread, `{config:{broadcast:{self:
 * false}}}` so a sender never sees their own typing event echoed back.
 * Broadcast (not postgres_changes) since typing state is intentionally
 * ephemeral -- nothing about it needs to persist in a table. Shared shape
 * across every DM kind (community/event/profile) via `kind` in the channel
 * name, though only the new profile-DM UI actually wires this in for now. */
export function useTypingIndicator(kind: "community" | "event" | "profile", threadId: string | null, myUserId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [otherTyping, setOtherTyping] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`typing-${kind}-${threadId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, (payload) => {
        if ((payload.payload as { userId?: string })?.userId === myUserId) return;
        setOtherTyping(true);
        if (clearTimer.current) clearTimeout(clearTimer.current);
        clearTimer.current = setTimeout(() => setOtherTyping(false), STOPPED_TIMEOUT_MS);
      })
      .on("broadcast", { event: "stopped" }, (payload) => {
        if ((payload.payload as { userId?: string })?.userId === myUserId) return;
        if (clearTimer.current) clearTimeout(clearTimer.current);
        setOtherTyping(false);
      })
      .subscribe();
    channelRef.current = channel;

    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      setOtherTyping(false);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [kind, threadId, myUserId, supabase]);

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      channelRef.current?.send({
        type: "broadcast",
        event: isTyping ? "typing" : "stopped",
        payload: { userId: myUserId },
      });
    },
    [myUserId],
  );

  return { otherTyping, sendTyping };
}
