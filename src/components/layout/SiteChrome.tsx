"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { Footer } from "@/components/layout/Footer";
import { HeaderSlotProvider, useHeaderSlotContent } from "@/components/layout/HeaderSlotContext";
import { track, identify } from "@/lib/mixpanel/client";
import { initGoogleAnalytics, trackPageview } from "@/lib/ga/client";
import { useProfileDmBadge } from "@/lib/useProfileDmBadge";

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
  // A group's chat is a full-screen, in-the-moment view (like a native
  // chat app's own thread screen) -- Header, BottomNav (Events/
  // Communities/Create/Profile), and Footer all give up their space to it
  // rather than competing for room around a small fixed-height chat box.
  // The page's own "← Back to community" link already covers what Header
  // would have (a way back out).
  // /messages (the DM inbox, list + open thread side by side) is the same
  // deal -- a WhatsApp-Web-style split pane needs the full viewport height
  // to lay out correctly, not the normal padded/scrolling page flow.
  const isChatPage = /^\/communities\/[^/]+\/groups\/[^/]+$/.test(pathname) || /^\/messages(\/.*)?$/.test(pathname);
  // /login is the native app's actual entry screen now (see /app's
  // redirect gate) -- a header with its own redundant "Sign in" button
  // floating above the sign-in card itself reads as an oversight, and a
  // full-screen focused card is what a native app's own login screen
  // looks like anyway.
  const isLoginPage = pathname === "/login";
  const isImmersivePage = isChatPage || isLoginPage;
  const slotContent = useHeaderSlotContent();
  // One shared subscription for both Header's MessagesBell and BottomNav --
  // each calling useProfileDmBadge itself independently opened a Realtime
  // channel with the identical name (`profile-dm-badge-${userId}`, the
  // browser Supabase client being a singleton), and the second `.on()` call
  // threw synchronously since the channel was already joining, crashing
  // every page that rendered both at once (every page except home).
  const hasUnreadMessages = useProfileDmBadge(userId);

  useEffect(() => {
    track("page_view", { path: pathname });
    initGoogleAnalytics();
    trackPageview(pathname);
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
      {!isHome && !isImmersivePage && (
        <Header isLoggedIn={isLoggedIn} userId={userId} pathname={pathname} slot={slotContent} hasUnreadMessages={hasUnreadMessages} />
      )}
      {/* pb-16 clears the fixed BottomNav on mobile so page content never
          sits underneath it; sm:pb-0 since BottomNav hides itself there.
          Only needed when BottomNav is actually rendered (not isHome,
          not isImmersivePage). isImmersivePage gets the same hard-capped
          h-viewport-safe as isHome -- a chat layout (messages' split pane,
          a group's thread) needs a real bounded height to lay out against,
          the same reasoning isHome's own comment already gives; without
          it there's nothing stopping the page from just growing past the
          viewport instead of scrolling internally. */}
      <div
        className={`flex min-h-0 flex-1 flex-col ${isHome || isImmersivePage ? "h-viewport-safe overflow-hidden" : "pb-16 sm:pb-0"}`}
      >
        {children}
        {/* The native app hides this entirely -- a persistent
            Support/phone-numbers/Terms/copyright strip on every screen is
            website chrome, not app chrome. Same links live on the Profile
            page instead, same place a native app's own Settings screen
            would put them. */}
        {!isImmersivePage && !Capacitor.isNativePlatform() && <Footer dark={isHome} />}
      </div>
      {!isHome && !isImmersivePage && <BottomNav isLoggedIn={isLoggedIn} hasUnreadMessages={hasUnreadMessages} />}
    </>
  );
}
