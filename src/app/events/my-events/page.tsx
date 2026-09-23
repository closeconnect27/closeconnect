import Link from "next/link";
import { IconCalendarOff } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getEvents, getMyRegisteredEvents } from "@/lib/queries/events";
import { EventCard } from "@/components/events/EventCard";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "My events" };

// Two halves, same as the mobile app's own my-events screen: events I
// host and events I've registered for (getMyRegisteredEvents). Upcoming
// only, both halves -- getEvents({hostId}) already defaults to
// event_date >= today when includePast isn't set, same as the public
// grid; a past event you hosted or attended is history, not something
// "My events" needs to keep surfacing.
export default async function MyEventsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [hosted, registered] = await Promise.all([
    getEvents(supabase, { hostId: user.id }),
    getMyRegisteredEvents(supabase, user.id),
  ]);
  const hostedIds = new Set(hosted.map((e) => e.id));
  const registeredOnly = registered.filter((e) => !hostedIds.has(e.id));

  return (
    <div className="mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-heading text-[22px] font-bold text-text">My events</h1>
        <Link href="/events" className="text-[13px] text-text3 transition hover:text-text2">
          ← Back to events
        </Link>
      </div>

      {hosted.length === 0 && registeredOnly.length === 0 ? (
        <EmptyState
          icon={IconCalendarOff}
          title="No hosted or registered events yet"
          description="Events you host or register for will show up here."
          action={{ label: "Browse events", href: "/events" }}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {hosted.length > 0 && (
            <div>
              <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Hosting</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {hosted.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </div>
          )}
          {registeredOnly.length > 0 && (
            <div>
              <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Registered</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {registeredOnly.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
