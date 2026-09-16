"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deserializeDescriptionContent } from "@/lib/validation/richText";
import {
  createPostSchema,
  updatePostSchema,
  createCommentSchema,
  createPollSchema,
  createVideoPostSchema,
  reactionSchema,
  type CreatePostInput,
  type UpdatePostInput,
  type CreatePollInput,
  type CreateVideoPostInput,
} from "@/lib/validation/feed";
import { getFeedPosts } from "@/lib/queries/feed";

/** Mirrors is_community_staff(community_id) (0001_init.sql) -- checked here
 * first so a caller who isn't staff of the target community gets a plain,
 * friendly error instead of a raw RLS-denied insert failure, same posture
 * as createEvent's getHostableCommunities check. */
async function isCommunityStaff(supabase: SupabaseClient, communityId: string, userId: string) {
  const { data } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "owner" || data?.role === "moderator";
}

export async function createPost(input: Omit<CreatePostInput, "content_content"> & { content_content: string | null }) {
  const user = await requireUser();

  // description_content-style fields cross Server Action boundaries as a
  // JSON string, not the raw object -- see serializeDescriptionContent's
  // comment (a large nested doc silently loses attrs like an image's src
  // otherwise).
  const parsed = createPostSchema.safeParse({
    ...input,
    content_content: deserializeDescriptionContent(input.content_content),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const supabase = await createClient();
  if (!(await isCommunityStaff(supabase, data.community_id, user.id))) {
    return { error: "You can only post as a community you own or moderate" };
  }

  const { data: post, error } = await supabase
    .from("community_posts")
    .insert({
      community_id: data.community_id,
      author_id: user.id,
      // An image-only doc has no text at all, but content has a
      // `char_length between 1 and 2000` check (0099) -- same "📷"
      // placeholder mobile's feed/new.tsx sends for this exact case.
      content: data.content?.trim() || "📷",
      content_content: data.content_content ?? null,
      event_id: data.event_id ?? null,
    })
    .select("id")
    .single();
  if (error || !post) return { error: error?.message ?? "Could not create post" };

  revalidatePath("/feed");
  revalidatePath("/feed/my-posts");
  return { error: null, postId: post.id as string };
}

export async function createPoll(input: CreatePollInput) {
  const user = await requireUser();

  const parsed = createPollSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const supabase = await createClient();
  if (!(await isCommunityStaff(supabase, data.community_id, user.id))) {
    return { error: "You can only post as a community you own or moderate" };
  }

  const { data: post, error: postError } = await supabase
    .from("community_posts")
    .insert({ community_id: data.community_id, author_id: user.id, content: data.question, event_id: data.event_id ?? null })
    .select("id")
    .single();
  if (postError || !post) return { error: postError?.message ?? "Could not create poll" };

  const { data: poll, error: pollError } = await supabase.from("community_polls").insert({ post_id: post.id }).select("id").single();
  if (pollError || !poll) return { error: pollError?.message ?? "Could not create poll" };

  const { error: optionsError } = await supabase
    .from("community_poll_options")
    .insert(data.options.map((label, i) => ({ poll_id: poll.id, label, sort_order: i })));
  if (optionsError) return { error: optionsError.message };

  revalidatePath("/feed");
  revalidatePath("/feed/my-posts");
  return { error: null, postId: post.id as string };
}

// Client uploads the video file itself (community-post-images bucket,
// direct browser upload same as description images) before calling this --
// a Server Action's request body isn't the right place for a multi-MB
// video, same reasoning richText's image uploads already went client-side.
export async function createVideoPost(input: CreateVideoPostInput) {
  const user = await requireUser();

  const parsed = createVideoPostSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const supabase = await createClient();
  if (!(await isCommunityStaff(supabase, data.community_id, user.id))) {
    return { error: "You can only post as a community you own or moderate" };
  }

  const { data: post, error } = await supabase
    .from("community_posts")
    .insert({
      community_id: data.community_id,
      author_id: user.id,
      content: data.caption?.trim() || "🎬",
      video_path: data.video_path,
      event_id: data.event_id ?? null,
    })
    .select("id")
    .single();
  if (error || !post) return { error: error?.message ?? "Could not create post" };

  revalidatePath("/feed");
  revalidatePath("/feed/my-posts");
  return { error: null, postId: post.id as string };
}

export async function updatePost(postId: string, input: Omit<UpdatePostInput, "content_content"> & { content_content: string | null }) {
  await requireUser();

  const parsed = updatePostSchema.safeParse({
    ...input,
    content_content: deserializeDescriptionContent(input.content_content),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const supabase = await createClient();
  // community_posts_update_own_or_staff (0103/0104) is the real gate --
  // author or community staff, with community_id/author_id pinned to their
  // existing values. A non-authorized caller's update simply matches zero
  // rows rather than erroring, same pattern as cancelEvent.
  const { data: updated, error } = await supabase
    .from("community_posts")
    .update({
      content: data.content?.trim() || "📷",
      content_content: data.content_content ?? null,
    })
    .eq("id", postId)
    .select("id");
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: "Not allowed to edit this post" };

  revalidatePath("/feed");
  revalidatePath(`/feed/${postId}`);
  revalidatePath("/feed/my-posts");
  return { error: null };
}

export async function deletePost(postId: string) {
  await requireUser();
  const supabase = await createClient();

  // community_posts_delete_own_or_staff (0099) is the real gate.
  const { data, error } = await supabase.from("community_posts").delete().eq("id", postId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not allowed to delete this post" };

  revalidatePath("/feed");
  revalidatePath("/feed/my-posts");
  return { error: null };
}

/** Sets (or clears, when nextReaction is null) this viewer's emoji reaction
 * on a post -- replaces the old single binary "like" (community_post_likes),
 * mirrors mobile's feed.tsx handleReact exactly. */
export async function reactToPost(postId: string, nextReaction: string | null) {
  const user = await requireUser();
  const supabase = await createClient();

  if (nextReaction === null) {
    await supabase.from("community_post_reactions").delete().eq("post_id", postId).eq("user_id", user.id);
  } else {
    const parsed = reactionSchema.safeParse(nextReaction);
    if (!parsed.success) return { error: "Invalid reaction" };
    await supabase.from("community_post_reactions").upsert({ post_id: postId, user_id: user.id, reaction: parsed.data }, { onConflict: "post_id,user_id" });
  }

  revalidatePath("/feed");
  revalidatePath(`/feed/${postId}`);
  return { error: null };
}

/** Pin/unpin a post to the top of the feed -- community_posts has no
 * dedicated RLS policy restricting who can update is_pinned specifically,
 * so this checks staff-of-the-post's-own-community here first (same
 * up-front-friendly-error posture as createPost's isCommunityStaff check)
 * rather than relying on community_posts_update_own_or_staff alone, which
 * would also let the post's own author (who may not be staff) pin it. */
export async function togglePinPost(postId: string, pinned: boolean) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: post } = await supabase.from("community_posts").select("community_id").eq("id", postId).maybeSingle();
  if (!post || !(await isCommunityStaff(supabase, post.community_id, user.id))) {
    return { error: "Only community staff can pin a post" };
  }

  const { error } = await supabase.from("community_posts").update({ is_pinned: pinned }).eq("id", postId);
  if (error) return { error: error.message };

  revalidatePath("/feed");
  return { error: null };
}

/** Casts (or changes) this viewer's single-choice poll vote --
 * community_poll_votes_insert_own/update_own (0129) reject a vote after
 * closes_at, so a stale client just gets a no-op update from those RLS
 * policies rather than an error. */
export async function votePoll(pollId: string, optionId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("community_poll_votes").upsert({ poll_id: pollId, option_id: optionId, user_id: user.id }, { onConflict: "poll_id,user_id" });
  if (error) return { error: error.message };

  revalidatePath("/feed");
  return { error: null };
}

export async function addComment(postId: string, input: { content: string }) {
  const user = await requireUser();

  const parsed = createCommentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.from("community_post_comments").insert({
    post_id: postId,
    author_id: user.id,
    content: parsed.data.content,
  });
  if (error) return { error: error.message };

  revalidatePath(`/feed/${postId}`);
  return { error: null };
}

export async function deleteComment(commentId: string, postId: string) {
  await requireUser();
  const supabase = await createClient();

  // community_post_comments_delete_own_or_staff (0103) is the real gate --
  // comment author, or staff of the post's own community.
  const { data, error } = await supabase.from("community_post_comments").delete().eq("id", commentId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Not allowed to delete this comment" };

  revalidatePath(`/feed/${postId}`);
  return { error: null };
}

/** No requireUser() -- community_posts_select_public (0099) is already
 * unconditional, same data the feed's initial server-rendered page already
 * exposes; this is just the next page of the exact same read, matching
 * loadMoreCommunityMembers's own comment on the same shape. */
export async function loadMoreFeedPosts(offset: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const posts = await getFeedPosts(supabase, offset, user?.id ?? null);
  return { posts };
}
