import Link from "next/link";
import { IconPlus, IconCalendarEvent, IconUsers, IconHome } from "@tabler/icons-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { MessagesBell } from "@/components/layout/MessagesBell";
import { MoreMenu } from "@/components/layout/MoreMenu";
import { WebOnly } from "@/components/system/PlatformGate";

const NAV_LINKS = [
  { href: "/feed", label: "Feed" },
  { href: "/events", label: "Events" },
  { href: "/communities", label: "Communities" },
];

// Same 3 sections, with icons -- used for the collapsed contextual links
// shown when a page's slot (search bar) replaces the plain nav row below.
const ICON_LINKS = [
  { href: "/feed", label: "Feed", icon: IconHome },
  { href: "/events", label: "Events", icon: IconCalendarEvent },
  { href: "/communities", label: "Communities", icon: IconUsers },
];

// Sign-in/profile is a real, always-visible button at every viewport width --
// never hidden behind a hamburger. Research on real products (Meetup,
// BookMyShow) confirms "Log in"/"Sign up" stays permanently visible in the
// header regardless of width; hiding it below `sm` behind MobileMenu was the
// bug that made sign-in look "gone entirely" on narrow viewports. Primary nav
// links (communities/events) and Create still collapse on mobile, but
// they're covered by BottomNav there instead of a hamburger.
//
// `slot` lets a page (via useSetHeaderSlot) put its own content -- an
// inline search bar on /communities and /events, a back button on a
// detail page, etc -- in the middle of the header in place of the default
// nav links. When a slot is active, the nav collapses to a single
// contextual link to the *other* main section (so switching between
// Events/Communities from a page whose header is showing search/back
// isn't lost, it's just one link instead of two) rather than showing both
// alongside whatever the page put there.
export function Header({
  isLoggedIn,
  userId,
  pathname,
  slot,
}: {
  isLoggedIn: boolean;
  userId: string | null;
  pathname?: string;
  slot?: React.ReactNode;
}) {
  // When a page's slot (search bar) replaces the plain nav row, the other
  // two main sections stay reachable as compact icon+label links here --
  // not just "the one other main section" (the old two-way Events<->
  // Communities-only version left Feed unreachable from either page's
  // header once its search slot was active).
  const otherLinks = ICON_LINKS.filter((link) => link.href !== pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 px-5 py-4 backdrop-blur-md sm:px-8">
      <div className="flex items-center gap-4 sm:gap-6">
        <Link href="/" className="shrink-0 font-heading text-[20px] font-extrabold">
          Close<span className="text-green">connect</span>
        </Link>

        {/* Below sm, a slot (the search bar) moves to its own full-width
            row underneath instead of sharing this row -- squeezed between
            the logo and profile/bell/theme (all shrink-0, all
            always-visible on mobile by design), it had almost no width
            left on a narrow phone and was effectively unusable. Desktop
            keeps the original inline placement, where there's room. */}
        <div className="hidden min-w-0 flex-1 justify-center sm:flex">
          {slot ?? (
            <nav className="flex items-center gap-7 text-[15px] font-medium text-text2">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="transition hover:text-text">
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0 sm:gap-3">
          {slot &&
            otherLinks.map((link) => (
              <Link key={link.href} href={link.href} className="btn-secondary hidden px-4 py-2.5 text-[14px] lg:inline-flex">
                <link.icon size={15} />
                {link.label}
              </Link>
            ))}
          <Link
            href={
              isLoggedIn
                ? "/profile"
                : `/login${pathname ? `?redirect=${encodeURIComponent(pathname)}` : ""}`
            }
            className="btn-secondary px-4 py-2 text-[14px] sm:px-4 sm:py-2.5"
          >
            {isLoggedIn ? "Profile" : "Sign in"}
          </Link>
          <Link href="/create" className="btn-primary hidden px-5 py-2.5 text-[14px] sm:inline-flex">
            <IconPlus size={15} />
            Create
          </Link>
          {isLoggedIn && userId && <MessagesBell userId={userId} />}
          {isLoggedIn && userId && <NotificationBell userId={userId} />}
          <MoreMenu />
          {/* Relocated to the Profile page in the app -- a native app's
              theme toggle lives in Settings, not floating in the header
              on every screen. */}
          <WebOnly>
            <ThemeToggle />
          </WebOnly>
        </div>
      </div>

      {slot && <div className="mt-3 sm:hidden">{slot}</div>}
    </header>
  );
}
