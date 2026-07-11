"use client";

import { useState, useTransition } from "react";
import { IconUserPlus, IconUserCheck } from "@tabler/icons-react";
import { followProfile, unfollowProfile } from "@/app/actions/profile";

// Instant, no-approval follow -- only ever rendered for public/members_only
// profiles (see PublicProfilePage); private profiles keep the existing
// RequestToFollowButton request/approval flow instead.
export function FollowButton({ targetId, initiallyFollowing }: { targetId: string; initiallyFollowing: boolean }) {
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
