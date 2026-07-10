"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconHash, IconSpeakerphone, IconChevronRight } from "@tabler/icons-react";
import { joinGroup } from "@/app/actions/membership";
import { createClient } from "@/lib/supabase/client";
import type { CommunityGroup } from "@/lib/queries/membership";

// WhatsApp-style: one continuous list, divided rows, generous padding,
// single bold/muted hierarchy per row -- not a stack of separate bordered
// cards with gaps between them.
export function GroupList({
  communityId,
  groups,
  isMember,
  joinedGroupIds,
  unreadCounts,
  currentUserId,
}: {
  communityId: string;
  groups: CommunityGroup[];
  isMember: boolean;
  joinedGroupIds: Set<string>;
  unreadCounts: Record<string, number>;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [liveCounts, setLiveCounts] = useState(unreadCounts);
  const supabase = useMemo(() => createClient(), []);

  // Server-computed counts are the source of truth on load/navigation;
  // this only needs to catch messages that arrive while the viewer is
  // sitting on this page without navigating away and back (which would
  // otherwise not refresh unreadCounts at all). One subscription per
  // joined group -- community group counts are small, so N tiny channels
  // is simpler than one filtered-by-list channel.
  useEffect(() => {
    setLiveCounts(unreadCounts);
    const joined = groups.filter((g) => joinedGroupIds.has(g.id));
    const channels = joined.map((g) =>
      supabase
        .channel(`group-list-unread-${g.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "community_messages", filter: `group_id=eq.${g.id}` },
          (payload) => {
            // A member's own sent message isn't unread for themselves --
            // get_group_unread_count excludes this server-side (user_id !=
            // auth.uid()); this live increment has to do the same check
            // manually since it never calls that function per-message.
            if ((payload.new as { user_id: string }).user_id === currentUserId) return;
            setLiveCounts((prev) => ({ ...prev, [g.id]: (prev[g.id] ?? 0) + 1 }));
          },
        )
        .subscribe(),
    );
    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- groups/joinedGroupIds are stable per server render; re-subscribing on unreadCounts identity alone would tear down and rebuild every channel on every count bump
  }, [supabase, communityId]);

  function handleJoin(groupId: string) {
    startTransition(async () => {
      await joinGroup(communityId, groupId);
      router.refresh();
    });
  }

  return (
    <div className="card-elevated overflow-hidden rounded-card bg-bg2">
      <div className="divide-y divide-border">
        {groups.map((group) => {
          const joined = joinedGroupIds.has(group.id);
          const Icon = group.is_announcement ? IconSpeakerphone : IconHash;
          const unread = liveCounts[group.id] ?? 0;
          const content = (
            <>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg3">
                <Icon size={18} className="text-text3" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-text">{group.name}</div>
                <div className="truncate text-[12px] text-text3">
                  {group.description || (group.is_announcement ? "Announcements" : "Group chat")}
                </div>
              </div>
            </>
          );

          if (joined) {
            return (
              <Link
                key={group.id}
                href={`/communities/${communityId}/groups/${group.id}`}
                className="flex items-center gap-3 px-4 py-4 transition hover:bg-bg3"
              >
                {content}
                {unread > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-green px-1.5 font-mono text-[11px] font-bold text-green-dark">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
                <IconChevronRight size={18} className="shrink-0 text-text3" />
              </Link>
            );
          }

          return (
            <div key={group.id} className="flex items-center gap-3 px-4 py-4">
              {content}
              {isMember && (
                <button
                  onClick={() => handleJoin(group.id)}
                  disabled={pending}
                  className="btn-secondary shrink-0 px-4 py-2 text-[12px]"
                >
                  Join
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!isMember && (
        <p className="border-t border-border px-4 py-3 text-[12px] text-text3">
          Join the community to browse and join its groups.
        </p>
      )}
    </div>
  );
}
