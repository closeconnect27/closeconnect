import { z } from "zod";
import { isCategorySlug } from "@/lib/categories";
import { isCity } from "@/lib/cities";
import { formFieldsSchema, formAnswersSchema } from "@/lib/validation/forms";
import { descriptionContentField } from "@/lib/validation/richText";
import { isSafeHttpsUrl } from "@/lib/validators/links";

// city is required UNLESS all_cities is set (checked below via refine) --
// so this stays a plain optional field here rather than conditionally
// required inline; the object-level refine is what actually enforces "one
// or the other."
const cityField = z.string().trim().refine(isCity, "Choose a valid city").optional();
// No cap -- see community.ts's extraCitiesField for why.
const extraCitiesField = z.array(z.string().refine(isCity)).default([]);
const allCitiesField = z.boolean().default(false);
// Total cap of 5 (1 primary + up to 4 extra), mirroring communities.
const extraCategoriesField = z.array(z.string().refine(isCategorySlug)).max(4).default([]);

// No payment_link field -- a paid ticket type doesn't collect a per-ticket
// checkout link at all. Registrants pay through the platform's own
// Razorpay Standard Checkout (RazorpayPayButton), no per-host setup needed.
const ticketTypeSchema = z.object({
  name: z.string().trim().min(1, "Ticket name is required").max(60),
  price: z.number().min(0).max(1_000_000),
  quantity_available: z.number().int().min(1).max(100_000).optional(),
});

// A multi-day event is a repeatable list of these instead of one top-level
// date/time/venue -- same idea as ticketTypeSchema, one row per "Add date"
// entry (see EventDateEntryBuilder). venue is per-entry (with its own
// Places Autocomplete lat/lng/place_id, 0114) since a multi-day event's
// sessions can each be somewhere different (e.g. a 3-city tour) -- there's
// no single shared top-level venue for a multi-day event at all, unlike a
// single-day event's one `venue` field.
const eventDateEntrySchema = z
  .object({
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    event_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    event_end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    venue: z.string().trim().max(160).optional(),
    venue_lat: z.number().min(-90).max(90).optional(),
    venue_lng: z.number().min(-180).max(180).optional(),
    venue_place_id: z.string().max(400).optional(),
  })
  .refine((d) => !d.event_end_time || !d.event_time || d.event_end_time > d.event_time, {
    message: "End time must be after the start time",
    path: ["event_end_time"],
  });
const eventDatesField = z.array(eventDateEntrySchema).max(30).default([]);

// meeting_link isn't a column on events at all (it lives on its own
// event_meeting_links table with its own restrictive RLS -- see 0069's
// comment for why a plain column on the publicly-readable events table
// isn't safe for this). It's still validated here alongside event_mode so
// the create/edit forms get one schema to check against; the actions
// split it into the two separate writes it actually needs.
const eventModeField = z.enum(["online", "offline"]).default("offline");
// Required for an online event, cross-field-enforced the same way venue is
// for offline (see the .refine() near the bottom of each schema below) --
// the in-house LiveKit call was removed, so an external meeting link is now
// the only way an online event actually has a "place" to show up.
// `.url()` alone accepts javascript:/data: URIs just fine (verified) --
// isSafeHttpsUrl closes that off. Render-time sanitizing (safeHttpsHref)
// on the event page and in both registration emails is the actual
// defense-in-depth backstop for rows written before this check existed.
const meetingLinkField = z
  .string()
  .trim()
  .url("Meeting link must be a valid URL")
  .refine(isSafeHttpsUrl, "Meeting link must be a valid https:// URL")
  .optional();

