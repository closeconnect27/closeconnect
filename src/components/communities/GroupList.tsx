"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconHash, IconSpeakerphone, IconChevronRight } from "@tabler/icons-react";
import { joinGroup } from "@/app/actions/membership";
import type { CommunityGroup } from "@/lib/queries/membership";

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
    <div className="flex flex-col gap-2">
      {groups.map((group) => {
        const joined = joinedGroupIds.has(group.id);
        const Icon = group.is_announcement ? IconSpeakerphone : IconHash;
        const label = (
          <div className="flex items-center gap-2">
            <Icon size={16} className="text-text3" />
            <div>
              <div className="text-[13px] font-medium text-text">{group.name}</div>
              {group.description && <div className="text-[11px] text-text3">{group.description}</div>}
            </div>
          </div>
        );

        if (joined) {
          return (
            <Link
              key={group.id}
              href={`/communities/${communityId}/groups/${group.id}`}
              className="flex items-center justify-between rounded-card border border-border bg-bg2 px-3.5 py-2.5 hover:border-border2"
            >
              {label}
              <IconChevronRight size={16} className="text-text3" />
            </Link>
          );
        }

        return (
          <div
            key={group.id}
            className="flex items-center justify-between rounded-card border border-border bg-bg2 px-3.5 py-2.5"
          >
            {label}
            {isMember && (
              <button
                onClick={() => handleJoin(group.id)}
                disabled={pending}
                className="rounded-full border border-green px-3 py-1 text-[11px] font-bold text-green disabled:opacity-50"
              >
                join
              </button>
            )}
          </div>
        );
      })}
      {!isMember && (
        <p className="text-[12px] text-text3">Join the community to browse and join its groups.</p>
      )}
    </div>
  );
}
