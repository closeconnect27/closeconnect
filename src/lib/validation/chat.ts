import { z } from "zod";

// content is optional here (an attachment-only message is valid) -- the
// "must have at least one of content/attachment" rule is enforced by the
// DB check constraint (community_messages_has_content_or_attachment,
// 0045), which sendMessage relies on rather than duplicating the rule.
export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(1000, "Message is too long").optional(),
  attachment: z
    .object({
      path: z.string().min(1),
      type: z.enum(["image", "video", "file"]),
      name: z.string().min(1).max(255),
    })
    .optional(),
});

export type SendMessageAttachment = NonNullable<z.infer<typeof sendMessageSchema>["attachment"]>;
