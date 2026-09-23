import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { IconCalendar, IconClock, IconMapPin, IconVideo, IconStar, IconSettings, IconPencil, IconBrandGoogle } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { getCommunityById, communitySlugOrId } from "@/lib/queries/communities";
import {
  getEventById,
  getEventTicketTypes,
  getEventAddons,
  getEventFormFields,
  getEventDateEntries,
  getTicketAvailability,
  getMyEventCheckIn,
  getMyRegistrationCount,
  getMyLatestRegistration,
  getEventMeetingLink,
} from "@/lib/queries/events";
import { getMyInterestStatus } from "@/lib/queries/interests";
import { getMyEventFeedback, getEventFeedbackList } from "@/lib/queries/eventFeedback";
import { getCommunityMembership, getMyJoinRequestStatus, getCommunityFormFields } from "@/lib/queries/membership";
import { getPublicProfileBasic } from "@/lib/queries/profileDetails";
import { isEventPast } from "@/lib/eventStatus";
import { getCategoryVisual } from "@/lib/categories";
import { EventRegistration } from "@/components/events/EventRegistration";
import { CancellationPolicyText } from "@/components/events/CancellationPolicyBuilder";
import { getCancellationPolicyForEvent } from "@/app/actions/eventCancellation";
import { FaqAccordion } from "@/components/events/FaqAccordion";
import { HostEventReviewSummary } from "@/components/events/HostEventReviewSummary";
import { getFaqsForEvent } from "@/app/actions/eventFaqs";
import { InterestedButton } from "@/components/events/InterestedButton";
import { EventDetailActions } from "@/components/events/EventDetailActions";
import { EventFeedbackSection } from "@/components/events/EventFeedbackSection";
import { PageViewTracker } from "@/components/analytics/PageViewTracker";
import { RichTextView } from "@/components/ui/RichTextView";
import { CopyLinkButton } from "@/components/ui/CopyLinkButton";
import { FoundingBadge } from "@/components/ui/FoundingBadge";
import { EventVenueMap } from "@/components/events/EventVenueMap";
import { EventReachOutButton } from "@/components/events/EventReachOutButton";
import { JoinSection } from "@/components/communities/JoinSection";
import { getMyEventDmThread } from "@/lib/queries/eventDm";
import { getDmReadTimestamps, isThreadUnread } from "@/lib/queries/dmReads";
import { buildGoogleCalendarLink } from "@/lib/googleCalendarLink";
import { safeHttpsHref } from "@/lib/validators/links";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("event_name, description, event_date, event_mode, venue, city")
    .eq("id", id)
    .single();
  if (!event) return {};

  const place = event.event_mode === "online" ? ["Online", event.city].filter(Boolean).join(", ") : [event.venue, event.city].filter(Boolean).join(", ");
  const dateLabel = formatEventDate(event.event_date);
  const description = event.description ? event.description.slice(0, 120) : `${dateLabel}${place ? ` · ${place}` : ""}`;
  return {
    title: event.event_name,
    description,
    openGraph: { title: event.event_name, description },
  };
}

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

  const [
    ticketTypes,
    addons,
    formFields,
    dateEntries,
    availability,
    myInterest,
    hasCheckedIn,
    myFeedback,
    feedbackList,
    myRegistrationCount,
    myLatestRegistration,
    meetingLink,
    myProfile,
    cancellationPolicy,
    faqs,
  ] = await Promise.all([
    getEventTicketTypes(supabase, id),
    getEventAddons(supabase, id),
    getEventFormFields(supabase, id),
    getEventDateEntries(supabase, id),
    getTicketAvailability(supabase, id),
    user ? getMyInterestStatus(supabase, id, user.id) : Promise.resolve(null),
    user ? getMyEventCheckIn(supabase, id, user.id) : Promise.resolve(false),
    user ? getMyEventFeedback(supabase, id, user.id) : Promise.resolve(null),
    getEventFeedbackList(supabase, id),
    user ? getMyRegistrationCount(supabase, id, user.id) : Promise.resolve(0),
    user ? getMyLatestRegistration(supabase, id, user.id) : Promise.resolve(null),
    // event_meeting_links' own RLS (0069) is the real gate -- host or a
    // confirmed/paid registrant gets the real link back, anyone else
    // (including a logged-out visitor) gets null, same as "no link set
    // yet." Only worth asking for at all when the event is online.
    user && event.event_mode === "online" ? getEventMeetingLink(supabase, id) : Promise.resolve(null),
    // Registration's own "Name" field (EventRegistration) reads this instead
    // of asking a signed-in registrant to type it -- they already have one.
    user ? getPublicProfileBasic(supabase, user.id) : Promise.resolve(null),
    getCancellationPolicyForEvent(id),
    getFaqsForEvent(id),
  ]);

  // "Contact host" -- an attendee's own thread (0074), never fetched for
  // the host themselves (they get the inbox on the manage page instead,
  // same mutual-exclusivity as the community page's ReachOutButton/
  // DmInboxSection split).
  const myEventDm = user && !isHost ? await getMyEventDmThread(supabase, id, user.id) : null;
  const myEventDmReadTimestamps =
    user && myEventDm?.threadId ? await getDmReadTimestamps(supabase, user.id, "event", [myEventDm.threadId]) : new Map<string, string>();
  const myEventDmHasUnread =
    !!myEventDm?.threadId &&
    !!myEventDm.messages.length &&
    isThreadUnread(
      myEventDm.messages[myEventDm.messages.length - 1].created_at,
      myEventDm.messages[myEventDm.messages.length - 1].sender_id,
      user!.id,
      myEventDmReadTimestamps.get(myEventDm.threadId),
    );

  // Full community record (join_mode/member_limit/member_count) plus this
  // viewer's own membership/request status -- only fetched when the event
  // actually belongs to a community, and event.community itself (id/slug/
  // name) already comes free with getEventById's own join.
  const eventCommunity = event.community ? await getCommunityById(supabase, event.community.id) : null;
  const [communityMembership, communityPendingStatus, communityFormFields] = eventCommunity
    ? await Promise.all([
        user ? getCommunityMembership(supabase, eventCommunity.id, user.id) : Promise.resolve(null),
        user ? getMyJoinRequestStatus(supabase, eventCommunity.id, user.id) : Promise.resolve(null),
        eventCommunity.join_mode === "request" ? getCommunityFormFields(supabase, eventCommunity.id) : Promise.resolve([]),
      ])
    : [null, null, []];
  const isCommunityFull =
    !!eventCommunity && eventCommunity.member_limit != null && eventCommunity.member_count >= eventCommunity.member_limit;

  const dateLabel = formatEventDate(event.event_date);
  const isPastEvent = isEventPast(event);

  // Computed once and reused for both the page-level button and the
  // post-registration success states (EventRegistration) -- null whenever
  // there's no real date yet or the event's been cancelled, same guard the
  // page-level button already used.
  const calendarLink =
    event.event_date && event.status !== "cancelled"
      ? buildGoogleCalendarLink({
          title: event.event_name,
          description: event.description ?? undefined,
          location:
            event.event_mode === "online"
              ? [event.city].filter(Boolean).join(", ") || undefined
              : [event.venue, event.city].filter(Boolean).join(", ") || undefined,
          isoDate: event.event_date,
          endIsoDate: event.event_end_date,
          time: event.event_time,
          endTime: event.event_end_time,
        })
      : null;

  return (
    <div className="flex-1 pb-10">
      <PageViewTracker targetType="event" targetId={event.id} viewerId={user?.id ?? null} />
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
                href={`/communities/${communitySlugOrId(event.community)}`}
                className="rounded-full border border-border2 px-3 py-1 font-mono text-[11px] font-semibold text-green"
              >
                {event.community.name}
              </Link>
            )}
          </div>
          {isHost && (
            <div className="flex gap-2">
              {/* Editing is frozen once the event's happened (updateEvent's
                  own Server Action rejects it too) -- Manage stays available
                  since reviewing past registrants/check-ins is still
                  legitimate after the fact. */}
              {!isPastEvent && (
                <Link href={`/events/${event.id}/edit`} className="btn-secondary px-3 py-1.5 text-[12px]">
                  <IconPencil size={13} />
                  Edit
                </Link>
              )}
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CopyLinkButton path={`/events/${event.id}`} label="Copy shareable link" />
          {calendarLink && (
            <a href={calendarLink} target="_blank" rel="noopener noreferrer" className="btn-secondary px-4 py-2 text-[13px]">
              <IconBrandGoogle size={14} />
              Add to Calendar
            </a>
          )}
          {user && !isHost && (
            <EventReachOutButton
              eventId={event.id}
              eventName={event.event_name}
              threadId={myEventDm?.threadId ?? null}
              initialMessages={myEventDm?.messages ?? []}
              currentUserId={user.id}
              hasUnread={myEventDmHasUnread}
            />
          )}
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
              {event.event_end_time && ` – ${formatEventTime(event.event_end_time)}`}
            </span>
          )}
          {event.event_mode === "online" ? (
            <span className="flex items-center gap-2">
              <IconVideo size={16} className="text-text3" />
              Online{event.city ? ` · ${event.city}` : ""}
            </span>
          ) : (
            (event.venue || event.city) && (
              <span className="flex items-center gap-2">
                <IconMapPin size={16} className="text-text3" />
                {[event.venue, event.city].filter(Boolean).join(", ")}
              </span>
            )
          )}
        </div>

        {(event.min_age || event.max_age || event.gender_restriction) && (
          <p className="mt-2 text-[13px] text-text3">
            Intended for {event.gender_restriction ? (event.gender_restriction === "male" ? "men" : event.gender_restriction === "female" ? "women" : "other genders") : "everyone"}
            {(event.min_age || event.max_age) &&
              ` · ${event.min_age && event.max_age ? `ages ${event.min_age}–${event.max_age}` : event.min_age ? `${event.min_age}+` : `up to ${event.max_age}`}`}
            {event.audience_enforcement === "required" ? " (required)" : " (suggested)"}
          </p>
        )}

        {event.event_mode === "offline" && (
          <EventVenueMap lat={event.venue_lat} lng={event.venue_lng} address={event.venue ?? ""} />
        )}

        {/* Multi-day agenda -- each entry is its own date/time/venue rather
            than one continuous range, so the summary date/time line above
            (which still shows the overall min-to-max span, for a
            quick-glance header) isn't precise enough on its own. */}
        {dateEntries.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 rounded-card border border-border bg-bg2 p-4">
            <h2 className="font-heading text-[13px] font-bold">Dates</h2>
            {dateEntries.map((d) => (
              <div key={d.id} className="flex flex-col gap-0.5 border-b border-border pb-2 text-[13px] text-text2 last:border-b-0 last:pb-0">
                <span className="font-medium text-text">{formatEventDate(d.event_date)}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-text3">
                  {d.event_time && (
                    <span>
                      {formatEventTime(d.event_time)}
                      {d.event_end_time && ` – ${formatEventTime(d.event_end_time)}`}
                    </span>
                  )}
                  {d.venue && <span>{d.venue}</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Meeting link: never rendered from event.* directly (there is no
            such column -- see event_meeting_links/0069) and never shown
            just because event_mode is 'online'. meetingLink is only
            non-null here when this exact viewer's RLS-scoped query was
            actually authorized to read it (host, or a confirmed/paid
            registrant) -- anyone else, this block simply doesn't render.
            Mandatory at creation for online events (validation/event.ts),
            so a null value here only ever means "not authorized to see it
            yet", never "host hasn't set one up." */}
        {meetingLink && (
          <div className="mt-3 flex flex-col gap-1 rounded-card-sm border border-green/30 bg-green-tint px-4 py-3 text-[13px]">
            <span className="flex items-center gap-1.5 font-bold text-text">
              <IconVideo size={14} className="text-green" />
              Meeting link
            </span>
            <a href={safeHttpsHref(meetingLink)} target="_blank" rel="noopener noreferrer" className="break-all text-green hover:underline">
              {meetingLink}
            </a>
          </div>
        )}
        {event.event_mode === "online" && !meetingLink && (
          <p className="mt-3 text-[12px] text-text3">The meeting link is shown once you register.</p>
        )}

        {/* A community-hosted event shows the community, not the
            individual who happens to hold host_id -- attendees came for
            the community, and the Join section right below is the whole
            point of surfacing it here instead of just linking through. */}
        {eventCommunity ? (
          <div className="mt-4 flex flex-col gap-3">
            <Link
              href={`/communities/${communitySlugOrId(eventCommunity)}`}
              className="flex items-center gap-3 rounded-card-sm border border-border bg-bg2 px-4 py-3 transition hover:border-green"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-tint text-[13px] font-bold text-green">
                {eventCommunity.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-[13px]">
                <p className="font-bold text-text">Hosted by {eventCommunity.name}</p>
                <p className="text-text3">Community</p>
              </div>
            </Link>
            <JoinSection
              communityId={eventCommunity.id}
              joinMode={eventCommunity.join_mode}
              isMember={!!communityMembership}
              isOwner={communityMembership?.role === "owner"}
              isLoggedIn={!!user}
              isFull={isCommunityFull}
              pendingStatus={communityPendingStatus}
              formFields={communityFormFields}
              communityName={eventCommunity.name}
            />
          </div>
        ) : (
          event.host && (
            <Link
              href={`/profile/${event.host.id}`}
              className="mt-4 flex items-center gap-3 rounded-card-sm border border-border bg-bg2 px-4 py-3 transition hover:border-green"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-tint text-[13px] font-bold text-green">
                {event.host.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="text-[13px]">
                <p className="flex items-center gap-1.5 font-bold text-text">
                  Hosted by {event.host.display_name}
                  {event.host.is_founding_host && <FoundingBadge />}
                </p>
                <p className="flex items-center gap-1 text-text3">
                  {event.host.host_rating_count > 0 ? (
                    <>
                      <IconStar size={12} className="fill-green text-green" />
                      {event.host.host_rating.toFixed(1)} host rating
                    </>
                  ) : (
                    "New host"
                  )}
                </p>
              </div>
            </Link>
          )
        )}

        <div className="mt-4 text-[15px] leading-relaxed">
          <RichTextView content={event.description_content} plainFallback={event.description} />
        </div>

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
            <>
              <p className="rounded-card-sm border border-border bg-bg2 px-4 py-3 text-[13px] text-text3">
                You&apos;re hosting this event -- see{" "}
                <Link href={`/events/${event.id}/manage`} className="font-bold text-green">
                  Manage
                </Link>{" "}
                for registrants and check-in.
              </p>
              <HostEventReviewSummary ticketTypes={ticketTypes} addons={addons} formFields={formFields} />
            </>
          ) : event.status === "cancelled" ? (
            <p className="rounded-card-sm border border-pink/40 bg-pink-tint px-4 py-3 text-[13px] font-medium text-pink">
              This event has been cancelled.
            </p>
          ) : isPastEvent ? (
            <p className="rounded-card-sm border border-border bg-bg2 px-4 py-3 text-[13px] text-text3">
              This event has already happened -- registration is closed.
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
                displayName={myProfile?.display_name}
                alreadyRegisteredCount={myRegistrationCount}
                initialRegistration={myLatestRegistration}
                calendarLink={calendarLink}
                cancellationPolicy={cancellationPolicy.policy}
                faqs={faqs}
                addons={addons}
              />
            </>
          )}
        </div>

        {/* Section 7: visible before checkout, never buried in a separate
            settings page -- shown regardless of whether the viewer can
            currently register (host, already-past, cancelled, etc.), same
            posture as the ticket price list above. */}
        {ticketTypes.length > 0 && (
          <div className="mt-6 rounded-card-sm border border-border bg-bg2 p-4">
            <h3 className="mb-2 font-heading text-[13px] font-bold">Cancellation &amp; Refund Policy</h3>
            <CancellationPolicyText enabled={cancellationPolicy.policy.enabled} rules={cancellationPolicy.policy.rules} usingDefault={cancellationPolicy.usingDefault} />
          </div>
        )}

        {faqs.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 font-heading text-[13px] font-bold">FAQ</h3>
            <FaqAccordion faqs={faqs} eventId={event.id} />
          </div>
        )}

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
                      <Link href={`/profile/${f.user_id}`} className="text-[13px] font-bold text-text transition hover:text-green hover:underline">
                        {f.display_name}
                      </Link>
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

function formatEventDate(isoDate: string | null, endIsoDate?: string | null) {
  if (!isoDate) return "Date to be announced";
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const startLabel = date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  if (!endIsoDate || endIsoDate === isoDate) return startLabel;

  const [ey, em, ed] = endIsoDate.split("-").map(Number);
  const endDate = new Date(ey, em - 1, ed);
  const endLabel = endDate.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

function formatEventTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
