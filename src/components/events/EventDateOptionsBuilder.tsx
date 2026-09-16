"use client";

import { IconTrash, IconPlus } from "@tabler/icons-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";

export type EventDateOptionDraft = {
  event_date: string;
  event_time: string;
  event_end_time: string;
  capacity: string; // kept as text in the form, parsed to number|undefined on submit -- same convention as TicketTypeDraft.quantity_available
};

/**
 * Editor for an event's multiple selectable session dates (0073) -- e.g. a
 * workshop offered on several separate dates, where a registrant picks
 * exactly one. Entirely optional: an event with zero rows here behaves
 * exactly as before this feature existed (single event_date/event_time on
 * the event itself). Mirrors TicketTypeBuilder's list-editor shape.
 */
export function EventDateOptionsBuilder({
  dates,
  onChange,
}: {
  dates: EventDateOptionDraft[];
  onChange: (dates: EventDateOptionDraft[]) => void;
}) {
  function addDate() {
    onChange([...dates, { event_date: "", event_time: "", event_end_time: "", capacity: "" }]);
  }

  function updateDate(i: number, patch: Partial<EventDateOptionDraft>) {
    onChange(dates.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function removeDate(i: number) {
    onChange(dates.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-4">
      {dates.length === 0 && (
        <p className="text-[12px] text-text3">
          Leave this empty for a normal single-date event. Add dates only if registrants should pick which one they&apos;re attending.
        </p>
      )}
      {dates.map((d, i) => (
        <div key={i} className="card-elevated flex flex-col gap-3 rounded-card bg-bg2 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-text2">Date option {i + 1}</span>
            <button
              type="button"
              onClick={() => removeDate(i)}
              aria-label="Remove date option"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border2 text-text3 transition hover:border-pink hover:text-pink"
            >
              <IconTrash size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DatePicker value={d.event_date || null} onChange={(iso) => updateDate(i, { event_date: iso })} placeholder="Select a date" />
            <TimePicker value={d.event_time} onChange={(t) => updateDate(i, { event_time: t })} placeholder="Start time" />
            <label className="flex flex-col gap-1">
              <input
                type="text"
                inputMode="numeric"
                value={d.capacity}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw !== "" && !/^\d*$/.test(raw)) return;
                  updateDate(i, { capacity: raw });
                }}
                placeholder="Capacity (optional)"
                className="w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
              />
            </label>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addDate}
        className="flex items-center justify-center gap-2 rounded-card-sm border border-dashed border-border2 py-3 text-[13px] font-medium text-text2 transition hover:border-green hover:text-green"
      >
        <IconPlus size={14} />
        Add a date option
      </button>
    </div>
  );
}
