import Link from "next/link";
import { IconUsers, IconStar } from "@tabler/icons-react";
import { getCategoryVisual } from "@/lib/categories";
import { communitySeed } from "@/lib/categoryImages";
import { CategoryImage } from "@/components/ui/CategoryImage";
import type { Community } from "@/lib/queries/communities";

// Compact utility row, not a photo-forward browse card -- a management
// console is scanned for status (pending count, role), not browsed for
// discovery, so information density wins over the bigger imagery used on
// /communities. Matches the WhatsApp-admin-list / Meetup-organizer-console
// register from the design-pass research rather than the storefront one.
// Shared between the Host Dashboard (owned/moderated, with pending counts)
// and the Profile page (owned + joined-as-member, no pending concept).
export function HostCommunityRow({
  community: c,
  pendingCount = 0,
}: {
  community: Community & { role: string };
  pendingCount?: number;
}) {
  const visual = getCategoryVisual(c.category);

  return (
    <Link
      href={`/communities/${c.id}`}
      className="card-elevated flex items-center gap-3 rounded-card bg-bg2 p-3 sm:p-4"
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-card-sm" style={{ background: visual.bg }}>
        <CategoryImage
          slug={c.category}
          seed={communitySeed(c.id)}
          unsplashImageUrl={c.unsplash_image_url}
          alt=""
          fill
          sizes="56px"
          className="object-cover"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[14px] font-bold text-text">{c.name}</p>
          {c.role !== "member" && (
            <span className="shrink-0 rounded-full border border-border2 px-2 py-0.5 text-[10px] font-bold capitalize text-text3">
              {c.role}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-text3">
          {c.kind === "native" ? (
            <>
              <span className="flex items-center gap-1">
                <IconUsers size={12} />
                {c.member_count}
              </span>
              <span className="flex items-center gap-1">
                <IconStar size={12} className={c.avg_rating > 0 ? "fill-green text-green" : ""} />
                {c.avg_rating > 0 ? c.avg_rating.toFixed(1) : "No ratings"}
              </span>
              <span>{c.join_mode === "request" ? "Request to join" : "Open"}</span>
            </>
          ) : (
            <span>External</span>
          )}
        </div>
      </div>

      {pendingCount > 0 && (
        <span className="shrink-0 rounded-full bg-pink px-2.5 py-1 text-[11px] font-bold text-white">
          {pendingCount} pending
        </span>
      )}
    </Link>
  );
}
