"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCalendarEvent,
  IconUsers,
  IconSearch,
  IconCirclePlus,
  IconUserCircle,
} from "@tabler/icons-react";

// Bottom tab bar for primary mobile destinations, replacing the old
// hamburger-only MobileMenu. Research on real products (BookMyShow's mobile
// nav, Nielsen Norman Group data on hamburger discoverability -- hidden nav
// is only found in ~57% of cases where needed vs 86% for always-visible
// combo nav) shows bottom tabs beat a hamburger for a handful of frequent,
// thumb-reachable destinations. Hidden entirely at `sm`+ where the header's
// horizontal nav already covers the same destinations.
export function BottomNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const pathname = usePathname();

  const items = [
    { href: "/events", label: "Events", icon: IconCalendarEvent, exact: false },
    { href: "/communities", label: "Communities", icon: IconUsers, exact: false },
    { href: "/search", label: "Search", icon: IconSearch, exact: false },
    {
      href: isLoggedIn ? "/create" : `/login?redirect=${encodeURIComponent("/create")}`,
      label: "Create",
      icon: IconCirclePlus,
      exact: true,
    },
    {
      href: isLoggedIn ? "/profile" : "/login",
      label: isLoggedIn ? "Profile" : "Sign in",
      icon: IconUserCircle,
      exact: true,
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
            <Icon size={22} stroke={isActive ? 2.2 : 1.8} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
