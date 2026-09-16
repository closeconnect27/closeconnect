// Rendered on every page (mounted once in SiteChrome, inside the same
// wrapper as {children}). Support/legal/About links used to live here --
// they've moved into the header's MoreMenu (sandwich button), reachable
// from anywhere without scrolling to the bottom of a page, so this is just
// the copyright line now.
//
// `dark` is for the homepage only: Hero.tsx is a fixed near-black photo
// backdrop regardless of site theme (text over a photo needs to stay
// legible the same way in both themes), so this footer's normal
// theme-token colors (which flip light in light mode) would visibly
// contradict it -- a light-grey strip directly under a black hero. `dark`
// swaps in fixed dark-theme-matching colors instead of theme tokens, only
// for that one route.
export function Footer({ dark = false }: { dark?: boolean } = {}) {
  return (
    <footer className={`mt-auto px-5 py-6 text-center sm:px-8 ${dark ? "border-t border-white/10 bg-[#08080a]" : "border-t border-border"}`}>
      <p className={`text-[13px] ${dark ? "text-white/50" : "text-text3"}`}>© {new Date().getFullYear()} CloseConnect</p>
    </footer>
  );
}
