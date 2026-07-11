"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBell } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";
import type { Notification } from "@/lib/queries/notifications";

// Client-side, RLS-scoped reads (notifications_select_own) -- same pattern
// as GroupChat's realtime subscription, just for one user's own feed
// instead of one group's messages. Unread count stays live via realtime
// INSERT events rather than polling; the list itself only loads when the
// panel opens, not on every mount.
export function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null)
      .then(({ count }) => setUnreadCount(count ?? 0));
  }, [supabase, userId]);

  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          setUnreadCount((c) => c + 1);
          setNotifications((prev) => (prev ? [payload.new as Notification, ...prev] : prev));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && notifications === null) {
      setLoading(true);
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      setNotifications((data as Notification[]) ?? []);
      setLoading(false);
    }
  }

  async function handleNotificationClick(n: Notification) {
    setOpen(false);
    if (!n.read_at) {
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? prev);
      markNotificationRead(n.id).catch(() => {});
    }
    if (n.link) router.push(n.link);
  }

  function handleMarkAllRead() {
    setUnreadCount(0);
    setNotifications((prev) => prev?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? prev);
    markAllNotificationsRead().catch(() => {});
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-text2 transition hover:bg-bg3 hover:text-text"
      >
        <IconBell size={19} />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-pink px-1 font-mono text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-bg2 shadow-card-hover">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-heading text-[14px] font-bold">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-[12px] font-medium text-green hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-[13px] text-text3">Loading…</p>
            ) : !notifications || notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-text3">Nothing yet.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleNotificationClick(n)}
                  className={`block w-full border-b border-border px-4 py-3 text-left transition last:border-b-0 hover:bg-bg3 ${
                    n.read_at ? "" : "bg-green-tint"
                  }`}
                >
                  <p className="text-[13px] font-bold text-text">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-[12px] text-text2">{n.body}</p>}
                  <p className="mt-1 font-mono text-[10px] text-text3">{formatRelativeTime(n.created_at)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
