"use client";

import { IconClock } from "@tabler/icons-react";

/**
 * Native <input type="time"> -- replaces a custom 3-column wheel popover
 * (hour / minute / AM-PM) that needed a tap in each of 3 scrollable
 * columns plus an outside click/Escape to dismiss, with no in-panel
 * confirm button at all. A native time input is one box: the browser's
 * own picker opens, closes, and commits the value in a single
 * interaction -- what "no double confirmation" for time entry means here.
 *
 * Styled as the same rounded-pill trigger every other dropdown in this app
 * uses (EventDatePicker/Combobox) -- a plain boxy <input> next to those
 * read as visually inconsistent even though the interaction model is
 * simpler. Only the input's own native picker popup (the OS/browser's
 * clock-face or scroll-wheel UI) stays outside this app's control -- no
 * CSS reaches inside that.
 */
export function TimePicker({
  value,
  onChange,
  placeholder,
}: {
  value: string; // "" | "HH:MM" (24hr)
  onChange: (hhmm: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <IconClock
        size={14}
        className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${value ? "text-green" : "text-text3"}`}
      />
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder ?? "Time"}
        style={{ colorScheme: "light dark" }}
        className={`w-full rounded-full border py-2 pl-9 pr-4 text-[13px] font-medium transition focus:border-green ${
          value ? "border-green text-green" : "border-border2 bg-bg3 text-text2"
        }`}
      />
    </div>
  );
}
