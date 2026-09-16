"use client";

import { TimePicker } from "@/components/ui/TimePicker";

/**
 * Start time and optional end time -- just the two native time inputs, no
 * duration quick-pick (removed: one more field to fill in for what a plain
 * end-time pick already does directly). Shared by NewEventForm/
 * EditEventForm rather than duplicated in both.
 */
export function EventTimeFields({
  time,
  onTimeChange,
  endTime,
  onEndTimeChange,
}: {
  time: string;
  onTimeChange: (hhmm: string) => void;
  endTime: string;
  onEndTimeChange: (hhmm: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-bold text-text2">Start time</span>
        <TimePicker value={time} onChange={onTimeChange} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-bold text-text2">End time (optional)</span>
        <TimePicker value={endTime} onChange={onEndTimeChange} placeholder="Add end time" />
      </div>
    </div>
  );
}
