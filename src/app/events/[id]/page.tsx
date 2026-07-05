import { notFound } from "next/navigation";
import Link from "next/link";
import { IconCalendar, IconClock, IconMapPin, IconStar, IconSettings } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import {
  getEventById,
  getEventTicketTypes,
  getEventImages,
  getEventFormFields,
  getTicketAvailability,
} from "@/lib/queries/events";
import { getCategoryVisual } from "@/lib/categories";
import { communitySeed } from "@/lib/categoryImages";
import { CategoryImage } from "@/components/ui/CategoryImage";
import { EventRegistration } from "@/components/events/EventRegistration";
import { EventImageUploader } from "@/components/events/EventImageUploader";
import { EventDetailActions } from "@/components/events/EventDetailActions";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  let event;
  try {
    event = await getEventById(supabase, id);
  } catch {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isHost = user?.id === event.host_id;
  const visual = getCategoryVisual(event.category ?? "other");

  const [ticketTypes, images, formFields, availability] = await Promise.all([
    getEventTicketTypes(supabase, id),
    getEventImages(supabase, id),
    getEventFormFields(supabase, id),
    getTicketAvailability(supabase, id),
  ]);

  const dateLabel = formatEventDate(event.event_date);

  return (
    <div className="flex-1 pb-10">
      <div className="relative h-48 w-full sm:h-64" style={{ background: visual.bg }}>
        {images.length > 0 ? (
          <div className="grid h-full grid-cols-3 gap-0.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="relative">
                {images[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={images[i].image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <CategoryImage
                    slug={event.category ?? "other"}
                    seed={communitySeed(event.id) + i}
                    alt=""
                    fill
                    sizes="33vw"
                    className="object-cover"
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <CategoryImage
            slug={event.category ?? "other"}
            seed={communitySeed(event.id)}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 to-black/40" />
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <span
              className="rounded-full px-3 py-1 text-[11px] font-bold"
              style={{ background: visual.bg, color: visual.light }}
            >
              {visual.label}
            </span>
            {event.community && (
              <Link
                href={`/communities/${event.community.id}`}
                className="rounded-full border border-border2 px-3 py-1 text-[11px] font-bold text-green"
              >
                {event.community.name}
              </Link>
            )}
          </div>
          {isHost && (
            <Link
              href={`/events/${event.id}/manage`}
              className="btn-secondary px-3 py-1.5 text-[12px]"
            >
              <IconSettings size={13} />
              Manage
            </Link>
          )}
        </div>

        <h1 className="font-heading text-[28px] font-extrabold leading-tight">{event.event_name}</h1>

        <div className="mt-3 flex flex-col gap-2 text-[14px] text-text2">
          <span className="flex items-center gap-2">
            <IconCalendar size={16} className="text-text3" />
            {dateLabel}
          </span>
          {event.event_time && (
            <span className="flex items-center gap-2">
              <IconClock size={16} className="text-text3" />
              {formatEventTime(event.event_time)}
            </span>
          )}
          {(event.venue || event.city) && (
            <span className="flex items-center gap-2">
              <IconMapPin size={16} className="text-text3" />
              {[event.venue, event.city].filter(Boolean).join(", ")}
            </span>
          )}
        </div>

        {event.host && (
          <div className="mt-4 flex items-center gap-3 rounded-card-sm border border-border bg-bg2 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-tint text-[13px] font-bold text-green">
              {event.host.display_name.charAt(0).toUpperCase()}
            </div>
            <div className="text-[13px]">
              <p className="font-bold text-text">Hosted by {event.host.display_name}</p>
              {event.host.host_rating > 0 && (
                <p className="flex items-center gap-1 text-text3">
                  <IconStar size={12} className="fill-green text-green" />
                  {event.host.host_rating.toFixed(1)} host rating
                </p>
              )}
            </div>
          </div>
        )}

        {event.description && (
          <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-text2">{event.description}</p>
        )}

        {isHost && (
          <div className="mt-6">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-text3">Photos</h2>
            <EventImageUploader eventId={event.id} images={images} />
          </div>
        )}

        <div className="mt-8">
          {isHost ? (
            <p className="rounded-card-sm border border-border bg-bg2 px-4 py-3 text-[13px] text-text3">
              You&apos;re hosting this event -- see{" "}
              <Link href={`/events/${event.id}/manage`} className="font-bold text-green">
                Manage
              </Link>{" "}
              for registrants and check-in.
            </p>
          ) : event.status === "cancelled" ? (
            <p className="rounded-card-sm border border-pink/40 bg-pink-tint px-4 py-3 text-[13px] font-medium text-pink">
              This event has been cancelled.
            </p>
          ) : (
            <EventRegistration
              eventId={event.id}
              ticketTypes={ticketTypes}
              formFields={formFields}
              availability={availability}
              defaultEmail={user?.email}
            />
          )}
        </div>

        <EventDetailActions eventId={event.id} isLoggedIn={!!user} />

        <Link href="/events" className="mt-4 block text-center text-[13px] text-text3 transition hover:text-text2">
          ← back to events
        </Link>
      </div>
    </div>
  );
}

function formatEventDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

function formatEventTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
