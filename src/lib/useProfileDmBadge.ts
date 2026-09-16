"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getProfileDmThreads } from "@/lib/queries/profileDm";
import { getDmReadTimestamps, isThreadUnread } from "@/lib/queries/dmReads";

/** Shared by MessagesBell (header) and BottomNav's Messages tab -- a single
 * boolean, not a count: true when there's anything this viewer hasn't
 * looked at yet, either an incoming pending request or an unread message
 * in an already-accepted (or self-requested) thread. Recomputed on every
 * relevant realtime event rather than tracked incrementally -- refetching
 * sidesteps every edge case incremental tracking would need to get right
 * (a message arriving for a thread already marked read elsewhere, a
 * request that gets declined, etc), and the underlying query is cheap for
 * a normal user's handful of threads.
 *
 * Realtime deliveries for profile_dm_messages/profile_dm_threads are
 * already RLS-scoped to this user's own threads, so no table filter is
 * needed there -- only the dm_reads subscription (every participant can
 * see every read marker on a shared thread, 0125) needs an explicit
 * user_id filter, so the OTHER party marking read doesn't also trigger a
 * refetch here. */
export function useProfileDmBadge(userId: string | null) {
  const [hasUnread, setHasUnread] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  const refresh = useCallback(async () => {
    // No synchronous setState here for the logged-out case -- initial state
    // is already `false`, and both callers below only invoke refresh() at
    // all once userId is truthy (react-hooks/set-state-in-effect flags a
    // setState call that can run before this function's first await as
    // equivalent to calling it directly in the effect body).
    if (!userId) return;
    try {
      const threads = await getProfileDmThreads(supabase, userId);
      const hasIncomingRequest = threads.some((t) => t.status === "pending" && t.recipient_id === userId);
      if (hasIncomingRequest) {
        setHasUnread(true);
        return;
      }
      const primary = threads.filter((t) => t.status === "accepted" || t.requester_id === userId);
      const readTimestamps = await getDmReadTimestamps(
        supabase,
        userId,
        "profile",
        primary.map((t) => t.id),
      );
      const hasUnreadMessage = primary.some((t) =>
        isThreadUnread(t.last_message_at, t.last_message_sender_id, userId, readTimestamps.get(t.id)),
      );
      setHasUnread(hasUnreadMessage);
    } catch {
      // Best-effort -- a failed check just means the dot doesn't update
      // this cycle, not a broken feature.
    }
  }, [userId, supabase]);

  // One effect, not two -- the initial load happens from the channel's own
  // subscribe() status callback (fired once, on "SUBSCRIBED") rather than a
  // separate bare `refresh()` call at the effect's top level. Every call to
  // refresh() below is inside a callback (a postgres_changes handler or
  // this status callback), never directly in the effect body itself, same
  // shape as NotificationBell's own `.then(() => setUnreadCount(...))`.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`profile-dm-badge-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profile_dm_messages" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "profile_dm_threads" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_reads", filter: `user_id=eq.${userId}` }, () => refresh())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase, refresh]);

  return hasUnread;
}
