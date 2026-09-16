"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { CategoryImage } from "@/components/ui/CategoryImage";

/**
 * Single multiselect field for category, replacing the old two-step
 * "primary CategoryPicker + capped extra-categories pill section" pattern
 * -- one control, pick up to `max` total. The first value picked is what
 * the caller treats as the primary `category` column, the rest as
 * `extra_categories` (this component doesn't know or care about that
 * split). Once at the cap, unselected options are disabled, but an
 * already-selected one can still be clicked off.
 */
export function CategoryMultiSelect({
  values,
  onChange,
  max = 5,
}: {
  values: CategorySlug[];
  onChange: (values: CategorySlug[]) => void;
  max?: number;
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

  function toggle(slug: CategorySlug) {
    if (values.includes(slug)) {
      onChange(values.filter((v) => v !== slug));
      return;
    }
    if (values.length >= max) return;
    onChange([...values, slug]);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full flex-wrap items-center gap-1.5 rounded-card-sm border px-3 py-2.5 text-left text-[13px] font-medium transition ${
          values.length > 0 ? "border-green" : "border-border2 hover:border-green"
        }`}
      >
        {values.length === 0 ? (
          <span className="text-text3">Choose up to {max} categories</span>
        ) : (
          values.map((v) => {
            const cat = CATEGORIES.find((c) => c.slug === v);
            return (
              <span
                key={v}
                className="flex items-center gap-1.5 rounded-full bg-green-tint py-1 pl-1 pr-2.5 text-[12px] font-medium text-green"
              >
                <CategoryImage slug={v} seed={0} alt="" size={16} className="shrink-0 rounded-full object-cover" />
                {cat?.label ?? v}
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
          className="card-elevated absolute left-0 top-full z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-card bg-bg2 p-1.5"
        >
          {CATEGORIES.map((c) => {
            const selected = values.includes(c.slug);
            const disabled = !selected && values.length >= max;
            return (
              <button
                key={c.slug}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                onClick={() => toggle(c.slug)}
                className={`flex w-full items-center gap-2.5 rounded-card-sm px-3 py-2 text-left text-[13px] font-medium transition ${
                  selected ? "bg-green-tint text-green" : disabled ? "text-text3 opacity-50" : "text-text2 hover:bg-bg3"
                }`}
              >
                <CategoryImage slug={c.slug} seed={0} alt="" size={20} className="shrink-0 rounded-full object-cover" />
                <span className="flex-1">{c.label}</span>
                {selected && <IconCheck size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
