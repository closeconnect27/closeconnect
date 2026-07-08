"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewFollowRequest } from "@/app/actions/profile";
import type { IncomingFollowRequest } from "@/lib/queries/profileDetails";

export function IncomingFollowRequests({ requests }: { requests: IncomingFollowRequest[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleReview(requestId: string, decision: "accepted" | "rejected") {
    startTransition(async () => {
      await reviewFollowRequest(requestId, decision);
      router.refresh();
    });
  }

  if (requests.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">
        Profile follow requests
      </h2>
      <div className="flex flex-col gap-2">
        {requests.map((req) => (
          <div key={req.id} className="card-elevated flex items-center justify-between gap-3 rounded-card bg-bg2 p-3">
            <span className="min-w-0 truncate text-[13px] font-medium text-text">
              {req.requester?.display_name ?? "Someone"}
            </span>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => handleReview(req.id, "accepted")}
                disabled={pending}
                className="btn-primary px-3 py-1.5 text-[12px]"
              >
                Accept
              </button>
              <button
                onClick={() => handleReview(req.id, "rejected")}
                disabled={pending}
                className="btn-secondary px-3 py-1.5 text-[12px]"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
