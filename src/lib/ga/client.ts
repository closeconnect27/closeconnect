"use client";

// Google Analytics 4, purely for site-wide traffic/acquisition reporting in
// Google's own GA dashboard -- deliberately separate from Mixpanel (which
// already covers in-product behavioral events and feeds the host analytics
// dashboard) and doesn't touch either of those. Same graceful-degradation
// posture as the Mixpanel client: `if (!ID) return` everywhere, so this is
// a complete no-op until NEXT_PUBLIC_GA_MEASUREMENT_ID is actually set.
const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

/** Injects gtag.js once. GA4's own SPA guidance: initialize with
 * `send_page_view: false` and send page_view events manually on route
 * change (trackPageview below) -- gtag's automatic pageview only fires on
 * the initial script load, which would miss every client-side Next.js
 * navigation otherwise. */
export function initGoogleAnalytics() {
  if (!MEASUREMENT_ID || initialized || typeof window === "undefined") return;
  initialized = true;

  const script = document.createElement("script");
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  script.async = true;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, { send_page_view: false });
}

export function trackPageview(path: string) {
  if (!MEASUREMENT_ID || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", { page_path: path });
}
