"use client";

import { useState, useTransition } from "react";
import type { CategorySlug } from "@/lib/categories";
import { updateEventSchema, updateEventTicketsAndFormSchema } from "@/lib/validation/event";
import { serializeDescriptionContent } from "@/lib/validation/richText";
import type { FormFieldDraft } from "@/lib/validation/forms";
import { updateEvent, updateEventTicketsAndForm } from "@/app/actions/events";
import { saveCancellationPolicy } from "@/app/actions/eventCancellation";
import { TicketTypeBuilder, parsePrice, type TicketTypeDraft } from "@/components/events/TicketTypeBuilder";
import { CancellationPolicyBuilder, draftToRules, type CancellationPolicyDraft } from "@/components/events/CancellationPolicyBuilder";
import type { CancellationPolicySnapshot } from "@/lib/eventCancellation";
import { FaqBuilder } from "@/components/events/FaqBuilder";
import { saveFaqsForEvent } from "@/app/actions/eventFaqs";
import type { EventFaq } from "@/lib/eventFaqs";
import { AddonBuilder, type AddonDraft } from "@/components/events/AddonBuilder";
import { saveAddonsForEvent, type AddonInput } from "@/app/actions/eventAddons";
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
  initialCancellationPolicy,
  initialFaqs,
  initialAddons,
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
  initialCancellationPolicy: CancellationPolicySnapshot;
  initialFaqs: EventFaq[];
  initialAddons: (AddonInput & { id: string })[];
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
  const [minAge, setMinAge] = useState(event.min_age != null ? String(event.min_age) : "");
  const [maxAge, setMaxAge] = useState(event.max_age != null ? String(event.max_age) : "");
  const [genderRestriction, setGenderRestriction] = useState<"male" | "female" | "other" | null>(event.gender_restriction);
  const [audienceEnforcement, setAudienceEnforcement] = useState<"required" | "suggested">(event.audience_enforcement);
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

  const [cancellationPolicy, setCancellationPolicy] = useState<CancellationPolicyDraft>({
    enabled: initialCancellationPolicy.enabled,
    rules: initialCancellationPolicy.rules.map((r) => ({ hoursBefore: String(r.hours_before), refundPercentage: String(r.refund_percentage) })),
  });
  const [policyError, setPolicyError] = useState("");
  const [policyPending, startPolicyTransition] = useTransition();
  const [policySaved, setPolicySaved] = useState(false);

  function handlePolicySubmit(e: React.FormEvent) {
    e.preventDefault();
    setPolicyError("");
    setPolicySaved(false);
    startPolicyTransition(async () => {
      const result = await saveCancellationPolicy(event.id, { enabled: cancellationPolicy.enabled, rules: draftToRules(cancellationPolicy) });
      if (result?.error) setPolicyError(result.error);
      else setPolicySaved(true);
    });
  }

  const [faqs, setFaqs] = useState<EventFaq[]>(initialFaqs);
  const [faqError, setFaqError] = useState("");
  const [faqPending, startFaqTransition] = useTransition();
  const [faqSaved, setFaqSaved] = useState(false);

  // Independent form/save button, same reasoning as handlePolicySubmit --
  // an FAQ edit never touches registration/payment state, so there's no
  // reason to gate it behind the ticket-types freeze or the main form's
  // save cycle.
  function handleFaqSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFaqError("");
    setFaqSaved(false);
    startFaqTransition(async () => {
      const result = await saveFaqsForEvent(event.id, faqs);
      if (result?.error) setFaqError(result.error);
      else setFaqSaved(true);
    });
  }

  const [addons, setAddons] = useState<AddonDraft[]>(
    initialAddons.map((a) => ({
      id: a.id,
      name: a.name,
      price: String(a.price),
      quantity_available: a.quantity_available != null ? String(a.quantity_available) : "",
      is_active: a.is_active,
      is_refundable: a.is_refundable,
    })),
  );
  const [addonsError, setAddonsError] = useState("");
  const [addonsPending, startAddonsTransition] = useTransition();
  const [addonsSaved, setAddonsSaved] = useState(false);

  // Independent form/save button -- add-ons are never frozen after
  // registrations exist (AddonBuilder's own comment: per-row upsert
  // preserves addon_id continuity for historical orders), so there's no
  // reason to gate this behind the ticket-types freeze either.
  function handleAddonsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAddonsError("");
    setAddonsSaved(false);
    startAddonsTransition(async () => {
      const result = await saveAddonsForEvent(
        event.id,
        addons.map((a) => ({
          id: a.id,
          name: a.name,
          price: parsePrice(a.price),
          quantity_available: a.quantity_available ? Number(a.quantity_available) : null,
          is_active: a.is_active,
          is_refundable: a.is_refundable,
        })),
      );
      if (result?.error) setAddonsError(result.error);
      else setAddonsSaved(true);
    });
  }

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
      min_age: minAge.trim() ? Number(minAge.trim()) : undefined,
      max_age: maxAge.trim() ? Number(maxAge.trim()) : undefined,
      gender_restriction: genderRestriction ?? undefined,
      audience_enforcement: audienceEnforcement,
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

        <Field label="Intended audience (optional)">
          <div className="flex gap-3">
            <input
              type="number"
              min={0}
              max={120}
              value={minAge}
              onChange={(e) => setMinAge(e.target.value)}
              placeholder="Min age"
              className={inputClass}
            />
            <input
              type="number"
              min={0}
              max={120}
              value={maxAge}
              onChange={(e) => setMaxAge(e.target.value)}
              placeholder="Max age"
              className={inputClass}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["male", "female", "other"] as const).map((g) => (
              <button
                type="button"
                key={g}
                onClick={() => setGenderRestriction(genderRestriction === g ? null : g)}
                className={
                  genderRestriction === g
                    ? "rounded-full border border-green bg-green px-4 py-2 text-[12px] font-medium text-green-dark transition"
                    : "rounded-full border border-border2 px-4 py-2 text-[12px] font-medium text-text2 transition hover:border-green hover:text-green"
                }
              >
                {g === "male" ? "Men" : g === "female" ? "Women" : "Other"}
              </button>
            ))}
          </div>
          {(minAge || maxAge || genderRestriction) && (
            <div className="mt-2 flex gap-2">
              {(["suggested", "required"] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setAudienceEnforcement(mode)}
                  className={
                    audienceEnforcement === mode
                      ? "rounded-full border border-green bg-green px-4 py-2 text-[12px] font-medium text-green-dark transition"
                      : "rounded-full border border-border2 px-4 py-2 text-[12px] font-medium text-text2 transition hover:border-green hover:text-green"
                  }
                >
                  {mode === "suggested" ? "Suggested only" : "Require match"}
                </button>
              ))}
            </div>
          )}
        </Field>

        {error && <p className="text-[13px] text-pink">{error}</p>}

        <button type="submit" disabled={pending} className="btn-primary py-3 text-[15px]">
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div className="border-t border-border pt-6">
        <h2 className="mb-1 font-heading text-[16px] font-bold">Cancellation &amp; refund policy</h2>
        <p className="mb-4 text-[13px] text-text2">
          Applied to every booking at the moment it&apos;s confirmed -- changing this later never affects bookings already made.
        </p>
        <form onSubmit={handlePolicySubmit} className="flex flex-col gap-4">
          <CancellationPolicyBuilder value={cancellationPolicy} onChange={setCancellationPolicy} />
          {policyError && <p className="text-[13px] text-pink">{policyError}</p>}
          {policySaved && <p className="text-[13px] text-green">Saved.</p>}
          <button type="submit" disabled={policyPending} className="btn-primary self-start px-6 py-2.5 text-[14px]">
            {policyPending ? "Saving…" : "Save policy"}
          </button>
        </form>
      </div>

      <div className="border-t border-border pt-6">
        <h2 className="mb-1 font-heading text-[16px] font-bold">FAQ</h2>
        <p className="mb-4 text-[13px] text-text2">Shown as an expandable list on the event page.</p>
        <form onSubmit={handleFaqSubmit} className="flex flex-col gap-4">
          <FaqBuilder value={faqs} onChange={setFaqs} />
          {faqError && <p className="text-[13px] text-pink">{faqError}</p>}
          {faqSaved && <p className="text-[13px] text-green">Saved.</p>}
          <button type="submit" disabled={faqPending} className="btn-primary self-start px-6 py-2.5 text-[14px]">
            {faqPending ? "Saving…" : "Save FAQ"}
          </button>
        </form>
      </div>

      <div className="border-t border-border pt-6">
        <h2 className="mb-1 font-heading text-[16px] font-bold">Add-ons</h2>
        <p className="mb-4 text-[13px] text-text2">Optional paid extras attendees can add to their order -- editable anytime, even after people have registered.</p>
        <form onSubmit={handleAddonsSubmit} className="flex flex-col gap-4">
          <AddonBuilder addons={addons} onChange={setAddons} />
          {addonsError && <p className="text-[13px] text-pink">{addonsError}</p>}
          {addonsSaved && <p className="text-[13px] text-green">Saved.</p>}
          <button type="submit" disabled={addonsPending} className="btn-primary self-start px-6 py-2.5 text-[14px]">
            {addonsPending ? "Saving…" : "Save add-ons"}
          </button>
        </form>
      </div>

      <div className="border-t border-border pt-6">
        <h2 className="mb-1 font-heading text-[16px] font-bold">Ticket types &amp; registration questions</h2>
        {hasRegistrations ? (
          <div className="mt-4 flex flex-col gap-6">
            <p className="text-[13px] text-text2">
              Locked -- someone has already registered, so ticket types and questions can no longer change. This is what&apos;s saved:
            </p>
            <Field label="Ticket types">
              <div className="flex flex-col gap-1.5">
                {tickets.map((t, i) => (
                  <div key={i} className="flex items-center justify-between rounded-card-sm border border-border2 px-4 py-2.5 text-[13px]">
                    <span className="text-text">{t.name}</span>
                    <span className="text-text3">
                      {Number(t.price) > 0 ? `₹${t.price}` : "Free"}
                      {t.quantity_available && ` · ${t.quantity_available} available`}
                    </span>
                  </div>
                ))}
              </div>
            </Field>
            {draftFormFields.length > 0 && (
              <Field label="Registration questions">
                <div className="flex flex-col gap-1.5">
                  {draftFormFields.map((f, i) => (
                    <div key={i} className="rounded-card-sm border border-border2 px-4 py-2.5 text-[13px] text-text">
                      {f.label}
                      {f.is_required && <span className="ml-1 text-text3">(required)</span>}
                    </div>
                  ))}
                </div>
              </Field>
            )}
          </div>
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
