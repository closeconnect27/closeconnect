import { z } from "zod";
import { isCategorySlug } from "@/lib/categories";
import { formFieldsSchema, formAnswersSchema } from "@/lib/validation/forms";
import { isValidPaymentLink } from "@/lib/validators/links";

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
    event_name: z.string().trim().min(3, "At least 3 characters").max(100),
    description: z.string().trim().max(3000).optional(),
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    event_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    venue: z.string().trim().max(160).optional(),
    city: z.string().trim().max(80).optional(),
    category: z.string().refine(isCategorySlug, "Choose a valid category"),
    community_id: z.string().uuid().optional(),
    ticket_types: z.array(ticketTypeSchema).min(1, "At least one ticket type is required").max(10),
    form_fields: formFieldsSchema.default([]),
  })
  .refine((e) => e.ticket_types.every((t) => t.price === 0 || !!t.payment_link), {
    message: "Paid ticket types need a payment link",
    path: ["ticket_types"],
  });

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const eventRegistrationSchema = z.object({
  ticket_type_id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(120),
  // Lowercased so it matches the DB's case-insensitive one-registration-per-
  // event-email unique index (0012) exactly, and so exports/display are
  // consistent regardless of how a guest capitalized their own email.
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  answers: formAnswersSchema.default({}),
});

export type EventRegistrationInput = z.infer<typeof eventRegistrationSchema>;
