"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
            <Link href={`/profile/${req.requester_id}`} className="flex min-w-0 items-center gap-2 truncate text-[13px] font-medium text-text transition hover:text-green">
              {req.requester?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not from next/image's configured remote patterns
                <img src={req.requester.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-tint text-[11px] font-bold text-green">
                  {(req.requester?.display_name ?? "?").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 truncate">{req.requester?.display_name ?? "Someone"}</span>
            </Link>
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
