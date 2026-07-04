import { IconSearch, IconMoodEmpty } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { getCommunities } from "@/lib/queries/communities";
import { CommunityCard } from "@/components/communities/CommunityCard";
import { SearchForm } from "@/components/communities/SearchForm";
import { EmptyState } from "@/components/ui/EmptyState";

// Communities-only for now -- SPEC.md's eventual scope is unified search
// across communities + events, but events don't exist yet (Phase 7).
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const results = q ? await getCommunities(supabase, { search: q }) : [];

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <h1 className="font-heading text-[32px] font-extrabold leading-tight">search</h1>
      <p className="mb-6 text-[14px] text-text3">
        communities for now — event search is coming once events ship
      </p>

      <SearchForm />

      <div className="mt-8">
        {!q && (
          <EmptyState
            icon={IconSearch}
            title="Search for a community"
            description="Type a name above to find communities to join."
          />
        )}
        {q && results.length === 0 && (
          <EmptyState
            icon={IconMoodEmpty}
            title={`No communities match "${q}"`}
            description="Try a different name, or browse by category instead."
            action={{ label: "Browse communities", href: "/communities" }}
          />
        )}
        {results.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {results.map((c) => (
              <CommunityCard key={c.id} community={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
