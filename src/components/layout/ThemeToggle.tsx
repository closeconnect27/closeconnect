"use client";

import { useEffect, useState } from "react";
import { IconSun, IconMoon } from "@tabler/icons-react";

export function ThemeToggle() {
  // Starts null so the button renders identically on server and first
  // client paint (matching whatever the inline script in layout.tsx already
  // set on <html>), then syncs to the real value after mount.
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    // Deliberate one-time DOM sync, not a derived-state anti-pattern: the
    // real theme only exists client-side (set by layout.tsx's inline
    // pre-hydration script from localStorage), so the first client render
    // must match the server's null to avoid a hydration mismatch, then
    // correct itself here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme((document.documentElement.getAttribute("data-theme") as "light" | "dark") ?? "dark");
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle color theme"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border2 text-text2 hover:text-text"
    >
      {theme === "light" ? <IconMoon size={16} /> : <IconSun size={16} />}
    </button>
  );
}
