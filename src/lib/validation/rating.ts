import { z } from "zod";

export const submitRatingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().max(500).optional(),
});

export type SubmitRatingInput = z.infer<typeof submitRatingSchema>;
