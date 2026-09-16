"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconHome,
  IconCalendarEvent,
  IconUsers,
  IconMessageCircle,
  IconUserCircle,
} from "@tabler/icons-react";

// Bottom tab bar for primary mobile destinations, replacing the old
// hamburger-only MobileMenu. Research on real products (BookMyShow's mobile
// nav, Nielsen Norman Group data on hamburger discoverability -- hidden nav
// is only found in ~57% of cases where needed vs 86% for always-visible
// combo nav) shows bottom tabs beat a hamburger for a handful of frequent,
// thumb-reachable destinations. Hidden entirely at `sm`+ where the header's
// horizontal nav already covers the same destinations.
//
// Create tab replaced with Messages (individual DMs, /messages) -- every
// one of Feed/Events/Communities already has its own "+"/"New X" entry
// point in its own page header, so a global Create tab was redundant; this
// is the same trade mobile's own bottom tab bar made this session (Create
// -> Inbox). Messages carries the same red-dot badge as the header's
// MessagesBell -- `hasUnreadMessages` is passed down from SiteChromeInner
// (a single useProfileDmBadge call shared by both), not read from its own
// hook call here: two independent hook instances each opened a Realtime
// channel with the identical name (`profile-dm-badge-${userId}`), and
// since the browser Supabase client is a singleton, the second `.on()`
// call threw synchronously ("cannot add postgres_changes callbacks ...
// after subscribe()") in an effect, uncaught -- crashing every page that
// rendered both Header and BottomNav at once (i.e. every page except home,
// which renders neither).
export function BottomNav({
  isLoggedIn,
  hasUnreadMessages,
}: {
  isLoggedIn: boolean;
  hasUnreadMessages: boolean;
}) {
  const pathname = usePathname();

  const items = [
    { href: "/feed", label: "Feed", icon: IconHome, exact: false, badge: false },
    { href: "/events", label: "Events", icon: IconCalendarEvent, exact: false, badge: false },
    { href: "/communities", label: "Communities", icon: IconUsers, exact: false, badge: false },
    {
      href: isLoggedIn ? "/messages" : "/login?redirect=/messages",
      label: "Messages",
      icon: IconMessageCircle,
      exact: true,
      badge: isLoggedIn && hasUnreadMessages,
    },
    {
      // ?redirect=<current path> -- signing in from here (rather than one
      // of the feature-specific "sign in to do X" CTAs, which already do
      // this) used to always land back on / regardless of which tab this
      // was clicked from, same bug as Header's Sign in button.
      href: isLoggedIn ? "/profile" : `/login?redirect=${encodeURIComponent(pathname)}`,
      label: isLoggedIn ? "Profile" : "Sign in",
      icon: IconUserCircle,
      exact: true,
      badge: false,
    },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-bg/95 backdrop-blur-md sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const path = item.href.split("?")[0];
        const isActive = item.exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition ${
              isActive ? "text-green" : "text-text3"
            }`}
          >
            <span className="relative">
              <Icon size={22} stroke={isActive ? 2.2 : 1.8} />
              {item.badge && <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-pink" />}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
