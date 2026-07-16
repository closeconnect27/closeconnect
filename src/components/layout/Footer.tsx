import Link from "next/link";
import { IconLifebuoy } from "@tabler/icons-react";

// Rendered on every page (mounted once in SiteChrome, inside the same
// wrapper as {children}) so support/legal links are reachable from
// anywhere, not just a dead-end marketing footer on the home page.
//
// `dark` is for the homepage only: Hero.tsx is a fixed near-black photo
// backdrop regardless of site theme (text over a photo needs to stay
// legible the same way in both themes), so this footer's normal
// theme-token colors (border-border/text-text2/text-text3, which flip
// light in light mode) would visibly contradict it -- a light-grey strip
// directly under a black hero. `dark` swaps in fixed dark-theme-matching
// colors instead of theme tokens, only for that one route.
export function Footer({ dark = false }: { dark?: boolean } = {}) {
  return (
    <footer
      className={`mt-auto px-5 py-6 sm:px-8 ${dark ? "border-t border-white/10 bg-[#08080a]" : "border-t border-border"}`}
    >
      <div
        className={`mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 text-[13px] ${dark ? "text-white/50" : "text-text3"}`}
      >
        <a
          href="mailto:closeconnect27@gmail.com"
          className={`flex items-center gap-1.5 font-medium transition hover:text-green ${dark ? "text-white/70" : "text-text2"}`}
        >
          <IconLifebuoy size={16} />
          Support
        </a>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/terms" className={`transition ${dark ? "hover:text-white/80" : "hover:text-text2"}`}>
            Terms of Service
          </Link>
          <Link href="/privacy" className={`transition ${dark ? "hover:text-white/80" : "hover:text-text2"}`}>
            Privacy Policy
          </Link>
          <span>© {new Date().getFullYear()} Close.Connect</span>
        </div>
      </div>
    </footer>
  );
}
