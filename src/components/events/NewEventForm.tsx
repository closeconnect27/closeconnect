"use client";

import { useState, useTransition } from "react";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { createEventSchema } from "@/lib/validation/event";
import type { FormFieldDraft } from "@/lib/validation/forms";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { TicketTypeBuilder, type TicketTypeDraft } from "@/components/events/TicketTypeBuilder";
import { createEvent } from "@/app/actions/events";

const CITIES = ["Bengaluru", "Mumbai", "Delhi", "Chennai", "Hyderabad", "Pune"];
const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

export function NewEventForm({ hostableCommunities }: { hostableCommunities: { id: string; name: string }[] }) {
  const [eventName, setEventName] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState<CategorySlug>(CATEGORIES[0].slug);
  const [communityId, setCommunityId] = useState("");
  const [tickets, setTickets] = useState<TicketTypeDraft[]>([
    { name: "General", price: 0, payment_link: "", quantity_available: "" },
  ]);
  const [formFields, setFormFields] = useState<FormFieldDraft[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const input = {
      event_name: eventName,
      description: description || undefined,
      event_date: eventDate,
      event_time: eventTime || undefined,
      venue: venue || undefined,
      city: city || undefined,
      category,
      community_id: communityId || undefined,
      ticket_types: tickets.map((t) => ({
        name: t.name,
        price: t.price,
        payment_link: t.payment_link || undefined,
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
      const result = await createEvent(parsed.data);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        <h1 className="font-heading text-[28px] font-extrabold leading-tight">Host an event</h1>
        <p className="mb-8 text-[14px] text-text3">
          Guests can register without an account -- add photos once it&apos;s live.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Field label="Event name">
            <input value={eventName} onChange={(e) => setEventName(e.target.value)} required className={inputClass} />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
            <Field label="Time (optional)">
              <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className={inputClass} />
            </Field>
          </div>

          <Field label="Venue (optional)">
            <input value={venue} onChange={(e) => setVenue(e.target.value)} className={inputClass} />
          </Field>

          <Field label="City (optional)">
            <input value={city} onChange={(e) => setCity(e.target.value)} list="cities" className={inputClass} />
            <datalist id="cities">
              {CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value as CategorySlug)} className={inputClass}>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          {hostableCommunities.length > 0 && (
            <Field label="Attach to a community (optional)">
              <select value={communityId} onChange={(e) => setCommunityId(e.target.value)} className={inputClass}>
                <option value="">No community -- host it under your own profile</option>
                {hostableCommunities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Ticket types">
            <TicketTypeBuilder tickets={tickets} onChange={setTickets} />
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
      <span className="text-[12px] font-bold text-text3">{label}</span>
      {children}
    </div>
  );
}
