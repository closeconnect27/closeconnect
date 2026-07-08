import { notFound } from "next/navigation";
import Link from "next/link";
import { IconCalendar, IconClock, IconMapPin, IconStar, IconSettings, IconPencil } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import {
  getEventById,
  getEventTicketTypes,
  getEventImages,
  getEventFormFields,
  getTicketAvailability,
  getMyEventCheckIn,
} from "@/lib/queries/events";
import { getMyInterestStatus } from "@/lib/queries/interests";
import { getMyEventFeedback, getEventFeedbackList } from "@/lib/queries/eventFeedback";
import { getCategoryVisual } from "@/lib/categories";
import { communitySeed } from "@/lib/categoryImages";
import { CategoryImage } from "@/components/ui/CategoryImage";
import { EventRegistration } from "@/components/events/EventRegistration";
import { InterestedButton } from "@/components/events/InterestedButton";
import { EventImageUploader } from "@/components/events/EventImageUploader";
import { EventDetailActions } from "@/components/events/EventDetailActions";
import { EventFeedbackSection } from "@/components/events/EventFeedbackSection";
import { PageViewTracker } from "@/components/analytics/PageViewTracker";
import { Linkify } from "@/components/ui/Linkify";
import { CopyLinkButton } from "@/components/ui/CopyLinkButton";

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

  // A null event_date only exists right after duplicateEvent(), before the
  // host has set a real date -- a draft, not a real listing. Invisible to
  // everyone except the host, same treatment as a 404 for anyone else (no
  // partial "coming soon" page that would leak the event's existence).
  if (!event.event_date && !isHost) notFound();

  const visual = getCategoryVisual(event.category ?? "other");

  const [ticketTypes, images, formFields, availability, myInterest, hasCheckedIn, myFeedback, feedbackList] = await Promise.all([
    getEventTicketTypes(supabase, id),
    getEventImages(supabase, id),
    getEventFormFields(supabase, id),
    getTicketAvailability(supabase, id),
    user ? getMyInterestStatus(supabase, id, user.id) : Promise.resolve(null),
    user ? getMyEventCheckIn(supabase, id, user.id) : Promise.resolve(false),
    user ? getMyEventFeedback(supabase, id, user.id) : Promise.resolve(null),
    getEventFeedbackList(supabase, id),
  ]);

  const dateLabel = formatEventDate(event.event_date);

  return (
    <div className="flex-1 pb-10">
      <PageViewTracker targetType="event" targetId={event.id} viewerId={user?.id ?? null} />
      <div className="relative h-48 w-full overflow-hidden sm:h-64" style={{ background: visual.bg }}>
        {event.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- host-uploaded, not from next/image's configured remote patterns
          <img src={event.cover_image_url} alt="" className="h-full w-full object-cover" />
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
              className="rounded-full px-3 py-1 font-mono text-[11px] font-semibold"
              style={{ background: visual.bg, color: visual.light }}
            >
              {visual.label}
            </span>
            {event.community && (
              <Link
                href={`/communities/${event.community.id}`}
                className="rounded-full border border-border2 px-3 py-1 font-mono text-[11px] font-semibold text-green"
              >
                {event.community.name}
              </Link>
            )}
          </div>
          {isHost && (
            <div className="flex gap-2">
              <Link href={`/events/${event.id}/edit`} className="btn-secondary px-3 py-1.5 text-[12px]">
                <IconPencil size={13} />
                Edit
              </Link>
              <Link
                href={`/events/${event.id}/manage`}
                className="btn-secondary px-3 py-1.5 text-[12px]"
              >
                <IconSettings size={13} />
                Manage
              </Link>
            </div>
          )}
        </div>

        <h1 className="font-heading text-[18px] font-bold leading-tight">{event.event_name}</h1>

        <div className="mt-3">
          <CopyLinkButton path={`/events/${event.id}`} label="Copy shareable link" />
        </div>

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
          <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-text2">
            <Linkify text={event.description} />
          </p>
        )}

        {images.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Photos</h2>
            {/* Real cards, not the old cover-banner grid -- these were
                getting squeezed into a fixed h-48/h-64 strip alongside the
                cover image, which made a host's actual photos borderline
                illegible. This is its own section people scroll to, sized
                like any other photo card on the site. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element -- host-uploaded, not from next/image's configured remote patterns
                <img
                  key={img.id}
                  src={img.image_url}
                  alt=""
                  className="h-48 w-full rounded-card object-cover sm:h-40"
                />
              ))}
            </div>
          </div>
        )}

        {isHost && (
          <div className="mt-6">
            <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Manage photos</h2>
            <EventImageUploader eventId={event.id} images={images} />
          </div>
        )}

        <div className="mt-8">
          {!event.event_date ? (
            <p className="rounded-card-sm border border-border bg-bg2 px-4 py-3 text-[13px] text-text3">
              This event is a draft -- set a date on the{" "}
              <Link href={`/events/${event.id}/edit`} className="font-bold text-green">
                edit page
              </Link>{" "}
              to publish it.
            </p>
          ) : isHost ? (
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
            <>
              <div className="mb-4">
                <InterestedButton
                  eventId={event.id}
                  initiallyInterested={!!myInterest}
                  isLoggedIn={!!user}
                />
              </div>
              <EventRegistration
                eventId={event.id}
                ticketTypes={ticketTypes}
                formFields={formFields}
                availability={availability}
                isLoggedIn={!!user}
                email={user?.email}
              />
            </>
          )}
        </div>

        {event.event_date && (
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Feedback</h2>
              {event.feedback_count > 0 && (
                <span className="flex items-center gap-1 text-[13px] text-text2">
                  <IconStar size={14} className="fill-green text-green" />
                  {event.avg_feedback_rating.toFixed(1)} ({event.feedback_count})
                </span>
              )}
            </div>

            {!isHost && (
              <EventFeedbackSection
                eventId={event.id}
                isLoggedIn={!!user}
                hasCheckedIn={hasCheckedIn}
                myFeedback={myFeedback}
              />
            )}

            {feedbackList.length > 0 && (
              <div className="mt-4 flex flex-col gap-3">
                {feedbackList.map((f) => (
                  <div key={f.user_id} className="rounded-card-sm border border-border2 bg-bg2 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold text-text">{f.display_name}</span>
                      <span className="flex items-center gap-1 text-[12px] text-text3">
                        <IconStar size={12} className="fill-green text-green" />
                        {f.rating}/5
                      </span>
                    </div>
                    {f.comment && <p className="mt-1 text-[13px] text-text2">{f.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <EventDetailActions eventId={event.id} isLoggedIn={!!user} />

        <Link href="/events" className="mt-4 block text-center text-[13px] text-text3 transition hover:text-text2">
          ← Back to events
        </Link>
      </div>
    </div>
  );
}

function formatEventDate(isoDate: string | null) {
  if (!isoDate) return "Date to be announced";
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
