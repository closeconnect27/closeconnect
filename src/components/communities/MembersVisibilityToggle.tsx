"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { toggleMembersListVisibility } from "@/app/actions/communities";

// Owner-only -- the page only renders this for isOwner, and the Server
// Action re-checks ownership itself regardless (SPEC.md Section 11).
export function MembersVisibilityToggle({ communityId, visible }: { communityId: string; visible: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    setError("");
    startTransition(async () => {
      const result = await toggleMembersListVisibility(communityId, !visible);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-full border border-border2 px-3 py-1.5 text-[12px] font-medium text-text2 transition hover:border-green hover:text-green disabled:opacity-60"
      >
        {visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
        {visible ? "Member list visible to everyone" : "Member list hidden from members"}
      </button>
      {error && <p className="text-[12px] text-pink">{error}</p>}
    </div>
  );
}
