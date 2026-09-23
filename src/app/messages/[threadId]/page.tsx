import { notFound } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { getProfileDmThreadById, getProfileDmThreadMessages, getOtherParticipant, getIsThreadMuted } from "@/lib/queries/profileDm";
import { getIsBlocked } from "@/lib/queries/profileDetails";
import { getDmReadTimestamps } from "@/lib/queries/dmReads";
import { ProfileDmThreadView } from "@/components/dm/ProfileDmThreadView";
import { DmThreadHeader } from "@/components/dm/DmThreadHeader";

export default async function ProfileDmThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  // The signed-out redirect itself already happened in messages/layout.tsx
  // (shared with the rest of the /messages tree) -- this just gets the
  // user id back without re-checking.
  const user = await requireUser();
  const supabase = await createClient();

  const thread = await getProfileDmThreadById(supabase, threadId);
  // RLS (profile_dm_threads_select_participant, 0123) already means a
  // non-participant's own select would come back null anyway -- this check
  // just turns that into a clean 404 instead of relying on it implicitly,
  // same as GroupChatPage's canRead gate.
  if (!thread || (thread.requester_id !== user.id && thread.recipient_id !== user.id)) notFound();

  const otherParticipant = getOtherParticipant(thread, user.id);
  const isRequester = thread.requester_id === user.id;

  const [messages, otherReadTimestamps, isMuted, isBlocked] = await Promise.all([
    getProfileDmThreadMessages(supabase, threadId),
    getDmReadTimestamps(supabase, otherParticipant.id, "profile", [threadId]),
    getIsThreadMuted(supabase, threadId, user.id),
    getIsBlocked(supabase, user.id, otherParticipant.id),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3 sm:px-5">
        <Link href="/messages" className="text-text3 transition hover:text-text2 sm:hidden" aria-label="Back to messages">
          <IconArrowLeft size={20} />
        </Link>
        <DmThreadHeader threadId={threadId} otherParticipant={otherParticipant} initialMuted={isMuted} initialBlocked={isBlocked} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3 sm:px-5">
        <ProfileDmThreadView
          threadId={threadId}
          currentUserId={user.id}
          otherParticipant={otherParticipant}
          initialMessages={messages}
          initialStatus={thread.status}
          isRequester={isRequester}
          initialOtherReadAt={otherReadTimestamps.get(threadId) ?? null}
        />
      </div>
    </div>
  );
}
