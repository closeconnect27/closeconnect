"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";

/**
 * Custom-styled single-select dropdown replacing the native <select> for
 * filter bars -- the browser's own dropdown can't be themed (font, radius,
 * hover/selected states all stay OS-default), which reads as an unstyled
 * gap against the rest of the design system. Same outside-click-closes /
 * Escape-closes pattern as EventDateRangeCalendar's popover.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

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
        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition ${
          value ? "border-green text-green" : "border-border2 text-text2 hover:border-green hover:text-green"
        }`}
      >
        {selected?.label ?? placeholder}
        <IconChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="card-elevated absolute left-0 top-full z-30 mt-2 max-h-72 w-[min(80vw,220px)] overflow-y-auto rounded-card bg-bg2 p-1.5"
        >
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={`flex w-full items-center justify-between gap-2 rounded-card-sm px-3 py-2 text-left text-[13px] font-medium transition ${
              value === "" ? "bg-green-tint text-green" : "text-text2 hover:bg-bg3"
            }`}
          >
            {placeholder}
            {value === "" && <IconCheck size={14} />}
          </button>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={value === o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-card-sm px-3 py-2 text-left text-[13px] font-medium transition ${
                value === o.value ? "bg-green-tint text-green" : "text-text2 hover:bg-bg3"
              }`}
            >
              {o.label}
              {value === o.value && <IconCheck size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
