"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconCheck, IconX, IconWorld } from "@tabler/icons-react";
import { CITY_OPTIONS } from "@/lib/cities";

/**
 * Single multiselect field for city, replacing the old two-step "primary
 * Combobox + capped extra-cities MultiCombobox" pattern -- one control,
 * pick as many as apply, no cap. The first value picked is what the
 * caller treats as the primary `city` column, the rest as `extra_cities`
 * (this component itself doesn't know or care about that split). "All
 * cities" is a separate, mutually exclusive choice -- picking it clears
 * any specific cities, and picking a specific city while it's active
 * turns it back off.
 */
export function CityMultiSelect({
  cities,
  allCities,
  onChange,
}: {
  cities: string[];
  allCities: boolean;
  onChange: (cities: string[], allCities: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function toggleCity(value: string) {
    if (allCities) {
      onChange([value], false);
      return;
    }
    onChange(cities.includes(value) ? cities.filter((c) => c !== value) : [...cities, value], false);
  }

  function toggleAllCities() {
    onChange([], !allCities);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full flex-wrap items-center gap-1.5 rounded-card-sm border px-3 py-2.5 text-left text-[13px] font-medium transition ${
          allCities || cities.length > 0 ? "border-green" : "border-border2 hover:border-green"
        }`}
      >
        {allCities ? (
          <span className="flex items-center gap-1 rounded-full bg-green-tint px-2.5 py-1 text-[12px] font-medium text-green">
            <IconWorld size={12} />
            All cities
          </span>
        ) : cities.length === 0 ? (
          <span className="text-text3">Choose cities</span>
        ) : (
          cities.map((c) => {
            const label = CITY_OPTIONS.find((o) => o.value === c)?.label ?? c;
            return (
              <span
                key={c}
                className="flex items-center gap-1 rounded-full bg-green-tint px-2.5 py-1 text-[12px] font-medium text-green"
              >
                {label}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCity(c);
                  }}
                  className="cursor-pointer"
                >
                  <IconX size={12} />
                </span>
              </span>
            );
          })
        )}
        <IconChevronDown size={14} className={`ml-auto shrink-0 text-text3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="card-elevated absolute left-0 top-full z-30 mt-2 max-h-72 w-[min(90vw,280px)] overflow-y-auto rounded-card bg-bg2 p-1.5"
        >
          <button
            type="button"
            role="option"
            aria-selected={allCities}
            onClick={toggleAllCities}
            className={`flex w-full items-center gap-2 rounded-card-sm px-3 py-2 text-left text-[13px] font-medium transition ${
              allCities ? "bg-green-tint text-green" : "text-text2 hover:bg-bg3"
            }`}
          >
            <IconWorld size={14} className="shrink-0" />
            <span className="flex-1">All cities</span>
            {allCities && <IconCheck size={14} className="shrink-0" />}
          </button>
          <div className="my-1.5 border-t border-border" />
          {CITY_OPTIONS.map((o) => {
            const selected = cities.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => toggleCity(o.value)}
                className={`flex w-full items-center justify-between gap-2 rounded-card-sm px-3 py-2 text-left text-[13px] font-medium transition ${
                  selected ? "bg-green-tint text-green" : "text-text2 hover:bg-bg3"
                }`}
              >
                {o.label}
                {selected && <IconCheck size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
