import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/categories";
import { getCommunities, getCommunitiesByCategory } from "@/lib/queries/communities";
import { CommunityCard } from "@/components/communities/CommunityCard";
import { CommunityFilterBar } from "@/components/communities/CommunityFilterBar";

type SearchParams = Promise<{ category?: string; city?: string; kind?: string }>;

export default async function CommunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const { category, city, kind } = await searchParams;
  const supabase = await createClient();
  const hasFilters = !!(category || city || kind);

  return (
    <div className="flex-1 pb-10">
      <div className="px-5 pb-4 pt-6">
        <h1 className="font-heading text-2xl font-extrabold">communities</h1>
        <p className="text-sm text-text3">find your people</p>
      </div>

      <CommunityFilterBar />

      <div className="mt-6">
        {hasFilters ? (
          <FilteredGrid
            supabase={supabase}
            filters={{
              category,
              city,
              kind: kind === "native" || kind === "external" ? kind : undefined,
            }}
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
  filters: Parameters<typeof getCommunities>[1];
}) {
  const communities = await getCommunities(supabase, filters);

  if (!communities.length) {
    return <p className="px-5 text-sm text-text3">No communities match these filters yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {communities.map((c) => (
        <div key={c.id} className="w-full [&>a]:w-full">
          <CommunityCard community={c} />
        </div>
      ))}
    </div>
  );
}

async function CategoryRows({ supabase }: { supabase: Awaited<ReturnType<typeof createClient>> }) {
  const rows = await Promise.all(
    CATEGORIES.map(async (cat) => ({
      cat,
      communities: await getCommunitiesByCategory(supabase, cat.slug, { limit: 8 }),
    })),
  );

  return (
    <div className="flex flex-col gap-7">
      {rows
        .filter((r) => r.communities.length > 0)
        .map(({ cat, communities }) => (
          <section key={cat.slug}>
            <div className="mb-3.5 flex items-center justify-between px-5">
              <span className="font-heading flex items-center gap-2 text-[15px] font-bold">
                <span>{cat.emoji}</span>
                {cat.label}
                <span className="font-sans text-[11px] font-normal text-text3">
                  · {communities.length} communit{communities.length === 1 ? "y" : "ies"}
                </span>
              </span>
              <Link href={`/communities?category=${cat.slug}`} className="text-xs font-medium text-green">
                see all
              </Link>
            </div>
            <div className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1">
              {communities.map((c) => (
                <CommunityCard key={c.id} community={c} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
