import { z } from "zod";
import { isCategorySlug } from "@/lib/categories";
import { formFieldsSchema } from "@/lib/validation/forms";

export const createCommunitySchema = z
  .object({
    name: z.string().trim().min(3, "At least 3 characters").max(80),
    description: z.string().trim().min(10, "At least 10 characters").max(2000),
    category: z.string().refine(isCategorySlug, "Choose a valid category"),
    extra_categories: z.array(z.string().refine(isCategorySlug)).max(4).default([]),
    city: z.string().trim().max(80).optional(),
    community_type: z.enum(["online", "offline", "both"]),
    join_mode: z.enum(["open", "request"]),
    join_form_fields: formFieldsSchema.default([]),
  })
  .refine((c) => !c.extra_categories.includes(c.category), {
    message: "Extra categories can't repeat the primary category",
    path: ["extra_categories"],
  });

export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
