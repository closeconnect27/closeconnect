import { IconUsers, IconStar } from "@tabler/icons-react";
import { getCategoryVisual } from "@/lib/categories";
import { communitySeed } from "@/lib/categoryImages";
import type { Community } from "@/lib/queries/communities";
import { JoinBadge } from "@/components/communities/JoinBadge";
import { ClickableCard } from "@/components/ui/ClickableCard";
import { CategoryImage } from "@/components/ui/CategoryImage";

const NEW_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;

// Photo-forward, Meetup-style: the image is the dominant element (not a
// small icon), category is a single overlaid pill on the image (not a row
// of pills competing for attention -- extra_categories still drive search
// matching, they just don't all need to render on every card), and social
// proof (rating/members, or city for external) is one muted line, not
// split across a full metadata row. "new" is derived from real created_at,
// not from an absent rating -- an old, unrated community isn't "new".
export function CommunityCard({ community: c }: { community: Community }) {
  const visual = getCategoryVisual(c.category);
  const isNew = Date.now() - new Date(c.created_at).getTime() < NEW_THRESHOLD_MS;

  return (
    <ClickableCard
      href={`/communities/${c.id}`}
      className="card-elevated block h-full w-full cursor-pointer overflow-hidden rounded-card bg-bg2"
    >
      <div className="relative h-40" style={{ background: visual.bg }}>
        <CategoryImage
          slug={c.category}
          seed={communitySeed(c.id)}
          alt=""
          fill
          sizes="(max-width: 640px) 50vw, 220px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/10" />

        <span
          className="absolute bottom-2 left-2 rounded-full px-2 py-1 text-[11px] font-bold"
          style={{ background: visual.bg, color: visual.light }}
        >
          {visual.label}
        </span>

        <div className="absolute right-2 top-2 flex gap-1">
          {isNew && (
            <span className="rounded-full bg-green px-2 py-1 text-[10px] font-bold text-green-dark">
              new
            </span>
          )}
          {c.kind === "external" && (
            <span className="rounded-full border border-white/10 bg-black/70 px-2 py-1 text-[10px] font-semibold text-text2">
              external
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-text">{c.name}</h3>
        <p className="line-clamp-1 text-[12px] leading-snug text-text3">{c.description}</p>

        <div className="mt-1 flex items-center justify-between gap-2">
          {c.kind === "native" ? (
            <span className="flex items-center gap-3 text-[12px] font-medium text-text2">
              <span className="flex items-center gap-1">
                <IconStar size={12} className={c.avg_rating > 0 ? "fill-green text-green" : "text-text3"} />
                {c.avg_rating > 0 ? c.avg_rating.toFixed(1) : "no ratings yet"}
              </span>
              <span className="flex items-center gap-1">
                <IconUsers size={12} />
                {formatCount(c.member_count)}
              </span>
            </span>
          ) : (
            <span className="text-[12px] font-medium text-text3">{c.city ?? " "}</span>
          )}
          {c.kind === "external" && c.external_link && <JoinBadge link={c.external_link} />}
        </div>
      </div>
    </ClickableCard>
  );
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k members`;
  return `${n} member${n === 1 ? "" : "s"}`;
}
