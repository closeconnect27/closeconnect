import { IconSearch, IconMoodEmpty } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { getCommunities } from "@/lib/queries/communities";
import { getEvents } from "@/lib/queries/events";
import { CommunityCard } from "@/components/communities/CommunityCard";
import { EventCard } from "@/components/events/EventCard";
import { SearchForm } from "@/components/communities/SearchForm";
import { SearchFilterBar } from "@/components/communities/SearchFilterBar";
import { EmptyState } from "@/components/ui/EmptyState";

// Unified across communities + events per SPEC.md Section 9's page spec --
// this used to be communities-only with a "coming once events ship" note
// from before Phase 7 existed; left unfixed it would've been the one page
// in the app that still looked like events didn't exist.
//
// One merged grid, not two stacked side by side -- rendering communities
// and events as separate grid blocks was the "double grid" bug (two full
// grids back to back read as a layout mistake, not two labeled sections).
// A `kind` tag on each result is enough to pick the right card component
// while keeping a single grid container; the type filter below lets
// someone narrow to just one kind when they want that instead.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; category?: string; city?: string }>;
}) {
  const { q, type, category, city } = await searchParams;
  const supabase = await createClient();

  const hasFilters = !!(q || category || city || type);
  const wantCommunities = type !== "events";
  const wantEvents = type !== "communities";

  const [communities, events] = hasFilters
    ? await Promise.all([
        wantCommunities ? getCommunities(supabase, { search: q, category, city }) : Promise.resolve([]),
        wantEvents ? getEvents(supabase, { search: q, category, city, includePast: false }) : Promise.resolve([]),
      ])
    : [[], []];

  const results = [
    ...communities.map((c) => ({ kind: "community" as const, data: c })),
    ...events.map((e) => ({ kind: "event" as const, data: e })),
  ];

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <h1 className="font-heading text-[28px] font-black leading-tight sm:text-[40px] lg:text-[56px]">Search</h1>
      <p className="mb-6 text-[14px] text-text3">Find communities and events by name, category, or city</p>

      <SearchForm />
      <SearchFilterBar />

      <div className="mt-8">
        {!hasFilters && (
          <EmptyState
            icon={IconSearch}
            title="Search for a community or event"
            description="Type a name above, or filter by type, category, or city to get started."
          />
        )}
        {hasFilters && results.length === 0 && (
          <EmptyState
            icon={IconMoodEmpty}
            title={q ? `Nothing matches "${q}"` : "Nothing matches these filters"}
            description="Try a different name or filter combination, or browse by category instead."
            action={{ label: "Browse communities", href: "/communities" }}
          />
        )}
        {results.length > 0 && (
          <>
            <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">
              {results.length} result{results.length === 1 ? "" : "s"}
            </h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {results.map((r) =>
                r.kind === "community" ? (
                  <CommunityCard key={`c-${r.data.id}`} community={r.data} />
                ) : (
                  <EventCard key={`e-${r.data.id}`} event={r.data} />
                ),
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
