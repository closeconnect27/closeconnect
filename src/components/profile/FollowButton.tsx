"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconUserPlus, IconUserCheck } from "@tabler/icons-react";
import { followProfile, unfollowProfile } from "@/app/actions/profile";

// "Following" is a unified concept (getIsFollowing) covering both an
// instant follow (public/members_only) and an accepted request (the
// private-profile flow) -- so this button also renders, already in its
// "Following" state, for a private profile the viewer was approved into.
// Un-following there revokes that approval too (unfollowProfile clears
// both tables), which can flip the profile back to blocked -- router.refresh()
// after every toggle keeps the rest of the page (details, the tabs below)
// in sync with whatever visibility now actually allows, rather than the
// stale already-rendered content sticking around untouched.
export function FollowButton({ targetId, initiallyFollowing }: { targetId: string; initiallyFollowing: boolean }) {
  const router = useRouter();
  const [following, setFollowing] = useState(initiallyFollowing);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError("");
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      const result = next ? await followProfile(targetId) : await unfollowProfile(targetId);
      if (result?.error) {
        setError(result.error);
        setFollowing(!next);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={pending}
        className={following ? "btn-secondary shrink-0 px-4 py-2 text-[13px]" : "btn-primary shrink-0 px-4 py-2 text-[13px]"}
      >
        {following ? <IconUserCheck size={14} /> : <IconUserPlus size={14} />}
        <span className="hidden sm:inline">{following ? "Following" : "Follow"}</span>
      </button>
      {error && <p className="text-[11px] text-pink">{error}</p>}
    </div>
  );
}
