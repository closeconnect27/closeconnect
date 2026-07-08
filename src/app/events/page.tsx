import Link from "next/link";
import { IconCalendarOff } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { getEvents } from "@/lib/queries/events";
import { EventCard } from "@/components/events/EventCard";
import { EventFilterBar } from "@/components/events/EventFilterBar";
import { CategorySidebarMobile, CategorySidebarDesktop } from "@/components/ui/CategorySidebar";
import { HeaderSearchSlot } from "@/components/ui/HeaderSearchSlot";
import { EmptyState } from "@/components/ui/EmptyState";

type SearchParams = Promise<{
  category?: string;
  city?: string;
  community?: string;
  host?: string;
  from?: string;
  to?: string;
  q?: string;
}>;

// Same restructuring as /communities: one always-shown grid, filtered via
// the sidebar (category) + top filter bar (city/date range) + inline
// search, replacing the old default view of horizontal per-category rows
// (CategoryRows/EventRow, removed). community/host params still work
// exactly as before (deep links from a community page or "my events"),
// just no longer gate whether rows-vs-grid renders -- the grid is now the
// only view, filtered or not.
export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const { category, city, community, host, from, to, q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const events = await getEvents(supabase, {
    category,
    cities: city ? city.split(",").filter(Boolean) : undefined,
    communityId: community,
    hostId: host,
    dateFrom: from,
    dateTo: to,
    search: q,
  });

  const hasFilters = !!(category || city || community || host || from || q);

  return (
    <div className="flex-1 pb-16">
      <HeaderSearchSlot basePath="/events" placeholder="Search events…" />

      <div className="flex flex-col gap-4 px-4 pb-6 pt-8 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-[28px] font-black leading-tight sm:text-[40px] lg:text-[56px]">
              What&apos;s Happening
              <br />
              Around You
            </h1>
            <p className="mt-2 max-w-md text-[14px] text-text3">
              Meetups, workshops, and socials hosted by communities near you — filter by what fits your week.
            </p>
          </div>
          <Link
            href={user ? "/events/new" : "/login?redirect=/events/new"}
            className="btn-primary shrink-0 px-4 py-2.5 text-[13px]"
          >
            <span className="hidden sm:inline">Host an event</span>
            <span className="sm:hidden">Host</span>
          </Link>
        </div>
      </div>

      <CategorySidebarMobile basePath="/events" />

      <div className="mt-6 flex gap-6 px-4 sm:px-6 md:mt-8">
        <CategorySidebarDesktop basePath="/events" />
        <div className="min-w-0 flex-1">
          <EventFilterBar />
          <div className="mt-6">
            {events.length === 0 ? (
              <EmptyState
                icon={IconCalendarOff}
                title={hasFilters ? "No events match these filters" : "No upcoming events yet"}
                description={
                  hasFilters
                    ? "Try a different category, city, or date range, or clear your filters to browse everything."
                    : "Be the first to host one."
                }
                action={
                  hasFilters ? { label: "Clear filters", href: "/events" } : { label: "Host an event", href: "/events/new" }
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {events.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
