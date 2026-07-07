"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewCommunityClaim } from "@/app/actions/communities";
import type { PendingClaim } from "@/lib/queries/claims";

// Admin-only (the page gates whether this even renders) -- replaces manual
// Table Editor work for approving/rejecting community claims.
export function PendingClaimsSection({ claims }: { claims: PendingClaim[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  function handleReview(claimId: string, decision: "approved" | "rejected") {
    setError("");
    setPendingId(claimId);
    startTransition(async () => {
      const result = await reviewCommunityClaim(claimId, decision);
      setPendingId(null);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  if (claims.length === 0) return null;

  return (
    <section id="pending-claims" className="mt-8">
      <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">
        Pending community claims
      </h2>
      {error && <p className="mb-2 text-[12px] text-pink">{error}</p>}
      <div className="flex flex-col gap-3">
        {claims.map((claim) => (
          <div key={claim.id} className="card-elevated rounded-card bg-bg2 p-4">
            <p className="text-[14px] font-bold text-text">{claim.communities?.name ?? "Unknown community"}</p>
            <div className="mt-2 flex flex-col gap-1 text-[13px] text-text2">
              <span>{claim.name}</span>
              <span>{claim.phone}</span>
              <span>{claim.email}</span>
              {claim.proof && <span className="text-text3">Proof: {claim.proof}</span>}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => handleReview(claim.id, "approved")}
                disabled={pendingId === claim.id}
                className="btn-primary px-4 py-2 text-[12px]"
              >
                Approve
              </button>
              <button
                onClick={() => handleReview(claim.id, "rejected")}
                disabled={pendingId === claim.id}
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
