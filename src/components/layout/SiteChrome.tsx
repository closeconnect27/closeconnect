"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";

// The landing page (/) is a standalone full-bleed hero -- the header/bottom
// nav are chrome for navigating an app you're already inside of, not for a
// first-touch marketing page. Every other route keeps them. A client
// component specifically so usePathname can gate this without turning the
// (server) root layout's auth lookup into a per-route client fetch.
export function SiteChrome({
  isLoggedIn,
  children,
}: {
  isLoggedIn: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <>
      {!isHome && <Header isLoggedIn={isLoggedIn} />}
      {/* pb-16 clears the fixed BottomNav on mobile so page content never
          sits underneath it; sm:pb-0 since BottomNav hides itself there.
          Only needed when BottomNav is actually rendered. */}
      <div className={`flex min-h-0 flex-1 flex-col ${isHome ? "" : "pb-16 sm:pb-0"}`}>{children}</div>
      {!isHome && <BottomNav isLoggedIn={isLoggedIn} />}
    </>
  );
}
