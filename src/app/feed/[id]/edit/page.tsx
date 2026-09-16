import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getPostForEdit } from "@/lib/queries/feed";
import { EditPostForm } from "@/components/feed/EditPostForm";

export const metadata = { title: "Edit post" };

export default async function EditFeedPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const post = await getPostForEdit(supabase, id);
  if (!post) notFound();

  // community_posts_update_own_or_staff (0103/0104) is the real gate on the
  // actual save -- this is just a friendly early redirect-to-404 instead of
  // showing an editable form the save would silently reject.
  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", post.community_id)
    .eq("user_id", user.id)
    .maybeSingle();
  const isStaff = membership?.role === "owner" || membership?.role === "moderator";
  if (post.author_id !== user.id && !isStaff) notFound();

  return (
    <div className="mx-auto max-w-xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-heading text-[22px] font-bold text-text">Edit post</h1>
      <EditPostForm post={post} />
    </div>
  );
}
