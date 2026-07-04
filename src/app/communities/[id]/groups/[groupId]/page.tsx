import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isGroupMember, getGroupMessages, getGroupById } from "@/lib/queries/chat";
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

  const member = await isGroupMember(supabase, groupId, user.id);
  if (!member) redirect(`/communities/${id}`);

  const messages = await getGroupMessages(supabase, groupId);

  return (
    <div className="flex-1 px-4 pb-10 pt-6 sm:px-5">
      <div className="mx-auto max-w-2xl">
        <Link href={`/communities/${id}`} className="mb-3 block text-xs text-text3">
          ← back to community
        </Link>
        <h1 className="mb-4 font-heading text-xl font-extrabold">#{group.name}</h1>
        <GroupChat groupId={groupId} initialMessages={messages} currentUserId={user.id} />
      </div>
    </div>
  );
}
