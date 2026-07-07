"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconBadge, IconClockHour4 } from "@tabler/icons-react";
import { ClaimCommunityModal } from "@/components/communities/ClaimCommunityModal";

// Only ever rendered for kind='external' communities (gated by the caller,
// same as JoinSection is only rendered for isNative) -- claim_status
// unclaimed/rejected shows the button, pending shows a status line, and
// approved communities never render this at all (they're just owned).
export function ClaimSection({
  communityId,
  claimStatus,
  isLoggedIn,
}: {
  communityId: string;
  claimStatus: "unclaimed" | "pending" | "approved" | "rejected";
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (claimStatus === "pending") {
    return (
      <p className="flex items-center gap-2 text-[14px] text-text2">
        <IconClockHour4 size={18} className="text-text3" />
        A claim for this community is awaiting review.
      </p>
    );
  }

  if (claimStatus !== "unclaimed" && claimStatus !== "rejected") return null;

  function handleClick() {
    if (!isLoggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(`/communities/${communityId}`)}`);
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <button onClick={handleClick} className="btn-secondary px-4 py-2 text-[13px]">
        <IconBadge size={14} />
        Claim this community
      </button>
      {open && <ClaimCommunityModal communityId={communityId} onClose={() => setOpen(false)} />}
    </>
  );
}
