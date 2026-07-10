import { z } from "zod";
import { isCategorySlug } from "@/lib/categories";
import { isCity } from "@/lib/cities";
import { formFieldsSchema, formAnswersSchema } from "@/lib/validation/forms";
import { isValidPaymentLink } from "@/lib/validators/links";
import { descriptionContentField } from "@/lib/validation/richText";

// See lib/validation/community.ts's cityField for why this is a direct
// refine(isCity), not wrapped in another arrow function.
const cityField = z.string().trim().refine(isCity, "Choose a valid city").optional();
const extraCitiesField = z.array(z.string().refine(isCity)).max(5).default([]);

const ticketTypeSchema = z.object({
  name: z.string().trim().min(1, "Ticket name is required").max(60),
  price: z.number().min(0).max(1_000_000),
  payment_link: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isValidPaymentLink(v), "Payment link must be a valid https:// link"),
  quantity_available: z.number().int().min(1).max(100_000).optional(),
});

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
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    event_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    venue: z.string().trim().max(160).optional(),
    city: cityField,
    extra_cities: extraCitiesField,
    category: z.string().refine(isCategorySlug, "Choose a valid category"),
    community_id: z.string().uuid().optional(),
    ticket_types: z.array(ticketTypeSchema).min(1, "At least one ticket type is required").max(10),
    form_fields: formFieldsSchema.default([]),
  })
  .refine((e) => e.ticket_types.every((t) => t.price === 0 || !!t.payment_link), {
    message: "Paid ticket types need a payment link",
    path: ["ticket_types"],
  })
  .refine((e) => !e.city || !e.extra_cities.includes(e.city), {
    message: "Extra cities can't repeat the primary city",
    path: ["extra_cities"],
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
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    event_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    venue: z.string().trim().max(160).optional(),
    city: cityField,
    extra_cities: extraCitiesField,
    category: z.string().refine(isCategorySlug, "Choose a valid category"),
  })
  .refine((e) => !e.city || !e.extra_cities.includes(e.city), {
    message: "Extra cities can't repeat the primary city",
    path: ["extra_cities"],
  });

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

// Split out from updateEventSchema on purpose: ticket types/form fields are
// only editable while the event has zero registrations (server-checked in
// the action, not just a UI toggle) -- a separate schema keeps that
// narrower, riskier write path from ever being reachable through the
// regular details-only update.
export const updateEventTicketsAndFormSchema = z
  .object({
    ticket_types: z.array(ticketTypeSchema).min(1, "At least one ticket type is required").max(10),
    form_fields: formFieldsSchema.default([]),
  })
  .refine((e) => e.ticket_types.every((t) => t.price === 0 || !!t.payment_link), {
    message: "Paid ticket types need a payment link",
    path: ["ticket_types"],
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
