import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFeedPostById, getPostComments, getStaffCommunityIds } from "@/lib/queries/feed";
import { FeedPostCard } from "@/components/feed/FeedPostCard";
import { CommentsSection } from "@/components/feed/CommentsSection";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const post = await getFeedPostById(supabase, id);
  if (!post) return {};
  const title = post.community_name ? `${post.community_name} on CloseConnect` : "Post";
  return { title, description: post.content.slice(0, 140) };
}

// Post detail + comments -- mobile has no equivalent single-post-detail
// screen (its comments.tsx assumes the post itself was already seen in the
// feed list), but a shareable web URL (/feed/[id], what FeedPostCard's
// share button copies) needs to show the actual post, not just its
// comment thread.
export default async function FeedPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const post = await getFeedPostById(supabase, id, user?.id ?? null);
  if (!post) notFound();

  const comments = await getPostComments(supabase, id);
  const canModerate = user ? (await getStaffCommunityIds(supabase, user.id)).has(post.community_id) : false;

  return (
    <div className="mx-auto max-w-xl flex-1 px-4 py-8 sm:px-6">
      <FeedPostCard post={post} isLoggedIn={!!user} canModerate={canModerate} />

      <div className="mt-6">
        <CommentsSection postId={id} initialComments={comments} currentUserId={user?.id ?? null} isLoggedIn={!!user} />
      </div>

      <Link href="/feed" className="mt-6 block text-center text-[13px] text-text3 transition hover:text-text2">
        ← Back to feed
      </Link>
    </div>
  );
}
