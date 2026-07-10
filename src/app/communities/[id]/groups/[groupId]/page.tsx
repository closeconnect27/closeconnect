import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { canReadGroup, canPostToGroup, getGroupMessages, getGroupById } from "@/lib/queries/chat";
import { markGroupRead } from "@/app/actions/chat";
import { GroupChat } from "@/components/communities/GroupChat";

export default async function GroupChatPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string }>;
}) {
  const { id, groupId } = await params;
  const user = await requireUser(); // chat requires an account, same as joining (SPEC.md Section 1)
  const supabase = await createClient();

  let group;
  try {
    group = await getGroupById(supabase, groupId);
  } catch {
    notFound();
  }
  if (group.community_id !== id) notFound();

  // Announcement groups: readable by any community member, decoupled from
  // having separately joined this specific sub-group (0020) -- every other
  // group still requires an explicit join.
  const canRead = await canReadGroup(supabase, group, user.id);
  if (!canRead) redirect(`/communities/${id}`);

  const canPost = await canPostToGroup(supabase, group, user.id);
  const messages = await getGroupMessages(supabase, groupId);

  // Fire-and-forget-adjacent: awaited so it's committed before the badge
  // could plausibly be re-fetched by a nav elsewhere, but never awaited by
  // the caller of a return value -- this page doesn't hold up rendering
  // waiting on it. A failed mark-read just means the badge doesn't clear
  // this one visit, not a broken chat.
  markGroupRead(groupId).catch((e) => console.error("Failed to mark group read:", e));

  return (
    <div className="flex-1 px-4 pb-10 pt-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href={`/communities/${id}`}
          className="mb-4 inline-block text-[13px] text-text3 transition hover:text-text2"
        >
          ← Back to community
        </Link>
        <h1 className="mb-4 font-heading text-[18px] font-bold">#{group.name}</h1>
        <GroupChat groupId={groupId} initialMessages={messages} currentUserId={user.id} canPost={canPost} />
      </div>
    </div>
  );
}
