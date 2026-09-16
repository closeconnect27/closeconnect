import Link from "next/link";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getMyFeedPosts } from "@/lib/queries/feed";
import { MyPostsList } from "@/components/feed/MyPostsList";

export const metadata = { title: "My posts" };

export default async function MyFeedPostsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const posts = await getMyFeedPosts(supabase, user.id);

  return (
    <div className="mx-auto max-w-xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-heading text-[22px] font-bold text-text">My posts</h1>
        <Link href="/feed" className="text-[13px] text-text3 transition hover:text-text2">
          ← Back to feed
        </Link>
      </div>

      <MyPostsList initialPosts={posts} />
    </div>
  );
}
