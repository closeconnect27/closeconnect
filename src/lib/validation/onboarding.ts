import { z } from "zod";

// 18+ per CloseConnect's own Terms/Privacy Policy -- deliberately higher
// than the COPPA-minimum floor (13) many social platforms use, since the
// app involves real payments, DMs with strangers, and in-person meetups.
// Upper bound (120y) exists only to reject obvious typos/garbage dates, not
// a real product constraint.
function isOldEnough(dob: Date) {
  const minAgeCutoff = new Date();
  minAgeCutoff.setFullYear(minAgeCutoff.getFullYear() - 18);
  return dob <= minAgeCutoff;
}
function isNotTooOld(dob: Date) {
  const maxAgeCutoff = new Date();
  maxAgeCutoff.setFullYear(maxAgeCutoff.getFullYear() - 120);
  return dob >= maxAgeCutoff;
}

export const onboardingSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "3-20 characters: lowercase letters, numbers, and underscores only"),
  dateOfBirth: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "Enter a valid date")
    .transform((s) => new Date(s))
    .refine((d) => d <= new Date(), "Date of birth can't be in the future")
    .refine(isOldEnough, "You must be at least 18 years old")
    .refine(isNotTooOld, "Enter a valid date of birth"),
  interests: z.array(z.string()).max(10, "Pick up to 10 interests"),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;
