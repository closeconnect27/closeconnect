import { IconMapPin } from "@tabler/icons-react";
import { getCategoryVisual } from "@/lib/categories";
import { communitySeed } from "@/lib/categoryImages";
import type { EventListItem } from "@/lib/queries/events";
import { ClickableCard } from "@/components/ui/ClickableCard";
import { CategoryImage } from "@/components/ui/CategoryImage";

// District-scale card: the photo is the card, not a header strip on top of
// one -- large hero imagery, bold confident type, generous sizing, built to
// browse via a satisfying horizontal scroll rather than a dense thumbnail
// grid. Explicitly bigger than the previous compact pass, not a re-described
// version of it: image area alone is taller here than the entire old card's
// image+text combined.
export function EventCard({ event: e }: { event: EventListItem }) {
  const visual = getCategoryVisual(e.category ?? "other");
  const { month, day } = formatDateChip(e.event_date);
  const price = priceLabel(e.event_ticket_types);

  return (
    <ClickableCard
      href={`/events/${e.id}`}
      className="card-elevated block h-full w-full cursor-pointer overflow-hidden rounded-card bg-bg2"
      trackEvent="event_card_opened"
      trackProperties={{ event_id: e.id, category: e.category }}
    >
      <div className="relative h-72" style={{ background: visual.bg }}>
        <CategoryImage
          slug={e.category ?? "other"}
          seed={communitySeed(e.id)}
          unsplashImageUrl={e.unsplash_image_url}
          alt=""
          fill
          sizes="(max-width: 640px) 80vw, 320px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/20" />

        <div className="absolute left-3 top-3 flex w-14 flex-col items-center overflow-hidden rounded-lg bg-bg2/95 text-center shadow-card">
          <span className="w-full bg-pink py-1 font-mono text-[11px] font-semibold uppercase text-white">{month}</span>
          <span className="py-1.5 font-mono text-[20px] font-semibold leading-none text-text">{day}</span>
        </div>

        <span className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1.5 font-mono text-[12px] font-semibold text-white">
          {price}
        </span>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-4">
          <span
            className="w-fit rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold"
            style={{ background: visual.bg, color: visual.light }}
          >
            {visual.label}
          </span>
          <h3 className="line-clamp-2 font-heading text-[18px] font-bold leading-tight text-white">
            {e.event_name}
          </h3>
        </div>
      </div>

      <div className="flex flex-col gap-1 p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-text2">
          {e.host && <span>by {e.host.display_name}</span>}
          {e.community && (
            <span className="flex items-center gap-1.5 text-green">
              · {e.community.name}
            </span>
          )}
        </div>

        {(e.venue || e.city) && (
          <span className="flex items-center gap-1 text-[13px] text-text3">
            <IconMapPin size={13} />
            {[e.venue, e.city].filter(Boolean).join(", ")}
          </span>
        )}
      </div>
    </ClickableCard>
  );
}

function formatDateChip(isoDate: string | null) {
  // Parsed as a plain calendar date, not a Date-with-timezone -- event_date
  // is a SQL `date` column (no time component), so treating it as UTC
  // midnight and reading local month/day back out could roll it to the
  // wrong day depending on the viewer's timezone offset. Null shouldn't
  // reach this card in practice (getEvents excludes draft events), but the
  // column itself is nullable, so this stays defensive rather than assuming.
  if (!isoDate) return { month: "TBD", day: "—" };
  const [, m, d] = isoDate.split("-").map(Number);
  const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][m - 1];
  return { month, day: d };
}

function priceLabel(ticketTypes: { price: number }[]) {
  if (ticketTypes.length === 0) return "Free";
  const min = Math.min(...ticketTypes.map((t) => t.price));
  return min === 0 ? "Free" : `From ₹${min}`;
}
