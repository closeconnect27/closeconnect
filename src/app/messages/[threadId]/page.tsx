import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfileDmThreadById, getProfileDmThreadMessages, getOtherParticipant } from "@/lib/queries/profileDm";
import { getDmReadTimestamps } from "@/lib/queries/dmReads";
import { ProfileDmThreadView } from "@/components/dm/ProfileDmThreadView";

export default async function ProfileDmThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/messages/${threadId}`)}`);

  const thread = await getProfileDmThreadById(supabase, threadId);
  // RLS (profile_dm_threads_select_participant, 0123) already means a
  // non-participant's own select would come back null anyway -- this check
  // just turns that into a clean 404 instead of relying on it implicitly,
  // same as GroupChatPage's canRead gate.
  if (!thread || (thread.requester_id !== user.id && thread.recipient_id !== user.id)) notFound();

  const otherParticipant = getOtherParticipant(thread, user.id);
  const isRequester = thread.requester_id === user.id;

  const [messages, otherReadTimestamps] = await Promise.all([
    getProfileDmThreadMessages(supabase, threadId),
    getDmReadTimestamps(supabase, otherParticipant.id, "profile", [threadId]),
  ]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-4 pt-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col">
        <div className="shrink-0 pb-3">
          <Link href="/messages" className="mb-2 inline-block text-[13px] text-text3 transition hover:text-text2">
            ← Back to messages
          </Link>
          <div className="flex items-center gap-2.5">
            {otherParticipant.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
              <img src={otherParticipant.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-tint text-[14px] font-bold text-green">
                {otherParticipant.display_name.charAt(0).toUpperCase()}
              </div>
            )}
            <Link href={`/profile/${otherParticipant.id}`} className="font-heading text-[16px] font-bold transition hover:text-green">
              {otherParticipant.display_name}
            </Link>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col pb-4">
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
    </div>
  );
}
