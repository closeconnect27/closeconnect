"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CategorySlug } from "@/lib/categories";
import { createEventSchema } from "@/lib/validation/event";
import { serializeDescriptionContent } from "@/lib/validation/richText";
import type { FormFieldDraft } from "@/lib/validation/forms";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { TicketTypeBuilder, parsePrice, type TicketTypeDraft } from "@/components/events/TicketTypeBuilder";
import { CancellationPolicyBuilder, DEFAULT_POLICY_DRAFT, draftToRules, type CancellationPolicyDraft } from "@/components/events/CancellationPolicyBuilder";
import { FaqBuilder } from "@/components/events/FaqBuilder";
import type { EventFaq } from "@/lib/eventFaqs";
import { AddonBuilder, type AddonDraft } from "@/components/events/AddonBuilder";
import { EventDateEntryBuilder, type EventDateEntryDraft } from "@/components/events/EventDateEntryBuilder";
import { createEvent } from "@/app/actions/events";
import { saveCancellationPolicy } from "@/app/actions/eventCancellation";
import { saveFaqsForEvent } from "@/app/actions/eventFaqs";
import { saveAddonsForEvent } from "@/app/actions/eventAddons";
import { Combobox } from "@/components/ui/Combobox";
import { CityMultiSelect } from "@/components/ui/CityMultiSelect";
import { CategoryMultiSelect } from "@/components/ui/CategoryMultiSelect";
import { EventDatePicker } from "@/components/events/EventDatePicker";
import { EventTimeFields } from "@/components/events/EventTimeFields";
import { VenueAutocomplete, type VenuePick } from "@/components/ui/VenueAutocomplete";
import { RichTextEditor } from "@/components/ui/RichTextEditor";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

