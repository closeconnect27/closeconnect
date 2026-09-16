"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconBan } from "@tabler/icons-react";
import { blockUser, unblockUser } from "@/app/actions/block";

// Deliberately a small, de-emphasized text action, not a prominent button
// next to Follow -- blocking is a rare, deliberate action (same posture
// most social apps take: easy to find if you're looking for it, not
// competing visually with the primary Follow/Message actions).
export function BlockButton({ targetId, initiallyBlocked }: { targetId: string; initiallyBlocked: boolean }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!blocked && !confirming) {
      setConfirming(true);
      return;
    }
    setError("");
    setConfirming(false);
    const next = !blocked;
    setBlocked(next);
    startTransition(async () => {
      const result = next ? await blockUser(targetId) : await unblockUser(targetId);
      if (result?.error) {
        setError(result.error);
        setBlocked(!next);
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
        className={`flex items-center gap-1.5 text-[12px] font-medium transition ${
          blocked ? "text-text3 hover:text-text2" : confirming ? "text-pink" : "text-text3 hover:text-pink"
        }`}
      >
        <IconBan size={13} />
        {blocked ? "Unblock" : confirming ? "Tap again to block" : "Block"}
      </button>
      {error && <p className="text-[11px] text-pink">{error}</p>}
    </div>
  );
}
