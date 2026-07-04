import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { MobileMenu } from "@/components/layout/MobileMenu";

const NAV_LINKS = [
  { href: "/communities", label: "communities" },
  { href: "/search", label: "search" },
];

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur-md sm:px-5">
      <div className="mx-auto flex max-w-5xl items-center gap-6">
        <Link href="/" className="font-heading text-lg font-extrabold">
          close<span className="text-green">.connect</span>
        </Link>

        <nav className="hidden items-center gap-6 text-[14px] font-medium text-text2 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-text">
              {link.label}
            </Link>
          ))}
        </nav>

        {/* ThemeToggle renders exactly once regardless of viewport -- two
            independent instances (one per breakpoint) would each hold their
            own React state and could desync from each other (and from the
            actually-applied theme) if the viewport crosses the breakpoint
            without a remount. */}
        <div className="ml-auto flex items-center gap-3">
          {user && (
            <Link href="/communities/new" className="btn-primary hidden px-4 py-2 text-[13px] sm:inline-flex">
              <IconPlus size={14} />
              Create
            </Link>
          )}
          <Link
            href={user ? "/profile" : "/login"}
            className="hidden text-[14px] font-medium text-text2 transition hover:text-text sm:inline"
          >
            {user ? "profile" : "sign in"}
          </Link>
          <ThemeToggle />
          <div className="sm:hidden">
            <MobileMenu links={NAV_LINKS} isLoggedIn={!!user} />
          </div>
        </div>
      </div>
    </header>
  );
}
