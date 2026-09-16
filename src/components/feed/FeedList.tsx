"use client";

import { useState, useTransition } from "react";
import { loadMoreFeedPosts } from "@/app/actions/feed";
import { FEED_PAGE_SIZE, type FeedPost } from "@/lib/queries/feed";
import { FeedPostCard } from "@/components/feed/FeedPostCard";

// "Load more" fetches subsequent pages on demand rather than an
// IntersectionObserver-driven auto-scroll -- same client-paginated shape as
// MemberList's loadMoreCommunityMembers (a full page is a fixed 20/request,
// same as mobile's FlatList onEndReached), just triggered by a button
// instead of scroll position, matching every other paginated list on web.
export function FeedList({ initialPosts, isLoggedIn, staffCommunityIds }: { initialPosts: FeedPost[]; isLoggedIn: boolean; staffCommunityIds: string[] }) {
  const staffSet = new Set(staffCommunityIds);
  const [posts, setPosts] = useState(initialPosts);
  const [hasMore, setHasMore] = useState(initialPosts.length === FEED_PAGE_SIZE);
  const [pending, startTransition] = useTransition();

  function handleLoadMore() {
    startTransition(async () => {
      const { posts: nextPage } = await loadMoreFeedPosts(posts.length);
      setPosts((prev) => [...prev, ...nextPage]);
      setHasMore(nextPage.length === FEED_PAGE_SIZE);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {posts.map((post) => (
        <FeedPostCard key={post.id} post={post} isLoggedIn={isLoggedIn} canModerate={staffSet.has(post.community_id)} />
      ))}

      {hasMore && (
        <button onClick={handleLoadMore} disabled={pending} className="btn-secondary mx-auto mt-2 px-6 py-2.5 text-[13px]">
          {pending ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
