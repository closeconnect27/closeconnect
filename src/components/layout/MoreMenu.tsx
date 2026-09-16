"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconMenu2, IconLifebuoy, IconPhone, IconInfoCircle, IconFileText, IconShieldLock, IconReceiptRefund } from "@tabler/icons-react";

// Same click-outside-to-close pattern as NotificationBell -- houses the
// support/legal links that used to live in the footer (Footer.tsx now only
// keeps the copyright line), so they're reachable from a sandwich button in
// the header on every page instead of only at the bottom of a scroll.
//
// `dark` is for the homepage specifically: SiteChromeInner never renders
// Header there at all (Hero.tsx is a standalone full-bleed marketing
// screen, not app chrome -- see its own comment), which is exactly why this
// component exists as a separate export instead of living only inside
// Header -- Hero renders it directly, positioned over its own fixed
// near-black backdrop, so it needs Footer's same fixed-dark-color escape
// hatch rather than theme tokens that'd go illegible in light mode.
export function MoreMenu({ dark = false }: { dark?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More"
        className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
          dark ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-text2 hover:bg-bg3 hover:text-text"
        }`}
      >
        <IconMenu2 size={19} />
      </button>

      {open && (
        <div
          className={`absolute right-0 top-full z-50 mt-2 w-64 rounded-card border py-1.5 shadow-card-hover ${
            dark ? "border-white/10 bg-[#141414]" : "border-border bg-bg2"
          }`}
        >
          <MenuLink href="/about" icon={IconInfoCircle} onClick={() => setOpen(false)} dark={dark}>
            About
          </MenuLink>
          <a
            href="mailto:support@closeconnect.in"
            className={`flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium transition ${
              dark ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-text2 hover:bg-bg3 hover:text-text"
            }`}
          >
            <IconLifebuoy size={16} />
            Support
          </a>
          <a
            href="tel:+918310109935"
            className={`flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium transition ${
              dark ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-text2 hover:bg-bg3 hover:text-text"
            }`}
          >
            <IconPhone size={16} />
            +91 83101 09935
          </a>
          <a
            href="tel:+919449175913"
            className={`flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium transition ${
              dark ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-text2 hover:bg-bg3 hover:text-text"
            }`}
          >
            <IconPhone size={16} />
            +91 94491 75913
          </a>
          <div className={`my-1.5 border-t ${dark ? "border-white/10" : "border-border"}`} />
          <MenuLink href="/terms" icon={IconFileText} onClick={() => setOpen(false)} dark={dark}>
            Terms of Service
          </MenuLink>
          <MenuLink href="/privacy" icon={IconShieldLock} onClick={() => setOpen(false)} dark={dark}>
            Privacy Policy
          </MenuLink>
          <MenuLink href="/cancellation-refund" icon={IconReceiptRefund} onClick={() => setOpen(false)} dark={dark}>
            Cancellation &amp; Refund Policy
          </MenuLink>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  onClick,
  dark,
  children,
}: {
  href: string;
  icon: typeof IconInfoCircle;
  onClick: () => void;
  dark: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium transition ${
        dark ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-text2 hover:bg-bg3 hover:text-text"
      }`}
    >
      <Icon size={16} />
      {children}
    </Link>
  );
}
