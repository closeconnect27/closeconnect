import { IconUsers, IconStar } from "@tabler/icons-react";
import { getCategoryVisual } from "@/lib/categories";
import { communitySeed } from "@/lib/categoryImages";
import type { Community } from "@/lib/queries/communities";
import { JoinBadge } from "@/components/communities/JoinBadge";
import { ClickableCard } from "@/components/ui/ClickableCard";
import { CategoryImage } from "@/components/ui/CategoryImage";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";

const NEW_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;

// District-scale card, matching EventCard's rebuild: the photo fills most of
// the card and carries the title directly on the image (large white type
// over a dark gradient), not a small thumbnail with text below it. "new" is
// derived from real created_at, not from an absent rating -- an old,
// unrated community isn't "new".
export function CommunityCard({ community: c }: { community: Community }) {
  const visual = getCategoryVisual(c.category);
  // This is a Server Component (no "use client"): it renders once per
  // request, not repeatedly on the client, so there's no re-render
  // inconsistency for Date.now() to introduce here the way there would be
  // in a client component's render body.
  // eslint-disable-next-line react-hooks/purity
  const isNew = Date.now() - new Date(c.created_at).getTime() < NEW_THRESHOLD_MS;

  return (
    <ClickableCard
      href={`/communities/${c.id}`}
      className="card-elevated block h-full w-full cursor-pointer overflow-hidden rounded-card bg-bg2"
    >
      <div className="relative h-72" style={{ background: visual.bg }}>
        {c.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
          <img src={c.cover_image_url} alt="" className="h-full w-full object-cover" />
        ) : c.logo_url ? (
          // No real cover yet -- a small square logo stretched full-bleed
          // with object-cover would crop/distort it, so it's shown
          // contained and centered instead, like a badge on the category
          // color, rather than the generic Unsplash placeholder.
          <div className="flex h-full w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns */}
            <img
              src={c.logo_url}
              alt=""
              className="h-28 w-28 rounded-full border-4 border-white/20 bg-bg2 object-contain shadow-lg"
            />
          </div>
        ) : (
          <CategoryImage
            slug={c.category}
            seed={communitySeed(c.id)}
            alt=""
            fill
            sizes="(max-width: 640px) 80vw, 320px"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/20" />

        <div className="absolute right-3 top-3 flex gap-1.5">
          {isNew && (
            <span className="rounded-full bg-green px-2.5 py-1 font-mono text-[11px] font-semibold text-green-dark">
              New
            </span>
          )}
          {c.kind === "external" && (
            <span className="rounded-full border border-white/10 bg-black/70 px-2.5 py-1 font-mono text-[11px] font-medium text-text2">
              External
            </span>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-4">
          <span
            className="w-fit rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold"
            style={{ background: visual.bg, color: visual.light }}
          >
            {visual.label}
          </span>
          <h3 className="flex items-center gap-1.5 line-clamp-2 font-heading text-[18px] font-bold leading-tight text-white">
            {c.name}
            {c.is_verified && <VerifiedBadge />}
          </h3>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 p-4">
        <p className="line-clamp-1 text-[13px] leading-snug text-text3">{c.description}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <TypeBadge type={c.community_type} />
          {c.city && <span className="text-[13px] font-medium text-text3">{c.city}</span>}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          {c.kind === "native" ? (
            <span className="flex items-center gap-3 text-[13px] font-medium text-text2">
              <span className="flex items-center gap-1">
                <IconStar size={13} className={c.avg_rating > 0 ? "fill-green text-green" : "text-text3"} />
                {c.avg_rating > 0 ? c.avg_rating.toFixed(1) : "No ratings yet"}
              </span>
              <span className="flex items-center gap-1">
                <IconUsers size={13} />
                {formatCount(c.member_count)}
              </span>
            </span>
          ) : (
            <span />
          )}
          {c.kind === "external" && c.external_link && <JoinBadge link={c.external_link} />}
        </div>
      </div>
    </ClickableCard>
  );
}

const TYPE_LABELS = { online: "Online", offline: "Offline", both: "Both" } as const;
const TYPE_DOT_COLORS = { online: "#25D366", offline: "#7c3aed", both: "#9ca3af" } as const;

function TypeBadge({ type }: { type: Community["community_type"] }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] font-medium text-text2">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: TYPE_DOT_COLORS[type] }} />
      {TYPE_LABELS[type]}
    </span>
  );
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k members`;
  return `${n} member${n === 1 ? "" : "s"}`;
}
