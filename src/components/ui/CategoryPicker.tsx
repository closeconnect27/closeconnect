"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { CategoryImage } from "@/components/ui/CategoryImage";

/**
 * Category selector for create/edit forms -- a dropdown like Combobox (the
 * same one city selection uses, both here and in the filter bars), not a
 * bare native <select>, but still a collapsed single trigger rather than
 * the filter bar's always-expanded pill row. Category icons in the trigger
 * and each option are what make it "creative" next to a plain browser
 * dropdown, not the interaction shape.
 */
export function CategoryPicker({
  value,
  onChange,
}: {
  value: CategorySlug;
  onChange: (value: CategorySlug) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = CATEGORIES.find((c) => c.slug === value);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-left text-[14px] font-medium text-text transition focus:border-green"
      >
        {selected && (
          <CategoryImage slug={selected.slug} seed={0} alt="" size={20} className="shrink-0 rounded-full object-cover" />
        )}
        <span className="flex-1">{selected?.label ?? "Choose a category"}</span>
        <IconChevronDown size={14} className={`shrink-0 text-text3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="card-elevated absolute left-0 top-full z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-card bg-bg2 p-1.5"
        >
          {CATEGORIES.map((c) => (
            <button
              key={c.slug}
              type="button"
              role="option"
              aria-selected={value === c.slug}
              onClick={() => {
                onChange(c.slug);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 rounded-card-sm px-3 py-2 text-left text-[13px] font-medium transition ${
                value === c.slug ? "bg-green-tint text-green" : "text-text2 hover:bg-bg3"
              }`}
            >
              <CategoryImage slug={c.slug} seed={0} alt="" size={20} className="shrink-0 rounded-full object-cover" />
              <span className="flex-1">{c.label}</span>
              {value === c.slug && <IconCheck size={14} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