export const createEventSchema = z
  .object({
    // Generated client-side (crypto.randomUUID()) before the form even
    // renders -- same reasoning as createCommunitySchema's id field, so
    // the rich editor can upload inline description images against this
    // id's storage folder before the row exists (0053).
    id: z.string().uuid(),
    event_name: z.string().trim().min(3, "Event name must be at least 3 characters").max(100),
    description: z.string().trim().max(3000).optional(),
    description_content: descriptionContentField,
    // Single-day event: event_date/event_time carry the whole thing and
    // event_dates stays empty. Multi-day event: event_dates carries a
    // per-session list instead and event_date/event_time are left unset --
    // the action derives event_date/event_end_date/event_time/event_end_time
    // from the entries (min/max date, first/last time) so every existing
    // consumer that reads those flat columns (list sort, isEventPast,
    // calendar links) keeps working unchanged. The object-level refine
    // below is what actually enforces "one or the other, not neither."
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    event_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    event_end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    event_dates: eventDatesField,
    event_mode: eventModeField,
    venue: z.string().trim().max(160).optional(),
    // Only ever set together, from a single Places Autocomplete selection
    // (VenueAutocomplete) -- null/undefined for a hand-typed venue, or any
    // event created before this field existed.
    venue_lat: z.number().min(-90).max(90).optional(),
    venue_lng: z.number().min(-180).max(180).optional(),
    venue_place_id: z.string().max(400).optional(),
    meeting_link: meetingLinkField,
    city: cityField,
    extra_cities: extraCitiesField,
    all_cities: allCitiesField,
    category: z.string().refine(isCategorySlug, "Choose a valid category"),
    extra_categories: extraCategoriesField,
    community_id: z.string().uuid().optional(),
    ticket_types: z.array(ticketTypeSchema).min(1, "At least one ticket type is required").max(10),
    form_fields: formFieldsSchema.default([]),
  })
  // Online events aren't tied to any physical city -- city selection only
  // applies to (and is only required for) an offline/in-person event.
  .refine((e) => e.event_mode === "online" || e.all_cities || !!e.city, {
    message: "Choose a city, or select All cities",
    path: ["city"],
  })
  .refine((e) => !e.city || !e.extra_cities.includes(e.city), {
    message: "Extra cities can't repeat the primary city",
    path: ["extra_cities"],
  })
  .refine((e) => !e.extra_categories.includes(e.category), {
    message: "Extra categories can't repeat the primary category",
    path: ["extra_categories"],
  })
  .refine((e) => e.event_dates.length > 0 || (!!e.event_date && !!e.event_time), {
    message: "Choose a date and start time",
    path: ["event_date"],
  })
  .refine((e) => e.event_dates.length > 0 || !e.event_end_time || !e.event_time || e.event_end_time > e.event_time, {
    message: "End time must be after the start time",
    path: ["event_end_time"],
  })
  // Single-day: the one top-level venue is required, same as before.
  // Multi-day: there is no top-level venue at all -- every entry needs its
  // own instead (a multi-day event's sessions can each be somewhere
  // different, so there's nothing sensible to default an unset entry to).
  .refine(
    (e) =>
      e.event_mode !== "offline" ||
      (e.event_dates.length > 0 ? e.event_dates.every((d) => !!d.venue?.trim()) : !!e.venue?.trim()),
    {
      message: "Venue is required",
      path: ["venue"],
    },
  )
  // Mirrors the venue refine above -- an online event's "place" is its
  // meeting link, now that there's no in-house call to fall back on.
  .refine((e) => e.event_mode !== "online" || !!e.meeting_link?.trim(), {
    message: "Meeting link is required for an online event",
    path: ["meeting_link"],
  });

export type CreateEventInput = z.infer<typeof createEventSchema>;

