import Link from "next/link";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getPostableCommunities } from "@/lib/queries/feed";
import { NewPostForm } from "@/components/feed/NewPostForm";

export const metadata = { title: "New post" };

// Staff-only posting (community_posts_insert_staff, 0099) -- only reachable
// at all if the signed-in user owns or moderates at least one community,
// mirroring mobile's feed/new.tsx (which auto-selects the sole option when
// there's exactly one).
export default async function NewFeedPostPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const communities = await getPostableCommunities(supabase, user.id);

  return (
    <div className="mx-auto max-w-xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="font-heading text-[22px] font-bold text-text">New post</h1>

      {communities.length === 0 ? (
        <div className="mt-6 rounded-card-sm border border-border bg-bg2 px-4 py-5 text-center text-[13px] text-text3">
          You need to own or moderate a community to post to the feed.
          <div className="mt-3">
            <Link href="/communities/new" className="btn-primary px-4 py-2 text-[13px]">
              Create a community
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <NewPostForm communities={communities} />
        </div>
      )}
    </div>
  );
}
