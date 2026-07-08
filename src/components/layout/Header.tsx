import Link from "next/link";
import { IconPlus, IconCalendarEvent, IconUsers } from "@tabler/icons-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const NAV_LINKS = [
  { href: "/events", label: "Events" },
  { href: "/communities", label: "Communities" },
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
  pathname,
  slot,
}: {
  isLoggedIn: boolean;
  pathname?: string;
  slot?: React.ReactNode;
}) {
  const contextualLink =
    pathname === "/communities"
      ? { href: "/events", label: "Events", icon: IconCalendarEvent }
      : pathname === "/events"
        ? { href: "/communities", label: "Communities", icon: IconUsers }
        : null;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 px-5 py-4 backdrop-blur-md sm:px-8">
      <div className="flex items-center gap-4 sm:gap-6">
        <Link href="/" className="shrink-0 font-heading text-[20px] font-extrabold">
          Close<span className="text-green">connect</span>
        </Link>

        <div className="flex min-w-0 flex-1 justify-center">
          {slot ?? (
            <nav className="hidden items-center gap-7 text-[15px] font-medium text-text2 sm:flex">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="transition hover:text-text">
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {slot && contextualLink && (
            <Link href={contextualLink.href} className="btn-secondary hidden px-4 py-2.5 text-[14px] sm:inline-flex">
              <contextualLink.icon size={15} />
              {contextualLink.label}
            </Link>
          )}
          <Link
            href={isLoggedIn ? "/profile" : "/login"}
            className="btn-secondary px-4 py-2 text-[14px] sm:px-4 sm:py-2.5"
          >
            {isLoggedIn ? "Profile" : "Sign in"}
          </Link>
          <Link href="/create" className="btn-primary hidden px-5 py-2.5 text-[14px] sm:inline-flex">
            <IconPlus size={15} />
            Create
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
