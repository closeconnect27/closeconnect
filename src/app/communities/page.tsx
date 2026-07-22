import Link from "next/link";
import { IconPlus, IconMoodEmpty } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { getCommunities } from "@/lib/queries/communities";
import { CommunityCard } from "@/components/communities/CommunityCard";
import { CommunityFilterBar } from "@/components/communities/CommunityFilterBar";
import { CategorySidebarMobile, CategorySidebarDesktop } from "@/components/ui/CategorySidebar";
import { HeaderSearchSlot } from "@/components/ui/HeaderSearchSlot";
import { EmptyState } from "@/components/ui/EmptyState";

type SearchParams = Promise<{
  category?: string;
  city?: string;
  kind?: string;
  q?: string;
}>;

// One always-shown grid, filtered via the sidebar (category) + top filter
// bar (city/kind) + inline search -- replacing the old default view of
// horizontal per-category rows (CategoryRows/CommunityRow, removed).
// Nothing about *what* can be filtered changed, only that it's now one
// grid instead of a conditional row-view/grid-view split.
export default async function CommunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const { category, city, kind, q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const communities = await getCommunities(supabase, {
    category,
    cities: city ? city.split(",").filter(Boolean) : undefined,
    kind: kind === "native" || kind === "external" ? kind : undefined,
    search: q,
  });

  const hasFilters = !!(category || city || kind || q);

  return (
    <div className="flex-1 pb-16">
      <HeaderSearchSlot basePath="/communities" placeholder="Search communities…" />

      <div className="flex flex-col gap-4 px-4 pb-6 pt-8 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-[28px] font-black leading-tight sm:text-[40px] lg:text-[56px]">
              Find Your People
              <br />
              Wherever You Are
            </h1>
            <p className="mt-2 max-w-md text-[14px] text-text3">
              Discover communities that match your vibe — join in one tap.
            </p>
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
      </div>

      <CategorySidebarMobile basePath="/communities" />

      <div className="mt-6 flex gap-6 px-4 sm:px-6 md:mt-8">
        <CategorySidebarDesktop basePath="/communities" />
        <div className="min-w-0 flex-1">
          <CommunityFilterBar />
          <div className="mt-6">
            {communities.length === 0 ? (
              <EmptyState
                icon={IconMoodEmpty}
                title={hasFilters ? "No communities match these filters" : "No communities yet"}
                description={
                  hasFilters
                    ? "Try a different category or city, or clear your filters to browse everything."
                    : "Be the first to start one -- it takes less than a minute."
                }
                action={
                  hasFilters
                    ? { label: "Clear filters", href: "/communities" }
                    : { label: "Create a community", href: "/communities/new" }
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {communities.map((c) => (
                  <CommunityCard key={c.id} community={c} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
