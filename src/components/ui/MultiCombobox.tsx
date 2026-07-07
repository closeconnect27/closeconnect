"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconCheck, IconX } from "@tabler/icons-react";

/**
 * Multi-select sibling of Combobox, same dropdown mechanics (trigger +
 * popover list, outside-click/Escape closes) but selecting an option
 * toggles it into a set instead of closing the popover, and the trigger
 * shows the selected values as removable chips instead of one label.
 */
export function MultiCombobox({
  values,
  onChange,
  options,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: { value: string; label: string }[];
  placeholder: string;
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

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
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
          <span className="text-text3">{placeholder}</span>
        ) : (
          values.map((v) => {
            const label = options.find((o) => o.value === v)?.label ?? v;
            return (
              <span
                key={v}
                className="flex items-center gap-1 rounded-full bg-green-tint px-2.5 py-1 text-[12px] font-medium text-green"
              >
                {label}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(v);
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
          className="card-elevated absolute left-0 top-full z-30 mt-2 max-h-72 w-[min(80vw,260px)] overflow-y-auto rounded-card bg-bg2 p-1.5"
        >
          {options.map((o) => {
            const selected = values.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => toggle(o.value)}
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
