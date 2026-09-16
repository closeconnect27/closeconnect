import Link from "next/link";
import { IconMessageCircle } from "@tabler/icons-react";

// Header counterpart to NotificationBell -- simpler than it though: just a
// boolean red dot, not an unread count, and a plain link to /messages
// rather than its own dropdown panel (the inbox itself, with its Primary/
// Requests tabs, is the panel). `hasUnread` comes from SiteChromeInner's
// single shared useProfileDmBadge call (see BottomNav.tsx's comment) --
// this component doesn't call the hook itself, since BottomNav renders
// alongside it on every non-home page and a second independent hook
// instance opening a same-named Realtime channel crashed the whole page.
export function MessagesBell({ hasUnread }: { hasUnread: boolean }) {
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