// Deliberately excludes host_id and community_id -- same reasoning as
// updateCommunitySchema excluding owner_id: the Server Action only ever
// writes these specific columns, so a field missing here can never reach
// the database regardless of what a caller sends. Also excludes status
// (cancelling is its own dedicated action, not part of free-form editing)
// and ticket_types/form_fields (editing those after people have already
// registered has real implications -- e.g. changing a paid ticket's price
// out from under existing registrants -- that this pass doesn't attempt to
// solve; out of scope for now, flagged separately).
export const updateEventSchema = z
  .object({
    event_name: z.string().trim().min(3, "Event name must be at least 3 characters").max(100),
    description: z.string().trim().max(3000).optional(),
    description_content: descriptionContentField,
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    event_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    event_end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    event_dates: eventDatesField,
    event_mode: eventModeField,
    venue: z.string().trim().max(160).optional(),
    // Only ever set together, from a single Places Autocomplete selection
    // (VenueAutocomplete) -- null/undefined for a hand-typed venue, or any
    // event created before this field existed.
    venue_lat: z.number().min(-90).max(90).optional(),
    venue_lng: z.number().min(-180).max(180).optional(),
    venue_place_id: z.string().max(400).optional(),
    meeting_link: meetingLinkField,
    city: cityField,
    extra_cities: extraCitiesField,
    all_cities: allCitiesField,
    category: z.string().refine(isCategorySlug, "Choose a valid category"),
    extra_categories: extraCategoriesField,
  })
  // Online events aren't tied to any physical city -- city selection only
  // applies to (and is only required for) an offline/in-person event.
  .refine((e) => e.event_mode === "online" || e.all_cities || !!e.city, {
    message: "Choose a city, or select All cities",
    path: ["city"],
  })
  .refine((e) => !e.city || !e.extra_cities.includes(e.city), {
    message: "Extra cities can't repeat the primary city",
    path: ["extra_cities"],
  })
  .refine((e) => !e.extra_categories.includes(e.category), {
    message: "Extra categories can't repeat the primary category",
    path: ["extra_categories"],
  })
  .refine((e) => e.event_dates.length > 0 || (!!e.event_date && !!e.event_time), {
    message: "Choose a date and start time",
    path: ["event_date"],
  })
  .refine((e) => e.event_dates.length > 0 || !e.event_end_time || !e.event_time || e.event_end_time > e.event_time, {
    message: "End time must be after the start time",
    path: ["event_end_time"],
  })
  // Single-day: the one top-level venue is required, same as before.
  // Multi-day: there is no top-level venue at all -- every entry needs its
  // own instead (a multi-day event's sessions can each be somewhere
  // different, so there's nothing sensible to default an unset entry to).
  .refine(
    (e) =>
      e.event_mode !== "offline" ||
      (e.event_dates.length > 0 ? e.event_dates.every((d) => !!d.venue?.trim()) : !!e.venue?.trim()),
    {
      message: "Venue is required",
      path: ["venue"],
    },
  )
  .refine((e) => e.event_mode !== "online" || !!e.meeting_link?.trim(), {
    message: "Meeting link is required for an online event",
    path: ["meeting_link"],
  });

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

// Split out from updateEventSchema on purpose: ticket types/form fields are
// only editable while the event has zero registrations (server-checked in
// the action, not just a UI toggle) -- a separate schema keeps that
// narrower, riskier write path from ever being reachable through the
// regular details-only update.
export const updateEventTicketsAndFormSchema = z.object({
  ticket_types: z.array(ticketTypeSchema).min(1, "At least one ticket type is required").max(10),
  form_fields: formFieldsSchema.default([]),
});

export type UpdateEventTicketsAndFormInput = z.infer<typeof updateEventTicketsAndFormSchema>;

export const eventRegistrationSchema = z.object({
  ticket_type_id: z.string().uuid(),
  name: z.string().trim().min(1, "Your name is required").max(120),
  // No email field -- registration requires an account (SPEC.md's earlier
  // guest-friendly decision is reversed), so the registrant's email comes
  // from their authenticated session server-side, never from client input.
  answers: formAnswersSchema.default({}),
  // Buying more than one ticket in a single registration (e.g. for a
  // group of friends) -- capped at 10, matching the DB check constraint
  // (0055). Defaults to 1 so every existing call site that doesn't pass
  // this keeps behaving exactly as before.
  quantity: z.number().int().min(1).max(10).default(1),
  // Add-on selections -- addon_id/quantity only, never a price: the real
  // price is always re-read from event_addons server-side in
  // registerForEvent, so a tampered request can't buy an add-on for less.
  addons: z
    .array(z.object({ addon_id: z.string().uuid(), quantity: z.number().int().min(1).max(10) }))
    .max(20)
    .default([]),
});

export type EventRegistrationInput = z.infer<typeof eventRegistrationSchema>;

// Shared by the "message registrants right now" and "schedule a reminder
// for later" flows -- both just insert an event_reminders row (0022), only
// send_at differs (now vs. a future timestamp). The already-deployed cron
// job (every 5 minutes) and Edge Function handle the rest either way.
export const eventReminderSchema = z.object({
  message: z.string().trim().min(1, "Write something to send").max(500),
  send_at: z.string().datetime().optional(),
});

export type EventReminderInput = z.infer<typeof eventReminderSchema>;
