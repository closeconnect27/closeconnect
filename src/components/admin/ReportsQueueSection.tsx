"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconFlag } from "@tabler/icons-react";
import { resolveReport } from "@/app/actions/reports";
import type { ResolvedReport } from "@/lib/queries/reports";
import { EmptyState } from "@/components/ui/EmptyState";

const TARGET_LABELS = { community: "Community", event: "Event", message: "Message", user: "User" } as const;

// Admin-only (the page gates whether this even renders), same pattern as
// PendingClaimsSection/PendingVerificationRequestsSection.
export function ReportsQueueSection({ reports }: { reports: ResolvedReport[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  function handleDecision(reportId: string, decision: "resolved" | "dismissed") {
    setError("");
    setPendingId(reportId);
    startTransition(async () => {
      const result = await resolveReport(reportId, decision);
      setPendingId(null);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">
        Reports {reports.length > 0 && `(${reports.length})`}
      </h2>
      {error && <p className="mb-2 text-[12px] text-pink">{error}</p>}
      {reports.length === 0 ? (
        <EmptyState icon={IconFlag} title="No open reports" compact />
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((r) => (
            <div key={r.id} className="card-elevated rounded-card bg-bg2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full border border-border2 px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide text-text3">
                  {TARGET_LABELS[r.target_type]}
                </span>
                <span className="text-[11px] text-text3">{new Date(r.created_at).toLocaleDateString("en-IN")}</span>
              </div>
              <p className="mt-2 text-[14px] font-bold text-text">
                {r.targetHref ? (
                  <Link href={r.targetHref} className="hover:text-green hover:underline">
                    {r.targetLabel}
                  </Link>
                ) : (
                  r.targetLabel
                )}
              </p>
              <p className="mt-1 text-[13px] text-text2">
                <span className="text-text3">Reason: </span>
                {r.reason}
              </p>
              <p className="mt-1 text-[12px] text-text3">Reported by {r.reporterName}</p>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleDecision(r.id, "resolved")}
                  disabled={pendingId === r.id}
                  className="btn-primary px-4 py-2 text-[12px]"
                >
                  Mark resolved
                </button>
                <button
                  onClick={() => handleDecision(r.id, "dismissed")}
                  disabled={pendingId === r.id}
                  className="btn-secondary px-4 py-2 text-[12px]"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
