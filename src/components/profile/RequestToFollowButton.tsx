"use client";

import { useState, useTransition } from "react";
import { requestToFollowProfile } from "@/app/actions/profile";
import type { FollowRequestStatus } from "@/lib/queries/profileDetails";

export function RequestToFollowButton({ targetId, initialStatus }: { targetId: string; initialStatus: FollowRequestStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError("");
    startTransition(async () => {
      const result = await requestToFollowProfile(targetId);
      if (result.error) setError(result.error);
      else setStatus("pending");
    });
  }

  if (status === "accepted") return null; // shouldn't render at all in this state -- the full profile shows instead
  if (status === "pending") {
    return <span className="btn-secondary px-4 py-2 text-[13px] opacity-70">Request sent</span>;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button onClick={handleClick} disabled={pending} className="btn-primary px-4 py-2 text-[13px]">
        {pending ? "Sending…" : status === "rejected" ? "Request again" : "Request to follow"}
      </button>
      {error && <p className="text-[12px] text-pink">{error}</p>}
    </div>
  );
}
