"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { Footer } from "@/components/layout/Footer";
import { HeaderSlotProvider, useHeaderSlotContent } from "@/components/layout/HeaderSlotContext";
import { track, identify } from "@/lib/mixpanel/client";

// The landing page (/) is a standalone full-bleed hero -- the header/bottom
// nav are chrome for navigating an app you're already inside of, not for a
// first-touch marketing page. Every other route keeps them. A client
// component specifically so usePathname can gate this without turning the
// (server) root layout's auth lookup into a per-route client fetch. Also
// the one place app-wide that sees every route change, so it doubles as
// the Mixpanel pageview/identify mount point -- no separate provider
// needed just for that.
export function SiteChrome({
  isLoggedIn,
  userId,
  children,
}: {
  isLoggedIn: boolean;
  userId: string | null;
  children: React.ReactNode;
}) {
  return (
    <HeaderSlotProvider>
      <SiteChromeInner isLoggedIn={isLoggedIn} userId={userId}>
        {children}
      </SiteChromeInner>
    </HeaderSlotProvider>
  );
}

function SiteChromeInner({
  isLoggedIn,
  userId,
  children,
}: {
  isLoggedIn: boolean;
  userId: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const slotContent = useHeaderSlotContent();

  useEffect(() => {
    track("page_view", { path: pathname });
  }, [pathname]);

  // Homepage is a single, non-scrolling screen (Hero + Footer sized to
  // exactly fill the viewport) -- html/body's own default (min-height,
  // free to grow/scroll) has to be overridden specifically for this route,
  // and undone again the moment it's left. A layout effect on html/body
  // classes, not a CSS-only rule, since "only lock scroll on this one
  // route" needs the route to actually be known -- there's no selector
  // that can express that.
  useEffect(() => {
    if (!isHome) return;
    document.documentElement.classList.add("home-no-scroll");
    document.body.classList.add("home-no-scroll");
    return () => {
      document.documentElement.classList.remove("home-no-scroll");
      document.body.classList.remove("home-no-scroll");
    };
  }, [isHome]);

  // Identifies once per real login, not on every render -- re-running
  // identify() on an unchanged userId would just re-send the same
  // $identify/$set calls on every route change for no reason.
  const identifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (userId && identifiedRef.current !== userId) {
      identifiedRef.current = userId;
      identify(userId);
    }
  }, [userId]);

  return (
    <>
      {!isHome && <Header isLoggedIn={isLoggedIn} userId={userId} pathname={pathname} slot={slotContent} />}
      {/* pb-16 clears the fixed BottomNav on mobile so page content never
          sits underneath it; sm:pb-0 since BottomNav hides itself there.
          Only needed when BottomNav is actually rendered. */}
      <div className={`flex min-h-0 flex-1 flex-col ${isHome ? "h-dvh overflow-hidden" : "pb-16 sm:pb-0"}`}>
        {children}
        <Footer />
      </div>
      {!isHome && <BottomNav isLoggedIn={isLoggedIn} />}
    </>
  );
}
