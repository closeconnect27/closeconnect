import Link from "next/link";
import { IconMapPin, IconUsers, IconCircleCheck } from "@tabler/icons-react";
import { getCategoryVisual } from "@/lib/categories";
import type { MyEvent } from "@/lib/queries/dashboard";

export function HostEventRow({ event: e, linkHref }: { event: MyEvent; linkHref?: string }) {
  const visual = getCategoryVisual(e.category ?? "other");
  const { month, day } = formatDateChip(e.event_date);

  return (
    <Link
      href={linkHref ?? `/events/${e.id}/manage`}
      className="card-elevated flex items-center gap-3 rounded-card bg-bg2 p-3 sm:p-4"
    >
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
          {e.event_date === null && (
            <span className="shrink-0 rounded-full border border-border2 px-2 py-0.5 text-[10px] font-bold text-text3">
              Draft
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-text3">
          {(e.venue || e.city) && (
            <span className="flex items-center gap-1">
              <IconMapPin size={12} />
              {[e.venue, e.city].filter(Boolean).join(", ")}
            </span>
          )}
          {e.community && <span className="text-green">{e.community.name}</span>}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5 text-[12px] text-text2">
        <span className="flex items-center gap-1 font-bold text-text">
          <IconUsers size={12} />
          {e.registeredCount}
        </span>
        <span className="flex items-center gap-1 font-mono text-text3">
          <IconCircleCheck size={12} />
          {e.checkedInCount} in
        </span>
      </div>
    </Link>
  );
}

function formatDateChip(isoDate: string | null) {
  if (!isoDate) return { month: "TBD", day: "—" };
  const [, m, d] = isoDate.split("-").map(Number);
  const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][m - 1];
  return { month, day: d };
}
