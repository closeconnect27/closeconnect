import { z } from "zod";

// Shared between onboarding (first-time set, OnboardingForm/completeOnboarding)
// and profile editing (later changes, EditProfileForm/updateProfile) -- same
// format everywhere a username is ever written, matching the
// profiles_username_format check constraint (0092_onboarding_fields.sql).
export const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "3-20 characters: lowercase letters, numbers, and underscores only");
