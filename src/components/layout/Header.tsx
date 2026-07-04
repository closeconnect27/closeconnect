import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const NAV_LINKS = [
  { href: "/communities", label: "communities" },
  { href: "/search", label: "search" },
];

// Sign-in/profile is a real, always-visible button at every viewport width --
// never hidden behind a hamburger. Research on real products (Meetup,
// BookMyShow) confirms "Log in"/"Sign up" stays permanently visible in the
// header regardless of width; hiding it below `sm` behind MobileMenu was the
// bug that made sign-in look "gone entirely" on narrow viewports. Primary nav
// links (communities/search) and Create still collapse on mobile, but
// they're covered by BottomNav there instead of a hamburger.
export function Header({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur-md sm:px-5">
      <div className="mx-auto flex max-w-5xl items-center gap-4 sm:gap-6">
        <Link href="/" className="shrink-0 font-heading text-lg font-extrabold">
          close<span className="text-green">.connect</span>
        </Link>

        <nav className="hidden items-center gap-6 text-[14px] font-medium text-text2 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-text">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {isLoggedIn && (
            <Link
              href="/communities/new"
              className="btn-primary hidden px-4 py-2 text-[13px] sm:inline-flex"
            >
              <IconPlus size={14} />
              Create
            </Link>
          )}
          <Link
            href={isLoggedIn ? "/profile" : "/login"}
            className="btn-secondary px-3.5 py-1.5 text-[13px] sm:px-4 sm:py-2"
          >
            {isLoggedIn ? "Profile" : "Sign in"}
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
