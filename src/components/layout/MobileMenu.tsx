"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { IconMenu2, IconX } from "@tabler/icons-react";

export function MobileMenu({
  links,
  isLoggedIn,
}: {
  links: { href: string; label: string }[];
  isLoggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border2 text-text2"
      >
        <IconMenu2 size={16} />
      </button>

      {/* Portaled to document.body: Header has backdrop-blur-md, and an
          ancestor with backdrop-filter (like filter/transform) becomes the
          containing block for fixed-position descendants -- a fixed
          inset-0 div rendered inside the header only covered the header's
          own ~56px box, not the viewport, leaving the rest of this menu
          rendered in normal flow on top of (see-through onto) the page. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-bg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-heading text-lg font-extrabold">
                close<span className="text-green">.connect</span>
              </span>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-text2">
                <IconX size={22} />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-card-sm px-3 py-3 text-base text-text2 hover:bg-bg2 hover:text-text"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href={isLoggedIn ? "/profile" : "/login"}
                onClick={() => setOpen(false)}
                className="rounded-card-sm px-3 py-3 text-base text-text2 hover:bg-bg2 hover:text-text"
              >
                {isLoggedIn ? "profile" : "sign in"}
              </Link>
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
