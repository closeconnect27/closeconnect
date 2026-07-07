"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`;
}

/**
 * Port of reference_current_events.html's drag-to-select range calendar
 * (drMouseDown/drMouseEnter/drMouseUpGlobal): mousedown on a day starts a
 * selection, dragging over other days extends it, mouseup finalizes (a plain
 * click with no drag in between just selects that single day, matching the
 * original `if (!drEnd) drEnd = drStart`). Touch has no hover/drag
 * equivalent, so dragging is additionally driven by touchmove + manual
 * elementFromPoint hit-testing rather than relying on mouseenter, which
 * never fires for touch.
 */
export function EventDateRangeCalendar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [start, setStart] = useState<string | null>(searchParams.get("from"));
  const [end, setEnd] = useState<string | null>(searchParams.get("to"));
  // Mirrors of start/end for the document-level mouseup handler below --
  // that listener is registered once and would otherwise close over whatever
  // start/end were on the render it was attached in. Synced via effect, not
  // assigned during render -- mutating a ref while rendering is impure
  // (unsafe under concurrent/Strict Mode double-render), even though this
  // particular assignment happens to be idempotent.
  const startRef = useRef(start);
  const endRef = useRef(end);
  useEffect(() => {
    startRef.current = start;
    endRef.current = end;
  }, [start, end]);

  function finalizeDrag() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const s = startRef.current;
    let e = endRef.current;
    if (!s) return;
    if (!e) e = s; // plain click/tap, no drag -- single-day selection
    if (e < s) {
      setStart(e);
      setEnd(s);
    } else {
      setEnd(e);
    }
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    // touch-action: none on day cells (needed so touchmove drags the
    // selection instead of scrolling the page) suppresses the synthetic
    // mouse events browsers normally fire after a touch sequence, so mouseup
    // alone isn't a reliable finalize signal on touch -- touchend on the
    // grid handles that case explicitly instead.
    document.addEventListener("mouseup", finalizeDrag);
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("mouseup", finalizeDrag);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, []);

  function beginSelection(iso: string) {
    draggingRef.current = true;
    setStart(iso);
    setEnd(null);
  }

  function extendSelection(iso: string) {
    if (!draggingRef.current) return;
    setEnd(iso);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!draggingRef.current) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
    const iso = el?.dataset.iso;
    if (iso) setEnd(iso);
  }

  function applyRange(newStart: string | null, newEnd: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (newStart && newEnd) {
      params.set("from", newStart);
      params.set("to", newEnd);
    } else {
      params.delete("from");
      params.delete("to");
    }
    router.push(`/events${params.toString() ? `?${params.toString()}` : ""}`);
    setOpen(false);
  }

  function applyPreset(kind: "week" | "2weeks" | "month") {
    const today = new Date();
    let from = new Date(today);
    let to = new Date(today);
    if (kind === "week") to.setDate(today.getDate() + 6);
    else if (kind === "2weeks") to.setDate(today.getDate() + 13);
    else {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }
    const s = isoDate(from);
    const e = isoDate(to);
    setStart(s);
    setEnd(e);
    applyRange(s, e);
  }

  function clear() {
    setStart(null);
    setEnd(null);
    applyRange(null, null);
  }

  const rangeLo = start && end ? (start < end ? start : end) : start;
  const rangeHi = start && end ? (start < end ? end : start) : null;

  const rightMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition ${
          start && end
            ? "border-green text-green"
            : "border-border2 text-text2 hover:border-green hover:text-green"
        }`}
      >
        <IconCalendar size={14} />
        {start && end ? `${formatShort(rangeLo!)} – ${formatShort(rangeHi!)}` : "Any date"}
      </button>

      {open && (
        <div className="card-elevated absolute left-0 top-full z-30 mt-2 w-[min(90vw,640px)] rounded-card bg-bg2 p-5 shadow-card-hover">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <MonthGrid
              monthDate={viewMonth}
              rangeLo={rangeLo}
              rangeHi={rangeHi}
              onPrev={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              showPrev
              onDown={beginSelection}
              onEnter={extendSelection}
              onTouchMove={handleTouchMove}
              onTouchEnd={finalizeDrag}
            />
            <MonthGrid
              monthDate={rightMonth}
              rangeLo={rangeLo}
              rangeHi={rangeHi}
              onNext={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              showNext
              onDown={beginSelection}
              onEnter={extendSelection}
              onTouchMove={handleTouchMove}
              onTouchEnd={finalizeDrag}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <button onClick={() => applyPreset("week")} className="btn-secondary px-3 py-1.5 text-[12px]">
              This week
            </button>
            <button onClick={() => applyPreset("2weeks")} className="btn-secondary px-3 py-1.5 text-[12px]">
              Next 2 weeks
            </button>
            <button onClick={() => applyPreset("month")} className="btn-secondary px-3 py-1.5 text-[12px]">
              This month
            </button>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={clear} className="btn-secondary px-4 py-2 text-[13px]">
              Clear
            </button>
            <button
              onClick={() => applyRange(rangeLo, rangeHi ?? rangeLo)}
              disabled={!rangeLo}
              className="btn-primary px-4 py-2 text-[13px]"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthGrid({
  monthDate,
  rangeLo,
  rangeHi,
  onPrev,
  onNext,
  showPrev,
  showNext,
  onDown,
  onEnter,
  onTouchMove,
  onTouchEnd,
}: {
  monthDate: Date;
  rangeLo: string | null;
  rangeHi: string | null;
  onPrev?: () => void;
  onNext?: () => void;
  showPrev?: boolean;
  showNext?: boolean;
  onDown: (iso: string) => void;
  onEnter: (iso: string) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
}) {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const startPad = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayIso = isoDate(new Date());

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-[13px] font-bold">
        {showPrev ? (
          <button
            onClick={onPrev}
            aria-label="Previous month"
            className="flex h-7 w-7 items-center justify-center rounded-full text-text2 transition hover:bg-bg3 hover:text-text"
          >
            <IconChevronLeft size={16} />
          </button>
        ) : (
          <span className="w-7" />
        )}
        <span>
          {MONTH_NAMES[m]} {y}
        </span>
        {showNext ? (
          <button
            onClick={onNext}
            aria-label="Next month"
            className="flex h-7 w-7 items-center justify-center rounded-full text-text2 transition hover:bg-bg3 hover:text-text"
          >
            <IconChevronRight size={16} />
          </button>
        ) : (
          <span className="w-7" />
        )}
      </div>
      <div className="mb-2 grid grid-cols-7 text-center font-mono text-[11px] font-medium text-text3">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center text-[13px]" onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
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
                onMouseDown={() => onDown(iso)}
                onMouseEnter={() => onEnter(iso)}
                onTouchStart={() => onDown(iso)}
                className={`flex h-8 w-8 select-none items-center justify-center rounded-full text-[13px] font-medium transition ${
                  isStart || isEnd
                    ? "bg-green font-bold text-green-dark shadow-sm"
                    : isToday
                      ? "border border-green text-green"
                      : "text-text2 hover:bg-bg3"
                }`}
                style={{ touchAction: "none" }}
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
