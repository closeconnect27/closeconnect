import Link from "next/link";
import { IconCalendarEvent, IconUsers, IconBadge } from "@tabler/icons-react";

// Shared landing spot for the global "Create" action (header + BottomNav) --
// now that there are three things worth doing here (events, native
// communities, and listing an external one), pointing that one
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
export default function CreatePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
      <h1 className="font-heading text-[18px] font-bold">What do you want to do?</h1>
      <div className="flex w-full max-w-sm flex-col gap-3">
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
            <p className="text-[13px] text-text2">Build a new community here -- chat, sub-groups, open or request-to-join.</p>
          </div>
        </Link>
        <Link href="/communities/submit" className="card-elevated flex items-center gap-4 rounded-card bg-bg2 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-tint">
            <IconBadge size={20} className="text-green" />
          </div>
          <div className="text-left">
            <p className="text-[15px] font-bold text-text">List a community</p>
            <p className="text-[13px] text-text2">Point to a WhatsApp or Instagram group you already run -- no account needed.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
