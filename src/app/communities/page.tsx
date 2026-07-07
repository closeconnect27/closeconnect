import Link from "next/link";
import { IconPlus, IconMoodEmpty } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/categories";
import { getCommunities, getCommunitiesByCategory } from "@/lib/queries/communities";
import { CommunityCard } from "@/components/communities/CommunityCard";
import { CommunityFilterBar } from "@/components/communities/CommunityFilterBar";
import { CategoryImage } from "@/components/ui/CategoryImage";
import { EmptyState } from "@/components/ui/EmptyState";

type SearchParams = Promise<{ category?: string; city?: string; kind?: string }>;

export default async function CommunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const { category, city, kind } = await searchParams;
  const supabase = await createClient();
  const hasFilters = !!(category || city || kind);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex-1 pb-16">
      <div className="flex items-start justify-between gap-4 px-4 pb-6 pt-8 sm:px-6">
        <div>
          <h1 className="font-heading text-[28px] font-black leading-tight sm:text-[40px] lg:text-[56px]">Communities</h1>
          <p className="text-[14px] text-text3">Find your people</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/communities/submit" className="btn-secondary px-4 py-2.5 text-[13px]">
            <span className="hidden sm:inline">List a community</span>
            <span className="sm:hidden">List</span>
          </Link>
          <Link
            href={user ? "/communities/new" : "/login?redirect=/communities/new"}
            className="btn-primary px-4 py-2.5 text-[13px]"
          >
            <IconPlus size={14} />
            <span className="hidden sm:inline">Create community</span>
            <span className="sm:hidden">Create</span>
          </Link>
        </div>
      </div>

      <CommunityFilterBar />

      <div className="mt-8">
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
    return (
      <div className="px-4 sm:px-6">
        <EmptyState
          icon={IconMoodEmpty}
          title="No communities match these filters"
          description="Try a different category or city, or clear your filters to browse everything."
          action={{ label: "Clear filters", href: "/communities" }}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-2 sm:px-6 md:grid-cols-3 lg:grid-cols-4">
      {communities.map((c) => (
        <CommunityCard key={c.id} community={c} />
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

  const visibleRows = rows.filter((r) => r.communities.length > 0);

  if (visibleRows.length === 0) {
    return (
      <div className="px-4 sm:px-6">
        <EmptyState
          icon={IconMoodEmpty}
          title="No communities yet"
          description="Be the first to start one -- it takes less than a minute."
          action={{ label: "Create a community", href: "/communities/new" }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {visibleRows.map(({ cat, communities }) => (
        <section key={cat.slug}>
          <div className="mb-4 flex items-center justify-between px-4 sm:px-6">
            <span className="font-mono flex items-center gap-2 text-[14px] font-semibold">
              <CategoryImage
                slug={cat.slug}
                seed={0}
                alt=""
                size={24}
                className="rounded-full object-cover"
              />
              {cat.label}
              <span className="font-mono text-[12px] font-medium text-text3">
                · {communities.length} communit{communities.length === 1 ? "y" : "ies"}
              </span>
            </span>
            <Link href={`/communities?category=${cat.slug}`} className="text-[13px] font-bold text-green">
              See all
            </Link>
          </div>
          <div className="scrollbar-none flex gap-4 overflow-x-auto px-4 pb-2 sm:px-6">
            {communities.map((c) => (
              <div key={c.id} className="w-72 shrink-0">
                <CommunityCard community={c} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
