"use client";

import { useEffect, useRef, useState } from "react";
import { IconX, IconLoader2 } from "@tabler/icons-react";
import { getTrendingGifs, searchGifs, type GiphyResult } from "@/lib/giphy";

const DEBOUNCE_MS = 500;

// Popover anchored above the composer's GIF button (the parent wraps its
// trigger + this in a `relative` container) -- trending on open, switching
// to a debounced search once the viewer types. Closes on an outside click,
// same pattern as NotificationBell's panel.
export function GifPicker({ onSelect, onClose }: { onSelect: (gif: GiphyResult) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const trimmed = query.trim();
    // setLoading/setError happen inside the timer callback, not directly in
    // the effect body -- keeps this out of the synchronous-setState-in-
    // effect footgun (react-hooks/set-state-in-effect) the same way
    // NotificationBell's own fetch-on-mount defers its setState into a
    // .then() rather than calling it inline.
    const timer = setTimeout(
      () => {
        setLoading(true);
        setError("");
        const fetcher = trimmed ? searchGifs(trimmed) : getTrendingGifs();
        fetcher
          .then((results) => {
            if (!cancelled) setGifs(results);
          })
          .catch((err) => {
            if (!cancelled) setError(err instanceof Error ? err.message : "Could not load GIFs");
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      trimmed ? DEBOUNCE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 z-50 mb-2 flex h-80 w-72 flex-col overflow-hidden rounded-card border border-border bg-bg2 shadow-card-hover sm:w-80"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs…"
          className="flex-1 rounded-full border border-border2 bg-bg3 px-3 py-1.5 text-[13px] transition focus:border-green"
        />
        <button type="button" onClick={onClose} aria-label="Close GIF picker" className="shrink-0 text-text2 transition hover:text-text">
          <IconX size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <IconLoader2 size={20} className="animate-spin text-text3" />
          </div>
        ) : error ? (
          <p className="p-4 text-center text-[12px] text-pink">{error}</p>
        ) : gifs.length === 0 ? (
          <p className="p-4 text-center text-[12px] text-text3">No GIFs found</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSelect(gif)}
                className="overflow-hidden rounded-card-sm bg-bg3 transition hover:opacity-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- external Giphy CDN thumbnail, not covered by next/image's remote patterns */}
                <img src={gif.previewUrl} alt="" className="h-24 w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
