import Link from "next/link";
import { IconCalendarEvent, IconUsers } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";

// Shared landing spot for the global "Create" action (header + BottomNav) --
// now that there are two things worth creating (events, native communities),
// pointing that one always-visible action at just one of them would silently
// make the other harder to discover again, the exact pattern this phase's
// nav fixes were about avoiding.
export default async function CreatePage() {
  await requireUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
      <h1 className="font-heading text-[22px] font-extrabold">What do you want to create?</h1>
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
            <p className="text-[15px] font-bold text-text">Start a community</p>
            <p className="text-[13px] text-text2">One umbrella, sub-groups, open or request-to-join.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
