"use client";

// Lazily injects the Google Maps JS API script at most once per page,
// caching the in-flight/resolved promise so VenueAutocomplete and
// EventVenueMap (which can both mount on the same page, or remount) never
// race to inject the script twice. Uses Google's classic callback-based
// bootstrap (a single <script src="...&callback=X"> tag) rather than their
// newer minified dynamic-import snippet -- functionally equivalent (both
// end up populating the same google.maps.places/marker namespaces) and far
// less error-prone to hand-reproduce here.
//
// Resolves to `null` (never throws) when no key is configured or the
// script fails to load -- every caller treats that as "fall back to plain
// text / no map", same posture as Mixpanel's `if (!TOKEN) return`.

declare global {
  interface Window {
    google?: typeof google;
    __closeconnectGoogleMapsCallback__?: () => void;
  }
}

let loadPromise: Promise<typeof google | null> | null = null;

export function loadGoogleMaps(): Promise<typeof google | null> {
  if (loadPromise) return loadPromise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    loadPromise = Promise.resolve(null);
    return loadPromise;
  }

  if (window.google?.maps?.places) {
    loadPromise = Promise.resolve(window.google);
    return loadPromise;
  }

  loadPromise = new Promise((resolve) => {
    window.__closeconnectGoogleMapsCallback__ = () => resolve(window.google ?? null);

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key,
      libraries: "places,marker",
      loading: "async",
      callback: "__closeconnectGoogleMapsCallback__",
      v: "weekly",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return loadPromise;
}
