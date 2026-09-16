import Link from "next/link";
import { IconCalendarEvent, IconUsers, IconBadge, IconMessage2 } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { canUserPost } from "@/lib/queries/feed";
import { WebOnly } from "@/components/system/PlatformGate";

// Shared landing spot for the global "Create" action (Header's desktop
// button; BottomNav's own Create tab was replaced with Messages, see
// BottomNav.tsx -- every section already has its own "+"/"New X" entry
// point, so Create is still reachable, just not from the bottom tab bar) --
// now that there are things worth doing here (posting to the feed, events,
// native communities, and listing an external one), pointing that one
// always-visible action at just one of them would silently make the others
// harder to discover again, the exact pattern this phase's nav fixes were
// about avoiding.
//
// No requireUser() gate on this page itself -- "List a community" needs to
// be reachable and usable by a logged-out visitor (it's the public,
// no-login submission flow). "Host an event" and "Start a community" still
// require an account, enforced by their own destination pages
// (/events/new, /communities/new), same as every other login-gated action
// in this app.
export default async function CreatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Only shown to someone who owns/moderates at least one community --
  // posting to the feed is staff-only (community_posts_insert_staff, 0099)
  // -- mirrors mobile's Create tab canPost check exactly.
  const canPost = user ? await canUserPost(supabase, user.id) : false;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
      <h1 className="font-heading text-[18px] font-bold">What do you want to do?</h1>
      <div className="flex w-full max-w-sm flex-col gap-3">
        {canPost && (
          <Link href="/feed/new" className="card-elevated flex items-center gap-4 rounded-card bg-bg2 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pink-tint">
              <IconMessage2 size={20} className="text-pink" />
            </div>
            <div className="text-left">
              <p className="text-[15px] font-bold text-text">New post</p>
              <p className="text-[13px] text-text2">Share a moment with your circles.</p>
            </div>
          </Link>
        )}
        <Link href="/events/new" className="card-elevated flex items-center gap-4 rounded-card bg-bg2 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-tint">
            <IconCalendarEvent size={20} className="text-green" />
          </div>
          <div className="text-left">
            <p className="text-[15px] font-bold text-text">Host an event</p>
            <p className="text-[13px] text-text2">Ticketed or free, with or without a community.</p>
          </div>
        </Link>
        <Link href="/communities/new" className="card-elevated flex items-center gap-4 rounded-card bg-bg2 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-tint">
            <IconUsers size={20} className="text-green" />
          </div>
          <div className="text-left">
            <p className="text-[15px] font-bold text-text">Create a community</p>
            <p className="text-[13px] text-text2">Build a new community here -- chat, circles, open or request-to-join.</p>
          </div>
        </Link>
        {/* External (WhatsApp/Instagram-linked) listings aren't part of the
            app's own create model -- web-only, same as the equivalent
            button on /communities and the social links on CommunityCard. */}
        <WebOnly>
          <Link href="/communities/submit" className="card-elevated flex items-center gap-4 rounded-card bg-bg2 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-tint">
              <IconBadge size={20} className="text-green" />
            </div>
            <div className="text-left">
              <p className="text-[15px] font-bold text-text">List a community</p>
              <p className="text-[13px] text-text2">Point to a WhatsApp or Instagram group you already run -- no account needed.</p>
            </div>
          </Link>
        </WebOnly>
      </div>
    </div>
  );
}
