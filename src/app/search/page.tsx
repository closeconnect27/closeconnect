import { IconSearch, IconMoodEmpty } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { getCommunities } from "@/lib/queries/communities";
import { getEvents } from "@/lib/queries/events";
import { CommunityCard } from "@/components/communities/CommunityCard";
import { EventCard } from "@/components/events/EventCard";
import { SearchForm } from "@/components/communities/SearchForm";
import { EmptyState } from "@/components/ui/EmptyState";

// Unified across communities + events per SPEC.md Section 9's page spec --
// this used to be communities-only with a "coming once events ship" note
// from before Phase 7 existed; left unfixed it would've been the one page
// in the app that still looked like events didn't exist.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const [communities, events] = q
    ? await Promise.all([
        getCommunities(supabase, { search: q }),
        getEvents(supabase, { search: q, includePast: false }),
      ])
    : [[], []];

  const hasResults = communities.length > 0 || events.length > 0;

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <h1 className="font-heading text-[32px] font-extrabold leading-tight">search</h1>
      <p className="mb-6 text-[14px] text-text3">find communities and events by name</p>

      <SearchForm />

      <div className="mt-8 flex flex-col gap-8">
        {!q && (
          <EmptyState
            icon={IconSearch}
            title="Search for a community or event"
            description="Type a name above to get started."
          />
        )}
        {q && !hasResults && (
          <EmptyState
            icon={IconMoodEmpty}
            title={`Nothing matches "${q}"`}
            description="Try a different name, or browse by category instead."
            action={{ label: "Browse communities", href: "/communities" }}
          />
        )}
        {events.length > 0 && (
          <section>
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-text3">
              Events · {events.length}
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {events.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          </section>
        )}
        {communities.length > 0 && (
          <section>
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-text3">
              Communities · {communities.length}
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {communities.map((c) => (
                <CommunityCard key={c.id} community={c} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
