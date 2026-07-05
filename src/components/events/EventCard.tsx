import { IconMapPin } from "@tabler/icons-react";
import { getCategoryVisual } from "@/lib/categories";
import { communitySeed } from "@/lib/categoryImages";
import type { EventListItem } from "@/lib/queries/events";
import { ClickableCard } from "@/components/ui/ClickableCard";
import { CategoryImage } from "@/components/ui/CategoryImage";

// Date-chip-on-photo is the one visual signal every real event platform
// shares (Meetup, BookMyShow, AllEvents, Eventbrite) that community cards
// don't need -- it's the fastest way to scan "when" without reading text.
export function EventCard({ event: e }: { event: EventListItem }) {
  const visual = getCategoryVisual(e.category ?? "other");
  const { month, day } = formatDateChip(e.event_date);
  const price = priceLabel(e.event_ticket_types);

  return (
    <ClickableCard
      href={`/events/${e.id}`}
      className="card-elevated block h-full w-full cursor-pointer overflow-hidden rounded-card bg-bg2"
    >
      <div className="relative h-40" style={{ background: visual.bg }}>
        <CategoryImage
          slug={e.category ?? "other"}
          seed={communitySeed(e.id)}
          alt=""
          fill
          sizes="(max-width: 640px) 50vw, 260px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/10" />

        <div className="absolute left-2 top-2 flex w-11 flex-col items-center overflow-hidden rounded-lg bg-bg2/95 text-center shadow-card">
          <span className="w-full bg-pink py-0.5 text-[10px] font-bold uppercase text-white">{month}</span>
          <span className="py-1 text-[16px] font-extrabold leading-none text-text">{day}</span>
        </div>

        <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[11px] font-bold text-white">
          {price}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 p-4">
        <span
          className="w-fit rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: visual.bg, color: visual.light }}
        >
          {visual.label}
        </span>
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-text">{e.event_name}</h3>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-text3">
          {e.host && <span>by {e.host.display_name}</span>}
          {e.community && <span className="text-green">· {e.community.name}</span>}
        </div>

        {(e.venue || e.city) && (
          <span className="flex items-center gap-1 text-[12px] text-text3">
            <IconMapPin size={12} />
            {[e.venue, e.city].filter(Boolean).join(", ")}
          </span>
        )}
      </div>
    </ClickableCard>
  );
}

function formatDateChip(isoDate: string) {
  // Parsed as a plain calendar date, not a Date-with-timezone -- event_date
  // is a SQL `date` column (no time component), so treating it as UTC
  // midnight and reading local month/day back out could roll it to the
  // wrong day depending on the viewer's timezone offset.
  const [, m, d] = isoDate.split("-").map(Number);
  const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][m - 1];
  return { month, day: d };
}

function priceLabel(ticketTypes: { price: number }[]) {
  if (ticketTypes.length === 0) return "Free";
  const min = Math.min(...ticketTypes.map((t) => t.price));
  return min === 0 ? "Free" : `From ₹${min}`;
}
