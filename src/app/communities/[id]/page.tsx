import { notFound } from "next/navigation";
import Link from "next/link";
import { IconStar, IconUsers, IconMapPin } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { getCommunityById } from "@/lib/queries/communities";
import { getCategoryVisual } from "@/lib/categories";
import { communitySeed } from "@/lib/categoryImages";
import { CommunityDetailActions } from "@/components/communities/CommunityDetailActions";
import { CategoryImage } from "@/components/ui/CategoryImage";

export default async function CommunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  let community;
  try {
    community = await getCommunityById(supabase, id);
  } catch {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const visual = getCategoryVisual(community.category);
  const extraCats = (community.extra_categories ?? []).map(getCategoryVisual);

  return (
    <div className="flex-1 pb-10">
      <div className="relative h-40 w-full sm:h-52" style={{ background: visual.bg }}>
        <CategoryImage
          slug={community.category}
          seed={communitySeed(community.id)}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/40" />
      </div>

      <div className="px-4 pt-5 sm:px-5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{ background: visual.bg, color: visual.light }}
          >
            {visual.label}
          </span>
          {extraCats.map((ec) => (
            <span
              key={ec.slug}
              className="rounded-full px-2.5 py-1 text-[10px] font-bold opacity-80"
              style={{ background: ec.bg, color: ec.light }}
            >
              {ec.label}
            </span>
          ))}
          <span className="rounded-full border border-border2 px-2.5 py-1 text-[10px] font-bold text-text2">
            {community.kind === "native" ? "native community" : "external"}
          </span>
        </div>

        <h1 className="font-heading text-[22px] font-extrabold">{community.name}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px] font-medium text-text2">
          {community.city && (
            <span className="flex items-center gap-1">
              <IconMapPin size={14} className="text-text3" />
              {community.city}
            </span>
          )}
          {community.kind === "native" && (
            <>
              <span className="flex items-center gap-1">
                <IconUsers size={14} className="text-text3" />
                {community.member_count} members
              </span>
              <span className="flex items-center gap-1">
                <IconStar size={14} className="text-text3" />
                {community.avg_rating > 0
                  ? `${community.avg_rating.toFixed(1)} (${community.rating_count})`
                  : "no ratings yet"}
              </span>
            </>
          )}
        </div>

        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-text2">
          {community.description}
        </p>

        {community.kind === "native" && (
          <p className="mt-6 rounded-card border border-border bg-bg2 px-4 py-3 text-xs text-text3">
            Joining, sub-groups, and chat for native communities are coming in Phase 5. For now this
            page just shows what&apos;s public.
          </p>
        )}

        <CommunityDetailActions
          communityId={community.id}
          kind={community.kind}
          externalLink={community.external_link}
          isLoggedIn={!!user}
        />

        <Link href="/communities" className="mt-8 block text-center text-xs text-text3">
          ← back to communities
        </Link>
      </div>
    </div>
  );
}
