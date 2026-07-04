import { IconUsers, IconStar } from "@tabler/icons-react";
import { getCategoryVisual } from "@/lib/categories";
import type { Community } from "@/lib/queries/communities";
import { JoinBadge } from "@/components/communities/JoinBadge";
import { ClickableCard } from "@/components/ui/ClickableCard";

export function CommunityCard({ community: c }: { community: Community }) {
  const visual = getCategoryVisual(c.category);
  const extraCats = (c.extra_categories ?? []).map(getCategoryVisual);

  return (
    <ClickableCard
      href={`/communities/${c.id}`}
      className="block w-[175px] shrink-0 cursor-pointer overflow-hidden rounded-card border border-border bg-bg2 transition hover:-translate-y-0.5 hover:border-border2"
    >
      <div
        className="relative flex h-[70px] items-center justify-center text-3xl"
        style={{ background: visual.bg }}
      >
        {visual.emoji}
        {c.kind === "native" ? (
          <span className="absolute bottom-1.5 right-2 flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-green">
            <IconUsers size={9} />
            {formatCount(c.member_count)}
          </span>
        ) : (
          <span className="absolute bottom-1.5 right-2 rounded-full border border-white/10 bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-text2">
            external
          </span>
        )}
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <div className="mb-1.5 flex flex-wrap gap-1">
          <span
            className="inline-block rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide"
            style={{ background: visual.bg, color: visual.light }}
          >
            {visual.label}
          </span>
          {extraCats.map((ec) => (
            <span
              key={ec.slug}
              className="inline-block rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide opacity-75"
              style={{ background: ec.bg, color: ec.light }}
            >
              {ec.label}
            </span>
          ))}
        </div>
        <div className="mb-1.5 line-clamp-2 text-[13px] leading-tight text-[#e0e0e0]">{c.name}</div>
        <div className="flex items-center justify-between">
          {c.kind === "native" ? (
            <span className="flex items-center gap-1 text-[10px] text-text3">
              <IconStar size={10} className="fill-current" />
              {c.avg_rating > 0 ? c.avg_rating.toFixed(1) : "new"}
            </span>
          ) : (
            <span className="text-[10px] text-text3">{c.city ?? ""}</span>
          )}
          {c.kind === "external" && c.external_link && (
            <JoinBadge link={c.external_link} />
          )}
        </div>
      </div>
    </ClickableCard>
  );
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
