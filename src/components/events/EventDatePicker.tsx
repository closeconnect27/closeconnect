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
 * Event date field with an optional range -- same drag-to-select
 * interaction as the browse page's EventDateRangeCalendar (mousedown
 * starts a selection, dragging extends it, a plain click with no drag
 * just picks that single day), ported here as a controlled value/onChange
 * form field instead of a URL-syncing filter. A single-day pick reports
 * the same date for both start and end -- callers/DB treat an
 * event_end_date equal to event_date as "not actually a range" (see 0072).
 */
export function EventDatePicker({
  startValue,
  endValue,
  onChange,
  minDate,
  allowRange = true,
}: {
  startValue: string | null;
  endValue: string | null;
  onChange: (start: string, end: string) => void;
  minDate?: string;
  // false for a single-day event -- a click always picks just that one
  // day and closes immediately, no drag-to-select range at all (rather
  // than allowing a range to be dragged and then silently collapsed back
  // to a single day on submit, which would let the calendar visually
  // suggest a range this event type can never actually have).
  allowRange?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = startValue ? new Date(`${startValue}T00:00:00`) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [draftStart, setDraftStart] = useState<string | null>(startValue);
  const [draftEnd, setDraftEnd] = useState<string | null>(endValue);

  const draftStartRef = useRef(draftStart);
  const draftEndRef = useRef(draftEnd);
  useEffect(() => {
    draftStartRef.current = draftStart;
    draftEndRef.current = draftEnd;
  }, [draftStart, draftEnd]);

  function finalizeDrag() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const s = draftStartRef.current;
    let e = draftEndRef.current;
    if (!s) return;
    if (!e) e = s; // plain click/tap, no drag -- single-day selection
    if (e < s) {
      setDraftStart(e);
      setDraftEnd(s);
      onChange(e, s);
    } else {
      setDraftEnd(e);
      onChange(s, e);
    }
    // A finished selection (single day or range) is a complete pick --
    // closes the same way DatePicker's single-day click does, rather than
    // requiring a separate "Apply" step the filter-bar version has.
    setOpen(false);
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mouseup", finalizeDrag);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mouseup", finalizeDrag);
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function beginSelection(iso: string) {
    if (minDate && iso < minDate) return;
    if (!allowRange) {
      setDraftStart(iso);
      setDraftEnd(iso);
      onChange(iso, iso);
      setOpen(false);
      return;
    }
    draggingRef.current = true;
    setDraftStart(iso);
    setDraftEnd(null);
  }

  function extendSelection(iso: string) {
    if (!draggingRef.current) return;
    if (minDate && iso < minDate) return;
    setDraftEnd(iso);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!draggingRef.current) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
    const iso = el?.dataset.iso;
    if (iso) extendSelection(iso);
  }

  const rangeLo = draftStart && draftEnd ? (draftStart < draftEnd ? draftStart : draftEnd) : draftStart;
  const rangeHi = draftStart && draftEnd ? (draftStart < draftEnd ? draftEnd : draftStart) : null;
  const isRange = !!(rangeLo && rangeHi && rangeLo !== rangeHi);

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
          startValue ? "border-green text-green" : "border-border2 text-text2 hover:border-green hover:text-green"
        }`}
      >
        <IconCalendar size={14} />
        {startValue ? (endValue && endValue !== startValue ? `${formatShort(startValue)} – ${formatShort(endValue)}` : formatShort(startValue)) : "Select a date"}
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
          <div className="grid grid-cols-7 text-center text-[13px]" onTouchMove={handleTouchMove} onTouchEnd={finalizeDrag}>
            {Array.from({ length: startPad }).map((_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = iso === todayIso;
              const isStart = rangeLo === iso;
              const isEnd = rangeHi === iso;
              const inRange = !!(rangeLo && rangeHi && iso > rangeLo && iso < rangeHi);
              const inBand = inRange || isStart || isEnd;
              const disabled = !!minDate && iso < minDate;
              return (
                <div
                  key={iso}
                  className={`flex h-9 items-center justify-center ${inBand ? "bg-green-tint" : ""} ${
                    isStart ? "rounded-l-full" : ""
                  } ${isEnd ? "rounded-r-full" : ""} ${isStart && isEnd ? "rounded-full" : ""}`}
                >
                  <button
                    type="button"
                    data-iso={iso}
                    disabled={disabled}
                    onMouseDown={() => beginSelection(iso)}
                    onMouseEnter={() => extendSelection(iso)}
                    onTouchStart={() => beginSelection(iso)}
                    style={{ touchAction: "none" }}
                    className={`flex h-8 w-8 select-none items-center justify-center rounded-full text-[13px] font-medium transition ${
                      isStart || isEnd
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
          {isRange && (
            <p className="mt-4 text-center text-[12px] text-text3">Multi-day event -- click a single day to reset.</p>
          )}
        </div>
      )}
    </div>
  );
}
