import { z } from "zod";

export const requestVerificationSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type RequestVerificationInput = z.infer<typeof requestVerificationSchema>;
