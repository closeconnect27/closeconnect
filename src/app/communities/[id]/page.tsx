import { notFound } from "next/navigation";
import Link from "next/link";
import { IconStar, IconUsers, IconMapPin } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { getCommunityById } from "@/lib/queries/communities";
import { getCategoryVisual } from "@/lib/categories";
import { CommunityDetailActions } from "@/components/communities/CommunityDetailActions";

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
      <div className="h-40 w-full text-6xl" style={{ background: visual.bg }}>
        <div className="flex h-full items-center justify-center">{visual.emoji}</div>
      </div>

      <div className="px-5 pt-5">
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

        <h1 className="font-heading text-2xl font-extrabold">{community.name}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-text2">
          {community.city && (
            <span className="flex items-center gap-1">
              <IconMapPin size={14} />
              {community.city}
            </span>
          )}
          {community.kind === "native" && (
            <>
              <span className="flex items-center gap-1">
                <IconUsers size={14} />
                {community.member_count} members
              </span>
              <span className="flex items-center gap-1">
                <IconStar size={14} />
                {community.avg_rating > 0
                  ? `${community.avg_rating.toFixed(1)} (${community.rating_count})`
                  : "no ratings yet"}
              </span>
            </>
          )}
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-text2">
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
