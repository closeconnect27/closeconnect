import { z } from "zod";

// Unified form-field definition (SPEC.md Section 1: one form-builder system
// powers event registration, ticket-type questions, and community
// join-requests -- shared here so all three reuse the same shape/rules
// rather than each inventing their own.
export const FIELD_TYPES = ["text", "textarea", "email", "phone", "number", "select"] as const;

export const formFieldSchema = z
  .object({
    label: z.string().trim().min(1, "Question text is required").max(120),
    field_type: z.enum(FIELD_TYPES),
    options: z.array(z.string().trim().min(1)).max(20).optional(),
    is_required: z.boolean(),
  })
  .refine((f) => f.field_type !== "select" || (f.options?.length ?? 0) >= 2, {
    message: "Multiple-choice questions need at least 2 options",
    path: ["options"],
  });

export type FormFieldDraft = z.infer<typeof formFieldSchema>;

export const formFieldsSchema = z.array(formFieldSchema).max(15);

// Answers to those questions (event registration + community join-requests).
// Bounded the same way the questions themselves are (max(15) fields above) --
// without this, a direct call to the submitting action (bypassing the
// rendered form entirely) could attach an unbounded number of huge-string
// keys to a single form_responses row (SPEC.md Section 11: never trust the
// client to have enforced shape/size limits).
export const formAnswersSchema = z.record(z.string(), z.string().max(2000)).refine((a) => Object.keys(a).length <= 15, {
  message: "Too many answers",
});
