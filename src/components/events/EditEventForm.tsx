"use client";

import { useState, useTransition } from "react";
import type { CategorySlug } from "@/lib/categories";
import { updateEventSchema, updateEventTicketsAndFormSchema } from "@/lib/validation/event";
import { serializeDescriptionContent } from "@/lib/validation/richText";
import type { FormFieldDraft } from "@/lib/validation/forms";
import { updateEvent, updateEventTicketsAndForm } from "@/app/actions/events";
import { TicketTypeBuilder, parsePrice, type TicketTypeDraft } from "@/components/events/TicketTypeBuilder";
import { EventDateEntryBuilder, type EventDateEntryDraft } from "@/components/events/EventDateEntryBuilder";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { CityMultiSelect } from "@/components/ui/CityMultiSelect";
import { CategoryMultiSelect } from "@/components/ui/CategoryMultiSelect";
import { EventDatePicker } from "@/components/events/EventDatePicker";
import { EventTimeFields } from "@/components/events/EventTimeFields";
import { VenueAutocomplete, type VenuePick } from "@/components/ui/VenueAutocomplete";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import type { EventDetail, EventTicketType, EventDateEntry } from "@/lib/queries/events";
import type { FormField } from "@/lib/queries/membership";

const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

// Editable: name, description, date, time, format (online/offline) with
// venue or meeting link to match, city, category. Cover image upload was
// removed (the app always shows a category Unsplash placeholder now). Not
// here, deliberately: host_id, community_id (excluded per spec),
// status (cancelling is its own action). ticket_types/form_fields are a
// separate form below, gated on hasRegistrations -- editing those after
// registrants exist is the real, unsolved risk (e.g. changing a paid
// ticket's price out from under someone who already paid); a duplicated
// event always starts with zero registrations, so that path stays open
// exactly until the first person registers.
export function EditEventForm({
  event,
  ticketTypes,
  formFields,
  dateEntries,
  hasRegistrations,
  initialMeetingLink,
}: {
  event: EventDetail;
  ticketTypes: EventTicketType[];
  formFields: FormField[];
  dateEntries: EventDateEntry[];
  hasRegistrations: boolean;
  // null/undefined when there's no link yet, or (per getEventMeetingLink's
  // own comment) when the viewer isn't authorized to see one -- this page
  // is host/admin-gated already, so in practice a null here just means
  // "not set yet."
  initialMeetingLink: string | null | undefined;
}) {
  const [eventName, setEventName] = useState(event.event_name);
  const [description, setDescription] = useState({
    json: event.description_content,
    text: event.description ?? "",
  });
  // Seeded from whether this event already has date_entries rows -- an
  // event created before this list existed (or a single-day event) reads
  // as single-day, using the flat event_date/event_time fields directly.
  const [dayType, setDayType] = useState<"single" | "multi">(dateEntries.length > 0 ? "multi" : "single");
  const [eventDate, setEventDate] = useState(event.event_date ?? "");
  const [eventTime, setEventTime] = useState(event.event_time ?? "");
  const [eventEndTime, setEventEndTime] = useState(event.event_end_time ?? "");
  const [eventDates, setEventDates] = useState<EventDateEntryDraft[]>(
    dateEntries.length > 0
      ? dateEntries.map((d) => ({ date: d.event_date, time: d.event_time ?? "", endTime: d.event_end_time ?? "", venue: d.venue ?? "" }))
      : [{ date: "", time: "", endTime: "", venue: "" }],
  );
  const [eventMode, setEventMode] = useState<"online" | "offline">(event.event_mode);
  const [venue, setVenue] = useState(event.venue ?? "");
  const [venueCoords, setVenueCoords] = useState<{ lat?: number; lng?: number; placeId?: string }>({
    lat: event.venue_lat ?? undefined,
    lng: event.venue_lng ?? undefined,
  });
  const [meetingLink, setMeetingLink] = useState(initialMeetingLink ?? "");
  const [cities, setCities] = useState<string[]>(
    event.all_cities ? [] : [event.city, ...(event.extra_cities ?? [])].filter((c): c is string => !!c),
  );
  const [allCities, setAllCities] = useState(event.all_cities);
  const [categories, setCategories] = useState<CategorySlug[]>(
    [event.category, ...(event.extra_categories ?? [])].filter((c): c is CategorySlug => !!c),
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const [tickets, setTickets] = useState<TicketTypeDraft[]>(
    ticketTypes.length > 0
      ? ticketTypes.map((t) => ({
          name: t.name,
          price: String(t.price),
          quantity_available: t.quantity_available != null ? String(t.quantity_available) : "",
        }))
      : [{ name: "General", price: "0", quantity_available: "" }],
  );
  const [draftFormFields, setDraftFormFields] = useState<FormFieldDraft[]>(
    formFields.map((f) => ({
      label: f.label,
      field_type: f.field_type,
      options: f.options ?? [],
      is_required: f.is_required,
    })),
  );
  const [ticketsError, setTicketsError] = useState("");
  const [ticketsPending, startTicketsTransition] = useTransition();
  const [ticketsSaved, setTicketsSaved] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const input = {
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
    };

    const parsed = updateEventSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    startTransition(async () => {
      // description_content crosses the Server Action boundary as a JSON
      // string, not the raw object -- see serializeDescriptionContent's
      // comment for why.
      const result = await updateEvent(event.id, {
        ...parsed.data,
        description_content: serializeDescriptionContent(parsed.data.description_content as object | null),
      });
      if (result?.error) setError(result.error);
    });
  }

  function handleTicketsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTicketsError("");
    setTicketsSaved(false);

    const input = {
      ticket_types: tickets.map((t) => ({
        name: t.name,
        price: parsePrice(t.price),
        quantity_available: t.quantity_available ? Number(t.quantity_available) : undefined,
      })),
      form_fields: draftFormFields,
    };

    const parsed = updateEventTicketsAndFormSchema.safeParse(input);
    if (!parsed.success) {
      setTicketsError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    startTicketsTransition(async () => {
      const result = await updateEventTicketsAndForm(event.id, parsed.data);
      if (result?.error) setTicketsError(result.error);
      else setTicketsSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Field label="Event name">
          <input value={eventName} onChange={(e) => setEventName(e.target.value)} required className={inputClass} />
        </Field>

        <Field label="Description">
          <RichTextEditor
            content={description.json}
            onChange={setDescription}
            placeholder="What's this event about?"
            imageUpload={{ bucket: "event-images", entityId: event.id }}
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
                allowRange={false}
              />
            </Field>
            <EventTimeFields time={eventTime} onTimeChange={setEventTime} endTime={eventEndTime} onEndTimeChange={setEventEndTime} />
          </>
        ) : (
          <Field label="Dates">
            <EventDateEntryBuilder entries={eventDates} onChange={setEventDates} eventMode={eventMode} />
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

        {error && <p className="text-[13px] text-pink">{error}</p>}

        <button type="submit" disabled={pending} className="btn-primary py-3 text-[15px]">
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div className="border-t border-border pt-6">
        <h2 className="mb-1 font-heading text-[16px] font-bold">Ticket types &amp; registration questions</h2>
        {hasRegistrations ? (
          <p className="text-[13px] text-text2">
            Locked -- someone has already registered, so ticket types and questions can no longer change.
          </p>
        ) : (
          <form onSubmit={handleTicketsSubmit} className="mt-4 flex flex-col gap-6">
            <Field label="Ticket types">
              <TicketTypeBuilder tickets={tickets} onChange={setTickets} />
            </Field>

            <Field label="Registration questions (optional)">
              <FormBuilder fields={draftFormFields} onChange={setDraftFormFields} />
            </Field>

            {ticketsError && <p className="text-[13px] text-pink">{ticketsError}</p>}
            {ticketsSaved && <p className="text-[13px] text-green">Saved.</p>}

            <button type="submit" disabled={ticketsPending} className="btn-primary py-3 text-[15px]">
              {ticketsPending ? "Saving…" : "Save ticket types & questions"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-bold text-text2">{label}</span>
      {children}
    </div>
  );
}