export function NewEventForm({
  hostableCommunities,
}: {
  hostableCommunities: { id: string; name: string }[];
}) {
  const router = useRouter();
  // Generated once, up front -- same reasoning as NewCommunityForm's
  // communityId: the rich editor needs a stable id to upload inline
  // images against before this event exists (0053). Not to be confused
  // with the `communityId` state below, which is which *existing*
  // community (if any) this event attaches to.
  const [eventId] = useState(() => crypto.randomUUID());
  const [eventName, setEventName] = useState("");
  const [description, setDescription] = useState({ json: null as object | null, text: "" });
  // Single-day is the default and shows one date + one start/end time.
  // Multi-day shows a repeatable list of (date, start time, end time,
  // venue) entries instead (EventDateEntryBuilder) -- not a continuous
  // date-range picker, which implied every day in between was also part of
  // the event whether or not that was true.
  const [dayType, setDayType] = useState<"single" | "multi">("single");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventDates, setEventDates] = useState<EventDateEntryDraft[]>([
    { date: "", time: "", endTime: "", venue: "" },
  ]);
  const [eventMode, setEventMode] = useState<"online" | "offline">("offline");
  const [venue, setVenue] = useState("");
  const [venueCoords, setVenueCoords] = useState<{ lat?: number; lng?: number; placeId?: string }>({});
  const [meetingLink, setMeetingLink] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [allCities, setAllCities] = useState(false);
  const [categories, setCategories] = useState<CategorySlug[]>([]);
  const [communityId, setCommunityId] = useState("");
  const [tickets, setTickets] = useState<TicketTypeDraft[]>([
    { name: "General", price: "0", quantity_available: "" },
  ]);
  const [cancellationPolicy, setCancellationPolicy] = useState<CancellationPolicyDraft>(DEFAULT_POLICY_DRAFT);
  const [faqs, setFaqs] = useState<EventFaq[]>([]);
  const [addons, setAddons] = useState<AddonDraft[]>([]);
  const [formFields, setFormFields] = useState<FormFieldDraft[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const input = {
      id: eventId,
      event_name: eventName,
      description: description.text || undefined,
      description_content: description.json,
      event_date: dayType === "single" ? eventDate : undefined,
      event_time: dayType === "single" ? eventTime : undefined,
      event_end_time: dayType === "single" ? eventEndTime || undefined : undefined,
      event_dates:
        dayType === "multi"
          ? eventDates.map((d) => ({
              event_date: d.date,
              event_time: d.time || undefined,
              event_end_time: d.endTime || undefined,
              venue: d.venue || undefined,
              venue_lat: d.venueLat,
              venue_lng: d.venueLng,
              venue_place_id: d.venuePlaceId,
            }))
          : [],
      event_mode: eventMode,
      venue: dayType === "single" && eventMode === "offline" ? venue || undefined : undefined,
      venue_lat: dayType === "single" && eventMode === "offline" ? venueCoords.lat : undefined,
      venue_lng: dayType === "single" && eventMode === "offline" ? venueCoords.lng : undefined,
      venue_place_id: dayType === "single" && eventMode === "offline" ? venueCoords.placeId : undefined,
      meeting_link: eventMode === "online" ? meetingLink || undefined : undefined,
      city: eventMode === "online" ? undefined : allCities ? undefined : cities[0] || undefined,
      extra_cities: eventMode === "online" ? [] : allCities ? [] : cities.slice(1),
      all_cities: eventMode === "online" ? false : allCities,
      category: categories[0] || "",
      extra_categories: categories.slice(1),
      community_id: communityId || undefined,
      ticket_types: tickets.map((t) => ({
        name: t.name,
        price: parsePrice(t.price),
        quantity_available: t.quantity_available ? Number(t.quantity_available) : undefined,
      })),
      form_fields: formFields,
    };

    const parsed = createEventSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    startTransition(async () => {
      // description_content crosses the Server Action boundary as a JSON
      // string, not the raw object -- see serializeDescriptionContent's
      // comment for why.
      const result = await createEvent({
        ...parsed.data,
        description_content: serializeDescriptionContent(parsed.data.description_content as object | null),
      });
      if (result?.error || !result?.eventId) {
        setError(result?.error ?? "Could not create event");
        return;
      }

      // Its own action/table, not part of createEvent's own insert --
      // saveCancellationPolicy is the same call the edit form uses later,
      // so there's exactly one code path that validates/normalizes a
      // policy's rules regardless of when it's set.
      const policyResult = await saveCancellationPolicy(result.eventId, { enabled: cancellationPolicy.enabled, rules: draftToRules(cancellationPolicy) });
      if (policyResult.error) {
        setError(`Event created, but the cancellation policy failed to save: ${policyResult.error}`);
        return;
      }

      if (faqs.length > 0) {
        const faqResult = await saveFaqsForEvent(result.eventId, faqs);
        if (faqResult.error) {
          setError(`Event created, but the FAQ failed to save: ${faqResult.error}`);
          return;
        }
      }

      if (addons.length > 0) {
        const addonsResult = await saveAddonsForEvent(
          result.eventId,
          addons.map((a) => ({ name: a.name, price: parsePrice(a.price), quantity_available: a.quantity_available ? Number(a.quantity_available) : null, is_active: a.is_active })),
        );
        if (addonsResult.error) {
          setError(`Event created, but the add-ons failed to save: ${addonsResult.error}`);
          return;
        }
      }

      // No staged image uploads here anymore -- inline description images
      // need the event to already exist (storage RLS checks an owned row
      // at the target path), so they're only available once editing an
      // existing event, not during this create flow.
      router.push(`/events/${result.eventId}`);
    });
  }

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        <h1 className="font-heading text-[18px] font-bold leading-tight">Host an event</h1>
        <p className="mb-8 text-[14px] text-text3">Registrants sign in to reserve a spot.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Field label="Event name">
            <input value={eventName} onChange={(e) => setEventName(e.target.value)} required className={inputClass} />
          </Field>

          <Field label="Description">
            <RichTextEditor
              content={description.json}
              onChange={setDescription}
              placeholder="What's this event about?"
              imageUpload={{ bucket: "event-images", entityId: eventId }}
            />
          </Field>

          <Field label="Event length">
            <div className="flex gap-2">
              {(["single", "multi"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setDayType(t)}
                  className={
                    dayType === t
                      ? "rounded-full border border-green bg-green px-4 py-2 text-[12px] font-medium text-green-dark transition"
                      : "rounded-full border border-border2 px-4 py-2 text-[12px] font-medium text-text2 transition hover:border-green hover:text-green"
                  }
                >
                  {t === "single" ? "Single day" : "Multi-day"}
                </button>
              ))}
            </div>
          </Field>

          {dayType === "single" ? (
            <>
              <Field label="Date">
                <EventDatePicker
                  startValue={eventDate || null}
                  endValue={null}
                  onChange={(start) => setEventDate(start)}
                  minDate={todayIso()}
                  allowRange={false}
                />
              </Field>
              <EventTimeFields time={eventTime} onTimeChange={setEventTime} endTime={eventEndTime} onEndTimeChange={setEventEndTime} />
            </>
          ) : (
            <Field label="Dates">
              <EventDateEntryBuilder entries={eventDates} onChange={setEventDates} minDate={todayIso()} eventMode={eventMode} />
            </Field>
          )}

          <Field label="Format">
            <div className="flex gap-2">
              {(["offline", "online"] as const).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setEventMode(m)}
                  className={
                    eventMode === m
                      ? "rounded-full border border-green bg-green px-4 py-2 text-[12px] font-medium capitalize text-green-dark transition"
                      : "rounded-full border border-border2 px-4 py-2 text-[12px] font-medium capitalize text-text2 transition hover:border-green hover:text-green"
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>

          {eventMode === "offline" && dayType === "single" ? (
            <Field label="Venue">
              <VenueAutocomplete
                value={venue}
                onChange={(pick: VenuePick) => {
                  setVenue(pick.address);
                  setVenueCoords({ lat: pick.lat, lng: pick.lng, placeId: pick.placeId });
                }}
              />
            </Field>
          ) : eventMode === "offline" ? null : (
            <Field label="Meeting link">
              <input
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://meet.google.com/…"
                className={inputClass}
              />
              <p className="text-[11px] text-text3">
                Shared only with the host and confirmed/paid registrants. Never shown on the public event page.
              </p>
            </Field>
          )}

          {eventMode === "offline" && (
            <Field label="Cities">
              <CityMultiSelect cities={cities} allCities={allCities} onChange={(c, a) => { setCities(c); setAllCities(a); }} />
            </Field>
          )}

          <Field label="Categories (up to 5)">
            <CategoryMultiSelect values={categories} onChange={setCategories} />
          </Field>

          {hostableCommunities.length > 0 && (
            <Field label="Attach to a community (optional)">
              <Combobox
                value={communityId}
                onChange={setCommunityId}
                options={hostableCommunities.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="No community -- host it under your own profile"
              />
            </Field>
          )}

          <Field label="Ticket types">
            <TicketTypeBuilder tickets={tickets} onChange={setTickets} />
          </Field>

          <Field label="Add-ons (optional)">
            <AddonBuilder addons={addons} onChange={setAddons} />
          </Field>

          <Field label="Cancellation & refund policy">
            <CancellationPolicyBuilder value={cancellationPolicy} onChange={setCancellationPolicy} />
          </Field>

          <Field label="FAQ (optional)">
            <FaqBuilder value={faqs} onChange={setFaqs} />
          </Field>

          <Field label="Registration questions (optional)">
            <FormBuilder fields={formFields} onChange={setFormFields} />
          </Field>

          {error && <p className="text-[13px] text-pink">{error}</p>}

          <button type="submit" disabled={pending} className="btn-primary py-3 text-[15px]">
            {pending ? "Publishing…" : "Publish event"}
          </button>
        </form>
      </div>
    </div>
  );
}

// A plain div, not <label> -- ticket-type/category controls contain more
// than one focusable element, same reasoning as /communities/new's Field.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-bold text-text2">{label}</span>
      {children}
    </div>
  );
}
