import type { SupabaseClient } from "@supabase/supabase-js";

// Public feed (community_posts, 0099) -- these query shapes deliberately
// mirror the mobile app's feed screens field-for-field (same select list,
// same PAGE_SIZE, same two-extra-query engagement attach) so a post/like/
// comment created on either platform reads back identically on both.

export const FEED_PAGE_SIZE = 20;

// Fixed emoji-reaction set (community_post_reactions, 0129) -- replaces the
// old single binary "like" (community_post_likes, 0099, left in place but no
// longer written to going forward), mirrors mobile's feed.tsx exactly.
export type ReactionKey = "like" | "love" | "laugh" | "wow" | "sad" | "clap";
export const REACTIONS: { key: ReactionKey; emoji: string }[] = [
  { key: "like", emoji: "\u{1F44D}" },
  { key: "love", emoji: "❤️" },
  { key: "laugh", emoji: "\u{1F602}" },
  { key: "wow", emoji: "\u{1F62E}" },
  { key: "sad", emoji: "\u{1F622}" },
  { key: "clap", emoji: "\u{1F44F}" },
];

export type FeedPollOption = { id: string; label: string; voteCount: number };
export type FeedPoll = { id: string; closesAt: string | null; options: FeedPollOption[]; totalVotes: number; myVoteOptionId: string | null };

export type FeedPost = {
  id: string;
  community_id: string;
  community_slug: string | null;
  author_id: string;
  content: string;
  content_content: unknown;
  /** Resolved public URLs (not raw storage paths) for pre-rich-editor
   * posts' image_path/image_paths columns -- a post with content_content
   * embeds its own images inline instead, so this is only rendered as a
   * fallback for older rows (mirrors mobile feed.tsx). */
  image_urls: string[];
  video_url: string | null;
  created_at: string;
  community_name: string | null;
  community_image_url: string | null;
  author_name: string | null;
  comment_count: number;
  is_pinned: boolean;
  event_id: string | null;
  event_name: string | null;
  reaction_counts: Partial<Record<ReactionKey, number>>;
  reaction_total: number;
  my_reaction: ReactionKey | null;
  poll: FeedPoll | null;
};

export type FeedComment = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_name: string | null;
  author_avatar: string | null;
};

export type MyFeedPost = {
  id: string;
  content: string;
  content_content: unknown;
  created_at: string;
  community_id: string;
  community_name: string | null;
};

export type PostableCommunity = { id: string; name: string };

export type PostReactor = { user_id: string; display_name: string | null; avatar_url: string | null; reaction: ReactionKey };

/** Who reacted, and with what -- the LinkedIn-style "Reactions" breakdown
 * (All + one tab per reaction actually present), fetched on demand when
 * someone taps the reaction count rather than attached to every feed page
 * load (FeedPostCard already gets counts for that; this is the drill-down).
 * Both tables are public-select, so this reads fine from either the
 * server or a plain client-side call. */
