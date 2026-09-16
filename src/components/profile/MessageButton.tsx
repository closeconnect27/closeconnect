"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconMessageCircle2 } from "@tabler/icons-react";
import { startOrGetProfileDmThread } from "@/app/actions/profileDm";

// The web counterpart to mobile's own profile "Message" entry point --
// finds (or starts) the pair's thread and jumps straight into it, same as
// tapping a user's name from a DM list would. Status ('pending' vs
// 'accepted') is entirely decided server-side (the auto-accept-if-followed
// trigger, 0126); this button doesn't need to know or guess which.
export function MessageButton({ targetId }: { targetId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleClick() {
    setError("");
    startTransition(async () => {
      const result = await startOrGetProfileDmThread(targetId);
      if (result.error || !result.threadId) {
        setError(result.error ?? "Could not start this conversation");
        return;
      }
      router.push(`/messages/${result.threadId}`);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={handleClick} disabled={pending} className="btn-secondary shrink-0 px-4 py-2 text-[13px]">
        <IconMessageCircle2 size={14} />
        <span className="hidden sm:inline">Message</span>
      </button>
      {error && <p className="text-[11px] text-pink">{error}</p>}
    </div>
  );
}
