import { z } from "zod";
import { isCategorySlug } from "@/lib/categories";
import { isCity } from "@/lib/cities";
import { formFieldsSchema } from "@/lib/validation/forms";
import { isValidExternalLink } from "@/lib/validators/links";
import { descriptionContentField } from "@/lib/validation/richText";

// Forms convert an empty selection to `undefined` before this ever runs
// (`city: city || undefined`), so this only ever validates a real,
// non-empty candidate -- no empty-string escape hatch needed. A direct
// `refine(isCity)` (not wrapped in another arrow function) is what lets
// zod's type-predicate narrow this to `City`, not just `string`, so it
// composes with extra_cities.includes(city) below without a cast.
const cityField = z.string().trim().refine(isCity, "Choose a valid city").optional();
const extraCitiesField = z.array(z.string().refine(isCity)).max(5).default([]);

export const createCommunitySchema = z
  .object({
    // Generated client-side (crypto.randomUUID()) before the form even
    // renders, not left to the insert's column default -- so the rich
    // editor can upload inline description images against this id's
    // storage folder *before* the row exists (0053 opens the bucket
    // policy for a not-yet-claimed id specifically to allow this).
    id: z.string().uuid(),
    name: z.string().trim().min(3, "Community name must be at least 3 characters").max(80),
    description: z.string().trim().min(10, "Description must be at least 10 characters").max(3000),
    description_content: descriptionContentField,
    category: z.string().refine(isCategorySlug, "Choose a valid category"),
    extra_categories: z.array(z.string().refine(isCategorySlug)).max(4).default([]),
    city: cityField,
    extra_cities: extraCitiesField,
    community_type: z.enum(["online", "offline", "both"]),
    join_mode: z.enum(["open", "request"]),
    join_form_fields: formFieldsSchema.default([]),
  })
  .refine((c) => !c.extra_categories.includes(c.category), {
    message: "Extra categories can't repeat the primary category",
    path: ["extra_categories"],
  })
  .refine((c) => !c.city || !c.extra_cities.includes(c.city), {
    message: "Extra cities can't repeat the primary city",
    path: ["extra_cities"],
  });

export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;

// Deliberately excludes owner_id, claim_status, and join_mode -- not just a
// smaller form, the Server Action only ever writes these specific columns,
// so a field missing here can never reach the database no matter what a
// caller sends. community_type also isn't included: it wasn't named in the
// edit spec's editable-fields list, unlike everything below.
export const updateCommunitySchema = z
  .object({
    name: z.string().trim().min(3, "Community name must be at least 3 characters").max(80),
    description: z.string().trim().min(10, "Description must be at least 10 characters").max(3000),
    description_content: descriptionContentField,
    category: z.string().refine(isCategorySlug, "Choose a valid category"),
    extra_categories: z.array(z.string().refine(isCategorySlug)).max(4).default([]),
    city: cityField,
    extra_cities: extraCitiesField,
  })
  .refine((c) => !c.extra_categories.includes(c.category), {
    message: "Extra categories can't repeat the primary category",
    path: ["extra_categories"],
  })
  .refine((c) => !c.city || !c.extra_cities.includes(c.city), {
    message: "Extra cities can't repeat the primary city",
    path: ["extra_cities"],
  });

export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;

// Public, no-login submission for an external community listing -- the
// original site's Add Community modal, which this app never actually had
// (confirmed by audit, not assumed). No join_mode here: it only means
// something for a native community with actual membership.
export const submitExternalCommunitySchema = z
  .object({
    name: z.string().trim().min(3, "Community name must be at least 3 characters").max(80),
    description: z.string().trim().min(10, "Description must be at least 10 characters").max(3000),
    description_content: descriptionContentField,
    category: z.string().refine(isCategorySlug, "Choose a valid category"),
    extra_categories: z.array(z.string().refine(isCategorySlug)).max(4).default([]),
    city: cityField,
    extra_cities: extraCitiesField,
    community_type: z.enum(["online", "offline", "both"]),
    external_link: z.string().trim().refine(isValidExternalLink, "Must be a WhatsApp or Instagram link"),
  })
  .refine((c) => !c.extra_categories.includes(c.category), {
    message: "Extra categories can't repeat the primary category",
    path: ["extra_categories"],
  })
  .refine((c) => !c.city || !c.extra_cities.includes(c.city), {
    message: "Extra cities can't repeat the primary city",
    path: ["extra_cities"],
  });

export type SubmitExternalCommunityInput = z.infer<typeof submitExternalCommunitySchema>;

// No email field -- it used to be a free-text input nobody validated
// against anything (any string passed the schema and the claim was still
// granted to the real signed-in claimant_user_id regardless), which meant
// it looked like a check that did nothing. The real contact email is the
// claimant's own session email, taken server-side in submitCommunityClaim.
export const claimCommunitySchema = z.object({
  name: z.string().trim().min(2, "Your name must be at least 2 characters").max(100),
  phone: z.string().trim().min(6, "Enter a valid phone number").max(20),
  proof: z.string().trim().max(500).optional(),
});

export type ClaimCommunityInput = z.infer<typeof claimCommunitySchema>;

export const createGroupSchema = z.object({
  name: z.string().trim().min(2, "Group name must be at least 2 characters").max(60),
  description: z.string().trim().max(200).optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
