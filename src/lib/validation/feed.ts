import { z } from "zod";
import { descriptionContentField, countDescriptionImages } from "@/lib/validation/richText";

// community_posts.content has a `char_length between 1 and 2000` check
// (0099) -- content itself is optional here (an image-only post has no
// text at all) because the refine below requires *either* real text *or*
// at least one image; the action fills the DB's required column with the
// same "📷" placeholder mobile's feed/new.tsx uses for an image-only post.
const postContentShape = {
  content: z.string().trim().max(2000).optional(),
  content_content: descriptionContentField,
};

export const createPostSchema = z
  .object({
    community_id: z.string().uuid(),
    // Optional link back to a past event this community hosted (0129) --
    // an "event recap" post.
    event_id: z.string().uuid().nullable().optional(),
    ...postContentShape,
  })
  .refine((d) => !!d.content?.trim() || countDescriptionImages(d.content_content) > 0, {
    message: "Write something to post, or add a photo",
    path: ["content"],
  });

export type CreatePostInput = z.infer<typeof createPostSchema>;

// A poll's post.content doubles as the question (0129) -- no separate
// question column. Single-choice, at least two non-empty options, same
// shape as mobile's feed/new.tsx.
export const createPollSchema = z.object({
  community_id: z.string().uuid(),
  event_id: z.string().uuid().nullable().optional(),
  question: z.string().trim().min(1, "Write a poll question").max(2000),
  options: z.array(z.string().trim().min(1).max(80)).min(2, "Add at least two poll options").max(6),
});

export type CreatePollInput = z.infer<typeof createPollSchema>;

export const reactionSchema = z.enum(["like", "love", "laugh", "wow", "sad", "clap"]);

// Short video posts (0131): a single video, not routed through the rich
// editor -- a plain caption + a storage path already uploaded client-side
// (community-post-images bucket now also admits video mime types).
export const createVideoPostSchema = z.object({
  community_id: z.string().uuid(),
  event_id: z.string().uuid().nullable().optional(),
  caption: z.string().trim().max(2000).optional(),
  video_path: z.string().min(1),
});

export type CreateVideoPostInput = z.infer<typeof createVideoPostSchema>;

// No community_id -- mirrors mobile's edit.tsx, which never lets an edit
// reassign the post to a different community (community_posts_update_own_or_
// staff, 0104, pins community_id/author_id server-side anyway; this schema
// just keeps the field unreachable from this action too).
export const updatePostSchema = z.object(postContentShape).refine((d) => !!d.content?.trim() || countDescriptionImages(d.content_content) > 0, {
  message: "Write something to post, or add a photo",
  path: ["content"],
});

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

// community_post_comments.content has a `char_length between 1 and 1000`
// check (0103).
export const createCommentSchema = z.object({
  content: z.string().trim().min(1, "Write something to say").max(1000),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
