"use client";

import { IconTrash, IconPlus } from "@tabler/icons-react";
import { EventDatePicker } from "@/components/events/EventDatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { VenueAutocomplete, type VenuePick } from "@/components/ui/VenueAutocomplete";

export type EventDateEntryDraft = {
  date: string;
  time: string;
  endTime: string;
  venue: string;
  venueLat?: number;
  venueLng?: number;
  venuePlaceId?: string;
};

/**
 * Editor for a multi-day event's date list -- a repeatable list of
 * (date, start time, end time, venue) sessions, one "Add date" row at a
 * time. Mirrors TicketTypeBuilder's exact shape (parent-owned array of
 * draft state, add/update/remove closures, dashed "Add X" button) rather
 * than the old continuous date-range picker: a host with 3 separate dates
 * now adds 3 explicit rows instead of dragging a calendar range that
 * silently assumed every day in between was also part of the event.
 *
 * Each row's own venue uses the same Google Places map/autocomplete widget
 * as a single-day event's top-level venue field -- there's no shared
 * top-level venue for a multi-day event at all (a 3-city tour's stops
 * aren't "the same place unless stated otherwise"), so venue is required
 * per entry, same as a single-day event requires its one venue.
 */
export function EventDateEntryBuilder({
  entries,
  onChange,
  minDate,
  eventMode,
}: {
  entries: EventDateEntryDraft[];
  onChange: (entries: EventDateEntryDraft[]) => void;
  minDate?: string;
  eventMode: "online" | "offline";
}) {
  function addEntry() {
    onChange([...entries, { date: "", time: "", endTime: "", venue: "" }]);
  }

  function updateEntry(i: number, patch: Partial<EventDateEntryDraft>) {
    onChange(entries.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function removeEntry(i: number) {
    onChange(entries.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-4">
      {entries.map((d, i) => (
        <div key={i} className="card-elevated rounded-card bg-bg2 p-4">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <EventDatePicker
                startValue={d.date || null}
                endValue={null}
                onChange={(start) => updateEntry(i, { date: start })}
                minDate={minDate}
                allowRange={false}
              />
            </div>
            {entries.length > 1 && (
              <button
                type="button"
                onClick={() => removeEntry(i)}
                aria-label="Remove date"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border2 text-text3 transition hover:border-pink hover:text-pink"
              >
                <IconTrash size={14} />
              </button>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text3">Start time</span>
              <TimePicker value={d.time} onChange={(v) => updateEntry(i, { time: v })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text3">End time (optional)</span>
              <TimePicker value={d.endTime} onChange={(v) => updateEntry(i, { endTime: v })} />
            </label>
          </div>

          {eventMode === "offline" && (
            <label className="mt-3 flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text3">Venue</span>
              <VenueAutocomplete
                value={d.venue}
                onChange={(pick: VenuePick) => updateEntry(i, { venue: pick.address, venueLat: pick.lat, venueLng: pick.lng, venuePlaceId: pick.placeId })}
              />
            </label>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addEntry}
        className="flex items-center justify-center gap-2 rounded-card-sm border border-dashed border-border2 py-3 text-[13px] font-medium text-text2 transition hover:border-green hover:text-green"
      >
        <IconPlus size={14} />
        Add date
      </button>
    </div>
  );
}
