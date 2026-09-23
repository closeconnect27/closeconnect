import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileDmThreads } from "@/lib/queries/profileDm";
import { getDmReadTimestamps } from "@/lib/queries/dmReads";
import { getPublicProfileBasic } from "@/lib/queries/profileDetails";
import { MessagesShell } from "@/components/messages/MessagesShell";

// Shared chrome for the whole /messages route tree -- the conversation
// list lives HERE (not in page.tsx) specifically so it survives
// navigation between /messages and /messages/[threadId]: a layout stays
// mounted and isn't re-fetched when only its child route changes, which
// is what makes switching threads feel instant instead of reloading the
// list every time. Auth is gated once here too, so /messages/[threadId]
// no longer needs its own duplicate check.
export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/messages");

  const [threads, myProfile] = await Promise.all([getProfileDmThreads(supabase, user.id), getPublicProfileBasic(supabase, user.id)]);
  const readTimestamps = await getDmReadTimestamps(
    supabase,
    user.id,
    "profile",
    threads.map((t) => t.id),
  );

  return (
    <MessagesShell threads={threads} currentUserId={user.id} readTimestamps={readTimestamps} myName={myProfile?.display_name ?? null}>
      {children}
    </MessagesShell>
  );
}
