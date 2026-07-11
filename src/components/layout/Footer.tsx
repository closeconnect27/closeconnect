import Link from "next/link";
import { IconLifebuoy } from "@tabler/icons-react";

// Rendered on every page (mounted once in SiteChrome, inside the same
// wrapper as {children}) so support/legal links are reachable from
// anywhere, not just a dead-end marketing footer on the home page.
export function Footer() {
  return (
    <footer className="mt-auto border-t border-border px-5 py-6 sm:px-8">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 text-[13px] text-text3">
        <a
          href="mailto:closeconnect27@gmail.com"
          className="flex items-center gap-1.5 font-medium text-text2 transition hover:text-green"
        >
          <IconLifebuoy size={16} />
          Support
        </a>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/terms" className="transition hover:text-text2">
            Terms of Service
          </Link>
          <Link href="/privacy" className="transition hover:text-text2">
            Privacy Policy
          </Link>
          <span>© {new Date().getFullYear()} Close.Connect</span>
        </div>
      </div>
    </footer>
  );
}
