"use client";

import { useState } from "react";
import Link from "next/link";
import { IconX, IconMapPin, IconUsers, IconCalendarEvent } from "@tabler/icons-react";
import { getCategoryVisual } from "@/lib/categories";
import { communitySlugOrId } from "@/lib/queries/communities";
import type { FollowListEntry } from "@/lib/queries/profileDetails";
import type { PublicJoinedCommunity, PublicAttendedEvent } from "@/lib/queries/profileDetails";
import { EmptyState } from "@/components/ui/EmptyState";

const PREVIEW_COUNT = 5;

type ModalKind = "followers" | "following" | "communities" | "hosted" | "attended" | null;

// Followers/Following as a single Instagram-style two-column stat row (tap
// either to see the full list in a modal), plus Communities/Events sections
// that show only the latest 5 inline with the same "tap to see the rest"
// modal pattern once there are more than that. One client component so all
// four lists can share one modal instance instead of importing a generic
// dialog primitive that doesn't exist elsewhere in this app yet.
export function ProfileStatsAndLists({
  followers,
  following,
  communities,
  eventsHosted,
  eventsAttended,
}: {
  followers: FollowListEntry[];
  following: FollowListEntry[];
  communities: PublicJoinedCommunity[];
  eventsHosted: PublicAttendedEvent[];
  eventsAttended: PublicAttendedEvent[];
}) {
  const [open, setOpen] = useState<ModalKind>(null);

  return (
    <>
      <div className="mt-5 grid grid-cols-2 divide-x divide-border rounded-card border border-border bg-bg2">
        <StatCell label="Followers" count={followers.length} onClick={() => setOpen("followers")} />
        <StatCell label="Following" count={following.length} onClick={() => setOpen("following")} />
      </div>

      <ListSection
        title="Communities"
        count={communities.length}
        onSeeAll={() => setOpen("communities")}
        empty="Not part of any communities yet"
        emptyIcon={IconUsers}
      >
        {communities.slice(0, PREVIEW_COUNT).map((c) => (
          <CommunityRow key={c.id} community={c} />
        ))}
      </ListSection>

      <ListSection
        title="Events hosted"
        count={eventsHosted.length}
        onSeeAll={() => setOpen("hosted")}
        empty="Hasn't hosted any events yet"
        emptyIcon={IconCalendarEvent}
      >
        {eventsHosted.slice(0, PREVIEW_COUNT).map((e) => (
          <EventRow key={e.id} event={e} />
        ))}
      </ListSection>

      <ListSection
        title="Events attended"
        count={eventsAttended.length}
        onSeeAll={() => setOpen("attended")}
        empty="No past events yet"
        emptyIcon={IconCalendarEvent}
      >
        {eventsAttended.slice(0, PREVIEW_COUNT).map((e) => (
          <EventRow key={e.id} event={e} />
        ))}
      </ListSection>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setOpen(null)}
        >
          <div className="flex max-h-[70vh] w-full max-w-[420px] flex-col rounded-card bg-bg2 p-5 shadow-card-hover">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-[15px] font-bold">
                {open === "followers" && `Followers (${followers.length})`}
                {open === "following" && `Following (${following.length})`}
                {open === "communities" && `Communities (${communities.length})`}
                {open === "hosted" && `Events hosted (${eventsHosted.length})`}
                {open === "attended" && `Events attended (${eventsAttended.length})`}
              </h2>
              <button onClick={() => setOpen(null)} className="text-text2 transition hover:text-text">
                <IconX size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {open === "followers" &&
                (followers.length === 0 ? (
                  <EmptyState icon={IconUsers} title="No followers yet" compact />
                ) : (
                  followers.map((p) => <PersonRow key={p.id} person={p} />)
                ))}
              {open === "following" &&
                (following.length === 0 ? (
                  <EmptyState icon={IconUsers} title="Not following anyone yet" compact />
                ) : (
                  following.map((p) => <PersonRow key={p.id} person={p} />)
                ))}
              {open === "communities" && communities.map((c) => <CommunityRow key={c.id} community={c} />)}
              {open === "hosted" && eventsHosted.map((e) => <EventRow key={e.id} event={e} />)}
              {open === "attended" && eventsAttended.map((e) => <EventRow key={e.id} event={e} />)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatCell({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-0.5 py-3 transition hover:bg-bg3">
      <span className="font-heading text-[20px] font-bold text-text">{count}</span>
      <span className="text-[12px] text-text3">{label}</span>
    </button>
  );
}

function ListSection({
  title,
  count,
  empty,
  emptyIcon,
  onSeeAll,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  emptyIcon: typeof IconUsers;
  onSeeAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">
          {title} ({count})
        </h2>
        {count > PREVIEW_COUNT && (
          <button onClick={onSeeAll} className="text-[12px] font-semibold text-green transition hover:brightness-110">
            See all
          </button>
        )}
      </div>
      {count === 0 ? <EmptyState icon={emptyIcon} title={empty} compact /> : <div className="flex flex-col gap-2">{children}</div>}
    </section>
  );
}

function PersonRow({ person }: { person: FollowListEntry }) {
  return (
    <Link href={`/profile/${person.id}`} className="flex items-center gap-3 rounded-card-sm px-2 py-2 transition hover:bg-bg3">
      {person.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
        <img src={person.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-tint text-[13px] font-bold text-green">
          {person.display_name.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="truncate text-[13px] font-medium text-text">{person.display_name}</span>
    </Link>
  );
}

function CommunityRow({ community: c }: { community: PublicJoinedCommunity }) {
  const visual = getCategoryVisual(c.category);
  return (
    <Link
      href={`/communities/${communitySlugOrId(c)}`}
      className="flex items-center gap-3 rounded-card-sm px-2 py-2 transition hover:bg-bg3"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
        style={{ background: visual.bg, color: visual.light }}
      >
        {c.name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{c.name}</span>
      {c.role !== "member" && <span className="shrink-0 text-[11px] font-semibold uppercase text-text3">{c.role}</span>}
    </Link>
  );
}

function EventRow({ event: e }: { event: PublicAttendedEvent }) {
  return (
    <Link
      href={`/events/${e.id}`}
      className="flex items-center gap-3 rounded-card-sm px-2 py-2 transition hover:bg-bg3"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg3 text-text3">
        <IconCalendarEvent size={16} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{e.event_name}</span>
      {e.city && (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-text3">
          <IconMapPin size={11} />
          {e.city}
        </span>
      )}
    </Link>
  );
}
