"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { createEventSchema } from "@/lib/validation/event";
import type { FormFieldDraft } from "@/lib/validation/forms";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { TicketTypeBuilder, type TicketTypeDraft } from "@/components/events/TicketTypeBuilder";
import { createEvent, addEventImage } from "@/app/actions/events";
import { Combobox } from "@/components/ui/Combobox";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { DatePicker } from "@/components/ui/DatePicker";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { StagedGalleryPicker } from "@/components/ui/StagedGalleryPicker";
import { uploadStagedImage } from "@/lib/uploadStagedImage";
import { CITY_OPTIONS } from "@/lib/cities";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const inputClass =
  "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

export function NewEventForm({ hostableCommunities }: { hostableCommunities: { id: string; name: string }[] }) {
  const router = useRouter();
  const [eventName, setEventName] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [extraCities, setExtraCities] = useState<string[]>([]);
  const [category, setCategory] = useState<CategorySlug>(CATEGORIES[0].slug);
  const [communityId, setCommunityId] = useState("");
  const [tickets, setTickets] = useState<TicketTypeDraft[]>([
    { name: "General", price: 0, payment_link: "", quantity_available: "" },
  ]);
  const [formFields, setFormFields] = useState<FormFieldDraft[]>([]);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
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
      extra_cities: extraCities,
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
      if (result?.error || !result?.eventId) {
        setError(result?.error ?? "Could not create event");
        return;
      }
      const id = result.eventId;

      // Same reasoning as NewCommunityForm: the event exists now, so staged
      // gallery photos can finally upload against a real path. Failures
      // don't block navigation -- land on the manage page instead of the
      // detail page so "some images failed" is somewhere actionable, not a
      // vanished banner.
      const failures: string[] = [];
      for (const file of galleryFiles) {
        const ext = file.name.split(".").pop() ?? "jpg";
        // No subfolder here -- matches EventImageUploader's existing path
        // convention exactly (only cover images live under .../cover/).
        const { url, error: uploadError } = await uploadStagedImage("event-images", `${id}/${crypto.randomUUID()}.${ext}`, file, file.type);
        if (url) await addEventImage(id, url);
        else failures.push(`gallery photo (${uploadError})`);
      }

      router.push(failures.length > 0 ? `/events/${id}/manage` : `/events/${id}`);
    });
  }

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        <h1 className="font-heading text-[18px] font-bold leading-tight">Host an event</h1>
        <p className="mb-8 text-[14px] text-text3">Registrants sign in to reserve a spot.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Field label="Gallery (optional)">
            <StagedGalleryPicker files={galleryFiles} onChange={setGalleryFiles} />
          </Field>

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
              <DatePicker value={eventDate || null} onChange={setEventDate} minDate={todayIso()} placeholder="Select a date" />
            </Field>
            <Field label="Time (optional)">
              <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className={inputClass} />
            </Field>
          </div>

          <Field label="Venue (optional)">
            <input value={venue} onChange={(e) => setVenue(e.target.value)} className={inputClass} />
          </Field>

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
