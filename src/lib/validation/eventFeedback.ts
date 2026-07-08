import { z } from "zod";

export const submitEventFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export type SubmitEventFeedbackInput = z.infer<typeof submitEventFeedbackSchema>;
