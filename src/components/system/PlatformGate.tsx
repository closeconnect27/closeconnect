"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";

// Capacitor injects `window.Capacitor` before the page's own bundle runs,
// so isNativePlatform() is already correct on the very first client
// render -- computed here as a lazy useState initializer (not an effect)
// specifically to avoid a visible flash of web-only content before a
// useEffect would fire. Server-rendered HTML has no `window`, so it always
// assumes web; React reconciles the mismatch against the client's real
// answer on hydration rather than erroring.
function useIsNative() {
  const [isNative] = useState(() => typeof window !== "undefined" && Capacitor.isNativePlatform());
  return isNative;
}

/** Renders children only inside the Capacitor app, never on the website. */
export function NativeOnly({ children }: { children: React.ReactNode }) {
  return useIsNative() ? <>{children}</> : null;
}

/** Renders children only on the website, never inside the Capacitor app. */
export function WebOnly({ children }: { children: React.ReactNode }) {
  return useIsNative() ? null : <>{children}</>;
}
