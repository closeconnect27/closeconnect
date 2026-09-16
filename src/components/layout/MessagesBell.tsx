"use client";

import Link from "next/link";
import { IconMessageCircle } from "@tabler/icons-react";
import { useProfileDmBadge } from "@/lib/useProfileDmBadge";

// Header counterpart to NotificationBell -- simpler than it though: just a
// boolean red dot (useProfileDmBadge), not an unread count, and a plain
// link to /messages rather than its own dropdown panel (the inbox itself,
// with its Primary/Requests tabs, is the panel).
export function MessagesBell({ userId }: { userId: string }) {
  const hasUnread = useProfileDmBadge(userId);

  return (
    <Link
      href="/messages"
      aria-label="Messages"
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-text2 transition hover:bg-bg3 hover:text-text"
    >
      <IconMessageCircle size={19} />
      {hasUnread && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-pink" />}
    </Link>
  );
}
