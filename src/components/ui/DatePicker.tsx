"use client";

import { useEffect, useRef, useState } from "react";
import { IconCalendar, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}

/**
 * Single-day picker sharing EventDateRangeCalendar's popover/month-grid look
 * (rounded pill trigger, same card popover, same day-cell styling) so a
 * form's date field doesn't look like a different app from the filter bar
 * next to it. Unlike the filter's range calendar, this has no drag-select --
 * a form only ever needs one date -- so it's its own smaller component
 * rather than a drag-mode toggle bolted onto the range one.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Select a date",
  minDate,
}: {
  value: string | null;
  onChange: (iso: string) => void;
  placeholder?: string;
  minDate?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = value ? new Date(`${value}T00:00:00`) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

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

  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const startPad = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayIso = isoDate(new Date());

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition ${
          value ? "border-green text-green" : "border-border2 text-text2 hover:border-green hover:text-green"
        }`}
      >
        <IconCalendar size={14} />
        {value ? formatShort(value) : placeholder}
      </button>

      {open && (
        <div className="card-elevated absolute left-0 top-full z-30 mt-2 w-[min(90vw,320px)] rounded-card bg-bg2 p-5 shadow-card-hover">
          <div className="mb-3 flex items-center justify-between text-[13px] font-bold">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(y, m - 1, 1))}
              aria-label="Previous month"
              className="flex h-7 w-7 items-center justify-center rounded-full text-text2 transition hover:bg-bg3 hover:text-text"
            >
              <IconChevronLeft size={16} />
            </button>
            <span>
              {MONTH_NAMES[m]} {y}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(y, m + 1, 1))}
              aria-label="Next month"
              className="flex h-7 w-7 items-center justify-center rounded-full text-text2 transition hover:bg-bg3 hover:text-text"
            >
              <IconChevronRight size={16} />
            </button>
          </div>
          <div className="mb-2 grid grid-cols-7 text-center font-mono text-[11px] font-medium text-text3">
            {WEEKDAYS.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 text-center text-[13px]">
            {Array.from({ length: startPad }).map((_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = value === iso;
              const isToday = iso === todayIso;
              const disabled = !!minDate && iso < minDate;
              return (
                <div key={iso} className="flex h-9 items-center justify-center">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                    className={`flex h-8 w-8 select-none items-center justify-center rounded-full text-[13px] font-medium transition ${
                      isSelected
                        ? "bg-green font-bold text-green-dark shadow-sm"
                        : disabled
                          ? "cursor-not-allowed text-text3 opacity-40"
                          : isToday
                            ? "border border-green text-green"
                            : "text-text2 hover:bg-bg3"
                    }`}
                  >
                    {day}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
