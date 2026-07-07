import Link from "next/link";
import { IconMapPin, IconCircleCheck } from "@tabler/icons-react";
import { getCategoryVisual } from "@/lib/categories";
import type { MyRegisteredEvent } from "@/lib/queries/profile";

// Attendee-facing variant of HostEventRow -- links to the public event page,
// not /manage (an attendee has nothing to manage), and shows their own
// check-in status instead of aggregate registrant counts.
export function RegisteredEventRow({ event: e }: { event: MyRegisteredEvent }) {
  const visual = getCategoryVisual(e.category ?? "other");
  const { month, day } = formatDateChip(e.event_date);

  return (
    <Link href={`/events/${e.id}`} className="card-elevated flex items-center gap-3 rounded-card bg-bg2 p-3 sm:p-4">
      <div
        className="flex w-12 shrink-0 flex-col items-center overflow-hidden rounded-card-sm text-center"
        style={{ background: visual.bg }}
      >
        <span className="w-full py-0.5 font-mono text-[9px] font-semibold uppercase" style={{ color: visual.light }}>
          {month}
        </span>
        <span className="py-1 font-mono text-[15px] font-semibold leading-none" style={{ color: visual.light }}>
          {day}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[14px] font-bold text-text">{e.event_name}</p>
          {e.status === "cancelled" && (
            <span className="shrink-0 rounded-full bg-pink-tint px-2 py-0.5 text-[10px] font-bold text-pink">
              Cancelled
            </span>
          )}
        </div>
        {(e.venue || e.city) && (
          <span className="flex items-center gap-1 text-[12px] text-text3">
            <IconMapPin size={12} />
            {[e.venue, e.city].filter(Boolean).join(", ")}
          </span>
        )}
      </div>

      {e.checkedInAt && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-tint px-2.5 py-1 text-[11px] font-bold text-green">
          <IconCircleCheck size={12} />
          Checked in
        </span>
      )}
    </Link>
  );
}

function formatDateChip(isoDate: string | null) {
  if (!isoDate) return { month: "TBD", day: "—" };
  const [, m, d] = isoDate.split("-").map(Number);
  const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][m - 1];
  return { month, day: d };
}
