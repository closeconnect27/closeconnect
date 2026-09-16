"use client";

import { useEffect, useRef, useState } from "react";
import { IconCurrentLocation, IconLoader2 } from "@tabler/icons-react";
import { loadGoogleMaps } from "@/lib/googleMapsLoader";

export type VenuePick = {
  address: string;
  lat?: number;
  lng?: number;
  placeId?: string;
};

/**
 * Drop-in replacement for a plain venue <input> -- becomes a real Google
 * Places address-autocomplete field once NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is
 * configured, and silently falls back to the exact same plain text input
 * as before when it isn't (no key set locally, script blocked, etc.) --
 * same graceful-degradation posture as the Mixpanel client's `if (!TOKEN)
 * return`. Picking a suggestion reports lat/lng/place_id for the map on the
 * event page; free typing without picking one still works, same as today
 * (venue has always been a plain optional string).
 *
 * The "use current location" button works even with no Maps key at all --
 * browser geolocation is its own API, unrelated to Google. Only the
 * reverse-geocode-to-a-readable-address step needs Google (Geocoding API,
 * part of the same key/project); without it, coordinates are still
 * captured and the map still works, just labeled "Current location"
 * instead of a real address.
 */
export function VenueAutocomplete({
  value,
  onChange,
  placeholder = "Where's it happening?",
}: {
  value: string;
  onChange: (pick: VenuePick) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const googleRef = useRef<typeof google | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let listener: google.maps.MapsEventListener | null = null;
    let pacContainer: Element | null = null;

    // Google's legacy Autocomplete widget appends its own suggestion
    // dropdown as a `.pac-container` div straight to <body> and exposes no
    // public "destroy" method. It's also created LAZILY (on first focus/
    // keystroke, not at construction time), so diffing document.body
    // immediately after `new Autocomplete(...)` misses it entirely -- a
    // MutationObserver watching for it to appear, whenever that happens,
    // is the only timing-independent way to get a handle on it for
    // cleanup. Without this, unmounting (e.g. toggling the event Format
    // between offline/online, which unmounts this component entirely)
    // leaves an orphaned .pac-container behind; remounting later creates
    // a second one, and typing shows both -- the "double grid" of
    // suggestions this was reported as.
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains("pac-container")) {
            pacContainer = node;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });

    loadGoogleMaps().then((g) => {
      googleRef.current = g;
      if (cancelled || !g || !inputRef.current) return;
      autocompleteRef.current = new g.maps.places.Autocomplete(inputRef.current, {
        fields: ["formatted_address", "geometry", "place_id"],
      });
      listener = autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current!.getPlace();
        onChange({
          address: place.formatted_address ?? inputRef.current?.value ?? "",
          lat: place.geometry?.location?.lat(),
          lng: place.geometry?.location?.lng(),
          placeId: place.place_id,
        });
      });
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      listener?.remove();
      if (autocompleteRef.current && googleRef.current) {
        googleRef.current.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      pacContainer?.remove();
    };
    // Attaches once per mount -- re-running this on every `value` change
    // would tear down and recreate the widget on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setGeoError("Location isn't available in this browser");
      return;
    }
    setGeoError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const g = googleRef.current;
        let address = "Current location";
        let placeId: string | undefined;

        if (g) {
          try {
            const geocoder = new g.maps.Geocoder();
            const { results } = await geocoder.geocode({ location: { lat, lng } });
            if (results[0]) {
              address = results[0].formatted_address;
              placeId = results[0].place_id;
            }
          } catch {
            // Geocoding API not enabled, or the reverse lookup failed --
            // the coordinates themselves are still good, just unlabeled.
          }
        }

        // Uncontrolled input (defaultValue) -- same reasoning as Google's
        // own Autocomplete widget setting .value directly on selection,
        // this component's displayed text isn't driven by the `value` prop
        // after mount, so it needs the same direct update here too.
        if (inputRef.current) inputRef.current.value = address;
        onChange({ address, lat, lng, placeId });
        setLocating(false);
      },
      () => {
        setGeoError("Couldn't get your location -- check browser permissions");
        setLocating(false);
      },
      { timeout: 10_000 },
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus-within:border-green">
        <input
          ref={inputRef}
          defaultValue={value}
          onChange={(e) => {
            // Real keystrokes only -- Google's widget sets the input's
            // value directly (not via a dispatched input event) when a
            // suggestion is clicked, so this handler and the
            // place_changed listener above don't fire for the same
            // interaction. Hand-typing without ever picking a suggestion
            // is still a valid plain-string venue, same as before this
            // component existed -- just with no coordinates.
            onChange({ address: e.target.value });
          }}
          placeholder={placeholder}
          // venue-autocomplete-input: see the plain (unlayered) CSS rule in
          // globals.css that targets this class -- a Tailwind utility can't
          // do this job here. globals.css has a deliberate, app-wide
          // `input:focus-visible { outline: 2px solid var(--green) }` rule
          // for keyboard accessibility, written unlayered (outside any
          // @layer). Tailwind's own utilities (including `outline-none` and
          // `focus-visible:outline-none`) are always generated inside
          // `@layer utilities` -- per the CSS Cascade Layers spec, ANY
          // unlayered rule beats ANY layered rule regardless of
          // specificity, so no Tailwind class can ever win against that
          // global rule. Left alone, it drew its own tight green outline
          // around just the <input>, on top of this wrapper's own
          // `focus-within:border-green` around the whole control (input +
          // location button) -- two green rectangles, reported as a "box
          // inside the venue field".
          className="venue-autocomplete-input w-full min-w-0 bg-transparent outline-none placeholder:text-text3"
        />
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          title="Use current location"
          aria-label="Use current location"
          className="flex shrink-0 items-center justify-center rounded-full p-1.5 text-text3 transition hover:bg-bg2 hover:text-green disabled:opacity-60"
        >
          {locating ? <IconLoader2 size={16} className="animate-spin" /> : <IconCurrentLocation size={16} />}
        </button>
      </div>
      {geoError && <p className="mt-1 text-[12px] text-pink">{geoError}</p>}
    </div>
  );
}
