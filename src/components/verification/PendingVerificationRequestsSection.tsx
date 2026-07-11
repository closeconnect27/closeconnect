"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { reviewVerificationRequest } from "@/app/actions/verification";
import type { PendingVerificationRequest } from "@/lib/queries/verification";

// Admin-only (the page gates whether this even renders), same pattern as
// PendingClaimsSection. Community verification only -- organizer
// verification is automatic now (0060), so a pending request here is
// always target_type='community'.
export function PendingVerificationRequestsSection({ requests }: { requests: PendingVerificationRequest[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  function handleReview(requestId: string, decision: "approved" | "rejected") {
    setError("");
    setPendingId(requestId);
    startTransition(async () => {
      const result = await reviewVerificationRequest(requestId, decision);
      setPendingId(null);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  if (requests.length === 0) return null;

  return (
    <section id="pending-verifications" className="mt-8">
      <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">
        Pending verification requests
      </h2>
      {error && <p className="mb-2 text-[12px] text-pink">{error}</p>}
      <div className="flex flex-col gap-3">
        {requests.map((req) => (
          <div key={req.id} className="card-elevated rounded-card bg-bg2 p-4">
            <p className="text-[14px] font-bold text-text">{req.targetLabel}</p>
            <p className="mt-1 text-[12px] text-text3">
              Requested by{" "}
              <Link href={`/profile/${req.requested_by}`} className="font-medium text-text2 transition hover:text-green hover:underline">
                {req.requesterName}
              </Link>
            </p>
            {req.note && <p className="mt-2 text-[13px] text-text2">&ldquo;{req.note}&rdquo;</p>}

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => handleReview(req.id, "approved")}
                disabled={pendingId === req.id}
                className="btn-primary px-4 py-2 text-[12px]"
              >
                Approve
              </button>
              <button
                onClick={() => handleReview(req.id, "rejected")}
                disabled={pendingId === req.id}
                className="btn-secondary px-4 py-2 text-[12px]"
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
