import Link from "next/link";
import { IconMoodEmpty, IconPlus } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { getFeedPosts, getStaffCommunityIds } from "@/lib/queries/feed";
import { FeedList } from "@/components/feed/FeedList";
import { EmptyState } from "@/components/ui/EmptyState";
import { NativeOnly, WebOnly } from "@/components/system/PlatformGate";

export const metadata = {
  title: "Feed",
  description: "Posts from communities across CloseConnect.",
};

// A global, cross-community feed (Instagram/X-style community posts,
// 0099) -- not one feed per community, and not scoped to communities the
// viewer has joined: community_posts is publicly readable unconditionally,
// same posture mobile's feed.tsx takes ("communities can post anything
// publicly"). Chronological, not algorithmic, matching mobile exactly.
export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const posts = await getFeedPosts(supabase, 0, user?.id ?? null);
  const staffCommunityIds = user ? Array.from(await getStaffCommunityIds(supabase, user.id)) : [];

  return (
    <div className="flex-1 pb-16">
      {/* Same two-button header shape as /communities and /events (a
          secondary utility action + a primary green create action) --
          previously just one lone secondary button here, which is what
          read as inconsistent next to those two pages. */}
      <WebOnly>
        <div className="flex flex-col gap-4 px-4 pb-6 pt-8 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-heading text-[28px] font-black leading-tight sm:text-[40px] lg:text-[56px]">
                What Your
                <br />
                Communities Are Saying
              </h1>
              <p className="mt-2 max-w-md text-[14px] text-text3">
                The latest community trends -- updates, photos, and announcements from across CloseConnect.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {user && (
                <Link href="/feed/my-posts" className="btn-secondary px-4 py-2.5 text-[13px]">
                  <span className="hidden sm:inline">My posts</span>
                  <span className="sm:hidden">Mine</span>
                </Link>
              )}
              <Link href={user ? "/feed/new" : "/login?redirect=/feed/new"} className="btn-primary px-4 py-2.5 text-[13px]">
                <IconPlus size={14} />
                <span className="hidden sm:inline">New post</span>
                <span className="sm:hidden">Post</span>
              </Link>
            </div>
          </div>
        </div>
      </WebOnly>
      <NativeOnly>
        <div className="h-4" />
      </NativeOnly>

      <div className="mx-auto mt-6 max-w-xl px-4 sm:px-6">
        {posts.length === 0 ? (
          <EmptyState
            icon={IconMoodEmpty}
            title="No posts yet"
            description="The latest community trends will show up here once communities start posting."
            action={{ label: "Browse communities", href: "/communities" }}
          />
        ) : (
          <FeedList initialPosts={posts} isLoggedIn={!!user} staffCommunityIds={staffCommunityIds} />
        )}
      </div>
    </div>
  );
}