export async function getPostReactors(supabase: SupabaseClient, postId: string): Promise<PostReactor[]> {
  const { data: reactions } = await supabase.from("community_post_reactions").select("user_id, reaction").eq("post_id", postId);
  const rows = (reactions ?? []) as { user_id: string; reaction: ReactionKey }[];
  if (rows.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in(
      "id",
      rows.map((r) => r.user_id)
    );
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows.map((r) => ({
    user_id: r.user_id,
    reaction: r.reaction,
    display_name: profileMap.get(r.user_id)?.display_name ?? null,
    avatar_url: profileMap.get(r.user_id)?.avatar_url ?? null,
  }));
}

export type PostForEdit = {
  id: string;
  community_id: string;
  author_id: string;
  content: string;
  content_content: unknown;
  community_name: string | null;
};

// profiles(display_name) is ambiguous on community_posts -- it has TWO
// paths to profiles (author_id directly, and indirectly through
// community_post_likes), so PostgREST refuses the implicit embed (PGRST201)
// unless the FK is named explicitly. Same reasoning as mobile's feed.tsx.
const FEED_POST_SELECT =
  "id, community_id, author_id, content, content_content, image_path, image_paths, video_path, created_at, is_pinned, event_id, communities(name, slug, unsplash_image_url), profiles!community_posts_author_id_fkey(display_name), events(event_name)";

type FeedPostRow = {
  id: string;
  community_id: string;
  author_id: string;
  content: string;
  content_content: unknown;
  image_path: string | null;
  image_paths: string[] | null;
  video_path: string | null;
  created_at: string;
  is_pinned: boolean;
  event_id: string | null;
  communities: { name: string; slug: string | null; unsplash_image_url: string | null } | null;
  profiles: { display_name: string } | null;
  events: { event_name: string } | null;
};

function mapPostRow(supabase: SupabaseClient, r: FeedPostRow) {
  const paths = r.image_paths && r.image_paths.length > 0 ? r.image_paths : r.image_path ? [r.image_path] : [];
  // Storage paths, not URLs -- resolved to public URLs here (same bucket
  // mobile's feed.tsx reads from) so every caller gets a directly renderable
  // <img src>, matching how community/event images are already returned
  // resolved from queries rather than left as raw paths for callers to
  // reconstruct themselves.
  const imageUrls = paths.map((path) => supabase.storage.from("community-post-images").getPublicUrl(path).data.publicUrl);
  return {
    id: r.id,
    community_id: r.community_id,
    community_slug: r.communities?.slug ?? null,
    author_id: r.author_id,
    content: r.content,
    content_content: r.content_content,
    image_urls: imageUrls,
    video_url: r.video_path ? supabase.storage.from("community-post-images").getPublicUrl(r.video_path).data.publicUrl : null,
    created_at: r.created_at,
    community_name: r.communities?.name ?? null,
    community_image_url: r.communities?.unsplash_image_url ?? null,
    author_name: r.profiles?.display_name ?? null,
    is_pinned: r.is_pinned,
    event_id: r.event_id,
    event_name: r.events?.event_name ?? null,
  };
}

/** Attaches reaction/comment/poll data to a page of raw post rows --
 * mirrors the mobile app's feed.tsx batch-fetch shape field-for-field. */
async function attachEngagement(supabase: SupabaseClient, rows: FeedPostRow[], userId: string | null): Promise<FeedPost[]> {
  if (rows.length === 0) return [];
  const postIds = rows.map((r) => r.id);
  const [{ data: reactions }, { data: comments }, { data: polls }] = await Promise.all([
    supabase.from("community_post_reactions").select("post_id, user_id, reaction").in("post_id", postIds),
    supabase.from("community_post_comments").select("post_id").in("post_id", postIds),
    supabase.from("community_polls").select("id, post_id, closes_at").in("post_id", postIds),
  ]);

  const reactionCounts = new Map<string, Partial<Record<ReactionKey, number>>>();
  const myReaction = new Map<string, ReactionKey>();
  for (const r of (reactions ?? []) as Array<{ post_id: string; user_id: string; reaction: ReactionKey }>) {
    const counts = reactionCounts.get(r.post_id) ?? {};
    counts[r.reaction] = (counts[r.reaction] ?? 0) + 1;
    reactionCounts.set(r.post_id, counts);
    if (userId && r.user_id === userId) myReaction.set(r.post_id, r.reaction);
  }
  const commentCounts = new Map<string, number>();
  for (const c of comments ?? []) commentCounts.set(c.post_id, (commentCounts.get(c.post_id) ?? 0) + 1);

  const pollRows = (polls ?? []) as Array<{ id: string; post_id: string; closes_at: string | null }>;
  const pollIds = pollRows.map((p) => p.id);
  const [{ data: pollOptions }, { data: pollVotes }] =
    pollIds.length > 0
      ? await Promise.all([
          supabase.from("community_poll_options").select("id, poll_id, label, sort_order").in("poll_id", pollIds).order("sort_order"),
          supabase.from("community_poll_votes").select("poll_id, option_id, user_id").in("poll_id", pollIds),
        ])
      : [{ data: [] as { id: string; poll_id: string; label: string }[] }, { data: [] as { poll_id: string; option_id: string; user_id: string }[] }];

  const optionsByPoll = new Map<string, FeedPollOption[]>();
  for (const o of (pollOptions ?? []) as Array<{ id: string; poll_id: string; label: string }>) {
    const list = optionsByPoll.get(o.poll_id) ?? [];
    list.push({ id: o.id, label: o.label, voteCount: 0 });
    optionsByPoll.set(o.poll_id, list);
  }
  const myVoteByPoll = new Map<string, string>();
  for (const v of (pollVotes ?? []) as Array<{ poll_id: string; option_id: string; user_id: string }>) {
    const options = optionsByPoll.get(v.poll_id);
    const option = options?.find((o) => o.id === v.option_id);
    if (option) option.voteCount += 1;
    if (userId && v.user_id === userId) myVoteByPoll.set(v.poll_id, v.option_id);
  }
  const pollByPost = new Map<string, FeedPoll>();
  for (const p of pollRows) {
    const options = optionsByPoll.get(p.id) ?? [];
    pollByPost.set(p.post_id, {
      id: p.id,
      closesAt: p.closes_at,
      options,
      totalVotes: options.reduce((sum, o) => sum + o.voteCount, 0),
      myVoteOptionId: myVoteByPoll.get(p.id) ?? null,
    });
  }

  return rows.map((r) => {
    const counts = reactionCounts.get(r.id) ?? {};
    return {
      ...mapPostRow(supabase, r),
      comment_count: commentCounts.get(r.id) ?? 0,
      reaction_counts: counts,
      reaction_total: Object.values(counts).reduce((sum: number, n) => sum + (n ?? 0), 0),
      my_reaction: myReaction.get(r.id) ?? null,
      poll: pollByPost.get(r.id) ?? null,
    };
  });
}

/** Global, cross-community feed -- "latest community trends," not scoped to
 * communities the viewer has joined (tried scoping this to community_members
 * once; reverted -- the point is surfacing what's trending across the
 * platform, not just a private inbox of your own communities). Every
 * community_posts row is publicly readable (community_posts_select_public,
 * 0099), matching mobile's own feed.tsx. Chronological, not algorithmic (no
 * ranking signal exists yet, and a first cut of a brand-new public-content
 * feature is better simple than wrong). */
export async function getFeedPosts(supabase: SupabaseClient, offset = 0, userId: string | null = null): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from("community_posts")
    .select(FEED_POST_SELECT)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + FEED_PAGE_SIZE - 1);
  if (error) throw error;
  return attachEngagement(supabase, (data ?? []) as unknown as FeedPostRow[], userId);
}

