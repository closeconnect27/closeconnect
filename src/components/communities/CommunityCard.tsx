import { IconUsers, IconStar } from "@tabler/icons-react";
import { getCategoryVisual } from "@/lib/categories";
import { communitySeed } from "@/lib/categoryImages";
import type { Community } from "@/lib/queries/communities";
import { JoinBadge } from "@/components/communities/JoinBadge";
import { ClickableCard } from "@/components/ui/ClickableCard";
import { CategoryImage } from "@/components/ui/CategoryImage";

export function CommunityCard({ community: c }: { community: Community }) {
  const visual = getCategoryVisual(c.category);
  const extraCats = (c.extra_categories ?? []).map(getCategoryVisual);

  return (
    <ClickableCard
      href={`/communities/${c.id}`}
      className="block h-full w-full cursor-pointer overflow-hidden rounded-card border border-border bg-bg2 transition hover:-translate-y-0.5 hover:border-border2"
    >
      <div className="relative h-[90px]" style={{ background: visual.bg }}>
        <CategoryImage
          slug={c.category}
          seed={communitySeed(c.id)}
          alt=""
          fill
          sizes="175px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/45" />
        {c.kind === "native" ? (
          <span className="absolute bottom-1.5 right-2 flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-green">
            <IconUsers size={10} />
            {formatCount(c.member_count)}
          </span>
        ) : (
          <span className="absolute bottom-1.5 right-2 rounded-full border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-text2">
            external
          </span>
        )}
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <div className="mb-1.5 flex flex-wrap gap-1">
          <span
            className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
            style={{ background: visual.bg, color: visual.light }}
          >
            {visual.label}
          </span>
          {extraCats.map((ec) => (
            <span
              key={ec.slug}
              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide opacity-75"
              style={{ background: ec.bg, color: ec.light }}
            >
              {ec.label}
            </span>
          ))}
        </div>
        <div className="mb-1.5 line-clamp-2 text-[14px] font-bold leading-tight text-text">
          {c.name}
        </div>
        <div className="flex items-center justify-between">
          {c.kind === "native" ? (
            <span className="flex items-center gap-1 text-[10px] font-medium text-text3">
              <IconStar size={10} className="fill-current" />
              {c.avg_rating > 0 ? c.avg_rating.toFixed(1) : "new"}
            </span>
          ) : (
            <span className="text-[10px] font-medium text-text3">{c.city ?? ""}</span>
          )}
          {c.kind === "external" && c.external_link && <JoinBadge link={c.external_link} />}
        </div>
      </div>
    </ClickableCard>
  );
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
