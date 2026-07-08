import { z } from "zod";
import { isValidLinkedInUrl, isValidGithubUrl, isValidInstagramUrl } from "@/lib/validators/links";

// Forms convert an empty input to `undefined` before this runs (matching
// the cityField/extra_cities pattern in validation/community.ts), so a
// blank social-link field isn't forced through the domain check.
const linkedinField = z.string().trim().refine(isValidLinkedInUrl, "Must be a linkedin.com profile URL").optional();
const githubField = z.string().trim().refine(isValidGithubUrl, "Must be a github.com profile URL").optional();
const instagramField = z.string().trim().refine(isValidInstagramUrl, "Must be an instagram.com profile URL").optional();

// display_name/avatar_url deliberately excluded -- out of scope for this
// pass (display_name has never had an edit path at all; adding one is a
// separate concern from the new profile-detail fields this schema covers).
export const updateProfileSchema = z.object({
  bio: z.string().trim().max(1000).optional(),
  occupation: z.string().trim().max(100).optional(),
  company: z.string().trim().max(100).optional(),
  college: z.string().trim().max(100).optional(),
  linkedin_url: linkedinField,
  github_url: githubField,
  instagram_url: instagramField,
  skills: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  profile_visibility: z.enum(["public", "members_only", "private"]),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
