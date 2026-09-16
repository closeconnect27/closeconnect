import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileDmThreads } from "@/lib/queries/profileDm";
import { getDmReadTimestamps } from "@/lib/queries/dmReads";
import { MessagesInbox } from "@/components/messages/MessagesInbox";

export const metadata = { title: "Messages" };

// Individual profile-to-profile messaging's inbox -- the web counterpart to
// mobile's own Inbox tab (which replaced its bottom-nav Create tab this
// same session, see BottomNav.tsx here). `?redirect=` on the gate so
// signing in from here lands back on /messages, not the homepage (same
// bug/fix as Header's Sign in button, commit fc2dccd).
export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/messages");

  const threads = await getProfileDmThreads(supabase, user.id);
  const readTimestamps = await getDmReadTimestamps(
    supabase,
    user.id,
    "profile",
    threads.map((t) => t.id),
  );

  return (
    <div className="mx-auto max-w-xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-heading text-[22px] font-bold text-text">Messages</h1>
      <MessagesInbox threads={threads} currentUserId={user.id} readTimestamps={readTimestamps} />
    </div>
  );
}
