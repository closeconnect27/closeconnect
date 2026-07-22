"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { createEventSchema } from "@/lib/validation/event";
import { serializeDescriptionContent } from "@/lib/validation/richText";
import type { FormFieldDraft } from "@/lib/validation/forms";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { TicketTypeBuilder, type TicketTypeDraft } from "@/components/events/TicketTypeBuilder";
import { createEvent } from "@/app/actions/events";
import { Combobox } from "@/components/ui/Combobox";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { DatePicker } from "@/components/ui/DatePicker";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { PaymentDetailsForm } from "@/components/host/PaymentDetailsForm";
import { CITY_OPTIONS } from "@/lib/cities";
import type { HostPaymentDetails } from "@/lib/queries/paymentDetails";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

export function NewEventForm({
  hostableCommunities,
  userId,
  paymentDetails,
}: {
  hostableCommunities: { id: string; name: string }[];
  userId: string;
  paymentDetails: HostPaymentDetails | null;
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
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventMode, setEventMode] = useState<"online" | "offline">("offline");
  const [venue, setVenue] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [city, setCity] = useState("");
  const [extraCities, setExtraCities] = useState<string[]>([]);
  const [category, setCategory] = useState<CategorySlug>(CATEGORIES[0].slug);
  const [communityId, setCommunityId] = useState("");
  const [tickets, setTickets] = useState<TicketTypeDraft[]>([
    { name: "General", price: 0, quantity_available: "" },
  ]);
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
      event_date: eventDate,
      event_time: eventTime || undefined,
      event_mode: eventMode,
      venue: eventMode === "offline" ? venue || undefined : undefined,
      meeting_link: eventMode === "online" ? meetingLink || undefined : undefined,
      city: city || undefined,
      extra_cities: extraCities,
      category,
      community_id: communityId || undefined,
      ticket_types: tickets.map((t) => ({
        name: t.name,
        price: t.price,
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <DatePicker value={eventDate || null} onChange={setEventDate} minDate={todayIso()} placeholder="Select a date" />
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

          {tickets.some((t) => t.price > 0) && (
            <PaymentDetailsForm userId={userId} details={paymentDetails} />
          )}

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
      <span className="text-[12px] font-bold text-text3">{label}</span>
      {children}
    </div>
  );
}
