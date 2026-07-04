import { createClient } from "@/lib/supabase/server";
import { getCommunities } from "@/lib/queries/communities";
import { CommunityCard } from "@/components/communities/CommunityCard";
import { SearchForm } from "@/components/communities/SearchForm";

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
    <div className="flex-1 px-4 pb-10 pt-6 sm:px-5">
      <h1 className="font-heading text-2xl font-extrabold">search</h1>
      <p className="mb-5 text-sm text-text3">
        communities for now — event search is coming once events ship
      </p>

      <SearchForm />

      <div className="mt-6">
        {!q && <p className="text-sm text-text3">Search by community name.</p>}
        {q && results.length === 0 && (
          <p className="text-sm text-text3">No communities match &quot;{q}&quot;.</p>
        )}
        {results.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {results.map((c) => (
              <CommunityCard key={c.id} community={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
