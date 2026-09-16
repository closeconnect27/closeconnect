"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/googleMapsLoader";

/**
 * Small interactive map on the event detail page. Two fallback tiers, both
 * zero-key: with lat/lng but no Maps API key configured, a plain "Open in
 * Google Maps" search-URL link (no API involved at all); with neither
 * coordinates nor a key, renders nothing. Only a real key + real
 * coordinates gets the actual embedded, pannable/zoomable map.
 */
export function EventVenueMap({
  lat,
  lng,
  address,
}: {
  lat: number | null;
  lng: number | null;
  address: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);

  const hasCoords = lat != null && lng != null;

  useEffect(() => {
    if (!hasCoords) return;
    let cancelled = false;

    loadGoogleMaps().then(async (g) => {
      if (cancelled || !g || !mapRef.current) return;
      const map = new g.maps.Map(mapRef.current, {
        center: { lat: lat!, lng: lng! },
        zoom: 15,
        mapId: "CLOSECONNECT_EVENT_MAP",
        disableDefaultUI: true,
        zoomControl: true,
      });
      // AdvancedMarkerElement needs the "marker" library specifically,
      // separate from the base Map class already available once the
      // bootstrap script itself has loaded.
      const { AdvancedMarkerElement } = (await g.maps.importLibrary("marker")) as google.maps.MarkerLibrary;
      new AdvancedMarkerElement({ map, position: { lat: lat!, lng: lng! } });
      setMapReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [hasCoords, lat, lng]);

  if (!hasCoords) return null;

  const mapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <div className="mt-3 overflow-hidden rounded-card-sm border border-border2">
      <div ref={mapRef} className={mapReady ? "h-48 w-full" : "hidden"} />
      {!mapReady && (
        <a
          href={mapsSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-16 items-center justify-center gap-2 bg-bg2 text-[13px] font-medium text-green hover:underline"
        >
          Open {address || "venue"} in Google Maps
        </a>
      )}
    </div>
  );
}
