import Link from "next/link";
import { IconCalendarOff } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/categories";
import { getEvents, type EventFilters } from "@/lib/queries/events";
import { EventCard } from "@/components/events/EventCard";
import { EventFilterBar } from "@/components/events/EventFilterBar";
import { CategoryImage } from "@/components/ui/CategoryImage";
import { EmptyState } from "@/components/ui/EmptyState";

type SearchParams = Promise<{
  category?: string;
  city?: string;
  community?: string;
  host?: string;
  from?: string;
  to?: string;
}>;

export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const { category, city, community, host, from, to } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hasFilters = !!(category || city || community || host || from);

  return (
    <div className="flex-1 pb-16">
      <div className="flex items-start justify-between gap-4 px-4 pb-6 pt-8 sm:px-6">
        <div>
          <h1 className="font-heading text-[32px] font-extrabold leading-tight">events</h1>
          <p className="text-[14px] text-text3">what&apos;s happening in Bengaluru</p>
        </div>
        <Link
          href={user ? "/events/new" : "/login?redirect=/events/new"}
          className="btn-primary shrink-0 px-4 py-2.5 text-[13px]"
        >
          <span className="hidden sm:inline">Host an event</span>
          <span className="sm:hidden">Host</span>
        </Link>
      </div>

      <EventFilterBar />

      <div className="mt-8">
        {hasFilters ? (
          <FilteredGrid
            supabase={supabase}
            filters={{ category, city, communityId: community, hostId: host, dateFrom: from, dateTo: to }}
          />
        ) : (
          <CategoryRows supabase={supabase} />
        )}
      </div>
    </div>
  );
}

async function FilteredGrid({
  supabase,
  filters,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  filters: EventFilters;
}) {
  const events = await getEvents(supabase, filters);

  if (!events.length) {
    return (
      <div className="px-4 sm:px-6">
        <EmptyState
          icon={IconCalendarOff}
          title="No events match these filters"
          description="Try a different category, city, or date range, or clear your filters to browse everything."
          action={{ label: "Clear filters", href: "/events" }}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-3 sm:px-6 md:grid-cols-4 lg:grid-cols-6">
      {events.map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
    </div>
  );
}

async function CategoryRows({ supabase }: { supabase: Awaited<ReturnType<typeof createClient>> }) {
  const all = await getEvents(supabase, {});

  if (!all.length) {
    return (
      <div className="px-4 sm:px-6">
        <EmptyState
          icon={IconCalendarOff}
          title="No upcoming events yet"
          description="Be the first to host one."
          action={{ label: "Host an event", href: "/events/new" }}
        />
      </div>
    );
  }

  const rows = CATEGORIES.map((cat) => ({
    cat,
    events: all.filter((e) => e.category === cat.slug).slice(0, 8),
  })).filter((r) => r.events.length > 0);

  const uncategorized = all.filter((e) => !CATEGORIES.some((c) => c.slug === e.category)).slice(0, 8);

  return (
    <div className="flex flex-col gap-8">
      {rows.map(({ cat, events }) => (
        <EventRow key={cat.slug} title={cat.label} categorySlug={cat.slug} events={events} />
      ))}
      {uncategorized.length > 0 && <EventRow title="more events" events={uncategorized} />}
    </div>
  );
}

function EventRow({
  title,
  categorySlug,
  events,
}: {
  title: string;
  categorySlug?: string;
  events: Awaited<ReturnType<typeof getEvents>>;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between px-4 sm:px-6">
        <span className="font-heading flex items-center gap-2 text-[16px] font-bold">
          {categorySlug && (
            <CategoryImage slug={categorySlug} seed={0} alt="" size={24} className="rounded-full object-cover" />
          )}
          {title}
          <span className="font-sans text-[12px] font-normal text-text3">
            · {events.length} event{events.length === 1 ? "" : "s"}
          </span>
        </span>
        <Link
          href={`/events${categorySlug ? `?category=${categorySlug}` : ""}`}
          className="text-[13px] font-bold text-green"
        >
          see all
        </Link>
      </div>
      <div className="scrollbar-none flex gap-4 overflow-x-auto px-4 pb-2 sm:px-6">
        {events.map((e) => (
          <div key={e.id} className="w-56 shrink-0">
            <EventCard event={e} />
          </div>
        ))}
      </div>
    </section>
  );
}