export async function getFeedPostById(supabase: SupabaseClient, postId: string, userId: string | null = null): Promise<FeedPost | null> {
  const { data, error } = await supabase.from("community_posts").select(FEED_POST_SELECT).eq("id", postId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [post] = await attachEngagement(supabase, [data as unknown as FeedPostRow], userId);
  return post;
}

/** Flat, oldest-first comment thread -- no threading/replies, matching
 * mobile's comments.tsx ("a plain flat list + composer is enough for a
 * first cut"). */
export async function getPostComments(supabase: SupabaseClient, postId: string): Promise<FeedComment[]> {
  const { data, error } = await supabase
    .from("community_post_comments")
    .select("id, post_id, author_id, content, created_at, profiles!community_post_comments_author_id_fkey(display_name, avatar_url)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    post_id: string;
    author_id: string;
    content: string;
    created_at: string;
    profiles: { display_name: string; avatar_url: string | null } | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    post_id: r.post_id,
    author_id: r.author_id,
    content: r.content,
    created_at: r.created_at,
    author_name: r.profiles?.display_name ?? null,
    author_avatar: r.profiles?.avatar_url ?? null,
  }));
}

/** Posts authored by this user, most recent first -- mirrors mobile's
 * my-posts.tsx query exactly ("manage what I've already posted"). */
export async function getMyFeedPosts(supabase: SupabaseClient, userId: string): Promise<MyFeedPost[]> {
  const { data, error } = await supabase
    .from("community_posts")
    .select("id, content, content_content, created_at, community_id, communities(name)")
    .eq("author_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    content: string;
    content_content: unknown;
    created_at: string;
    community_id: string;
    communities: { name: string } | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    content_content: r.content_content,
    created_at: r.created_at,
    community_id: r.community_id,
    community_name: r.communities?.name ?? null,
  }));
}

/** Communities this user can post to (owner or moderator) -- mirrors
 * mobile's feed/new.tsx query exactly. Deliberately NOT the same as
 * getHostableCommunities in queries/events.ts, which additionally filters
 * kind='native' and status='active': community_posts' own insert policy
 * (community_posts_insert_staff, 0099) only checks is_community_staff, with
 * no such filter, so a community postable from mobile must stay postable
 * from web too. */
export async function getPostableCommunities(supabase: SupabaseClient, userId: string): Promise<PostableCommunity[]> {
  const { data, error } = await supabase
    .from("community_members")
    .select("communities(id, name)")
    .eq("user_id", userId)
    .in("role", ["owner", "moderator"]);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{ communities: PostableCommunity | null }>;
  return rows.map((r) => r.communities).filter((c): c is PostableCommunity => !!c);
}

/** Whether this user owns/moderates at least one community -- gates the
 * "New post" tile on /create, same as mobile's Create tab canPost check. */
export async function canUserPost(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("community_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("role", ["owner", "moderator"]);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Community ids this user owns/moderates, as a Set -- gates the pin/unpin
 * button per-card in FeedPostCard, mirroring mobile's feed.tsx
 * staffCommunityIds state. */
export async function getStaffCommunityIds(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("community_members").select("community_id, role").eq("user_id", userId).in("role", ["owner", "moderator"]);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.community_id as string));
}

export async function getPostForEdit(supabase: SupabaseClient, postId: string): Promise<PostForEdit | null> {
  const { data, error } = await supabase
    .from("community_posts")
    .select("id, community_id, author_id, content, content_content, communities(name)")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    community_id: string;
    author_id: string;
    content: string;
    content_content: unknown;
    communities: { name: string } | null;
  };
  return {
    id: row.id,
    community_id: row.community_id,
    author_id: row.author_id,
    content: row.content,
    content_content: row.content_content,
    community_name: row.communities?.name ?? null,
  };
}
