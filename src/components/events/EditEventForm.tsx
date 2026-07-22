"use client";

import { useState, useTransition } from "react";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { updateEventSchema, updateEventTicketsAndFormSchema } from "@/lib/validation/event";
import { serializeDescriptionContent } from "@/lib/validation/richText";
import type { FormFieldDraft } from "@/lib/validation/forms";
import { updateEvent, updateEventTicketsAndForm } from "@/app/actions/events";
import { TicketTypeBuilder, type TicketTypeDraft } from "@/components/events/TicketTypeBuilder";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { Combobox } from "@/components/ui/Combobox";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { DatePicker } from "@/components/ui/DatePicker";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { PaymentDetailsForm } from "@/components/host/PaymentDetailsForm";
import { CITY_OPTIONS } from "@/lib/cities";
import type { EventDetail, EventTicketType } from "@/lib/queries/events";
import type { FormField } from "@/lib/queries/membership";
import type { HostPaymentDetails } from "@/lib/queries/paymentDetails";

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
  hasRegistrations,
  userId,
  paymentDetails,
  initialMeetingLink,
}: {
  event: EventDetail;
  ticketTypes: EventTicketType[];
  formFields: FormField[];
  hasRegistrations: boolean;
  // null when the viewer isn't the actual host (e.g. an admin editing on
  // someone else's behalf) -- hides the payment details section entirely
  // rather than showing a form that would silently save against the
  // wrong account (see events/[id]/edit/page.tsx's isHost comment).
  userId: string | null;
  paymentDetails: HostPaymentDetails | null;
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
  const [eventDate, setEventDate] = useState(event.event_date ?? "");
  const [eventTime, setEventTime] = useState(event.event_time ?? "");
  const [eventMode, setEventMode] = useState<"online" | "offline">(event.event_mode);
  const [venue, setVenue] = useState(event.venue ?? "");
  const [meetingLink, setMeetingLink] = useState(initialMeetingLink ?? "");
  const [city, setCity] = useState(event.city ?? "");
  const [extraCities, setExtraCities] = useState<string[]>(event.extra_cities ?? []);
  const [category, setCategory] = useState<CategorySlug>((event.category ?? CATEGORIES[0].slug) as CategorySlug);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const [tickets, setTickets] = useState<TicketTypeDraft[]>(
    ticketTypes.length > 0
      ? ticketTypes.map((t) => ({
          name: t.name,
          price: t.price,
          quantity_available: t.quantity_available != null ? String(t.quantity_available) : "",
        }))
      : [{ name: "General", price: 0, quantity_available: "" }],
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
      event_date: eventDate,
      event_time: eventTime || undefined,
      event_mode: eventMode,
      venue: eventMode === "offline" ? venue || undefined : undefined,
      meeting_link: eventMode === "online" ? meetingLink || undefined : undefined,
      city: city || undefined,
      extra_cities: extraCities,
      category,
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
        price: t.price,
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <DatePicker value={eventDate || null} onChange={setEventDate} placeholder="Select a date" />
          </Field>
          <Field label="Time (optional)">
            <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className={inputClass} />
          </Field>
        </div>

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

        {eventMode === "offline" ? (
          <Field label="Venue (optional)">
            <input value={venue} onChange={(e) => setVenue(e.target.value)} className={inputClass} />
          </Field>
        ) : (
          <Field label="Meeting link">
            <input
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://meet.google.com/…"
              required
              className={inputClass}
            />
            <p className="text-[11px] text-text3">
              Only shown to people who register -- never on the public event page.
            </p>
          </Field>
        )}

        <Field label="City (optional)">
          <Combobox value={city} onChange={setCity} options={CITY_OPTIONS} placeholder="Any city" />
        </Field>

        <Field label="Also show up under (optional, up to 5 more cities)">
          <MultiCombobox
            values={extraCities}
            onChange={setExtraCities}
            options={CITY_OPTIONS.filter((o) => o.value !== city)}
            placeholder="Add more cities"
          />
        </Field>

        <Field label="Category">
          <CategoryPicker value={category} onChange={setCategory} />
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

            {userId && tickets.some((t) => t.price > 0) && (
              <PaymentDetailsForm userId={userId} details={paymentDetails} />
            )}

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
      <span className="text-[12px] font-bold text-text3">{label}</span>
      {children}
    </div>
  );
}
