"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconHash, IconSpeakerphone, IconChevronRight } from "@tabler/icons-react";
import { joinGroup } from "@/app/actions/membership";
import type { CommunityGroup } from "@/lib/queries/membership";

// WhatsApp-style: one continuous list, divided rows, generous padding,
// single bold/muted hierarchy per row -- not a stack of separate bordered
// cards with gaps between them.
export function GroupList({
  communityId,
  groups,
  isMember,
  joinedGroupIds,
}: {
  communityId: string;
  groups: CommunityGroup[];
  isMember: boolean;
  joinedGroupIds: Set<string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
                  join
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
