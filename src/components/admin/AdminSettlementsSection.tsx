"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markSettlementPaidManually, retryOrganizerPayout, type AdminSettlementView } from "@/app/actions/organizerPayouts";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  eligible: "Ready for payout",
  processing: "Processing",
  processed: "Paid",
  failed: "Failed",
  on_hold: "On hold",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "text-text3",
  eligible: "text-purple",
  processing: "text-purple",
  processed: "text-green",
  failed: "text-pink",
  on_hold: "text-pink",
};

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/** Replaces the old naive per-registration payout summary
 * (PayoutSummarySection, computed from form_responses.payout_status alone
 * -- no refund or fee awareness) with the correctly-computed
 * organizer_settlements ledger. Bank details are always masked here (spec
 * section 23: "Sensitive bank details should remain masked"). */
export function AdminSettlementsSection({ settlements }: { settlements: AdminSettlementView[] }) {
  if (settlements.length === 0) {
    return <p className="mt-8 text-center text-[13px] text-text3">No settlements yet.</p>;
  }

  return (
    <div className="mt-8 flex flex-col divide-y divide-border rounded-card border border-border bg-bg2">
      {settlements.map((s) => (
        <SettlementRow key={s.id} settlement={s} />
      ))}
    </div>
  );
}

function SettlementRow({ settlement: s }: { settlement: AdminSettlementView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleMarkPaid() {
    startTransition(async () => {
      await markSettlementPaidManually(s.id);
      router.refresh();
    });
  }
  function handleRetry() {
    startTransition(async () => {
      await retryOrganizerPayout(s.id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold text-text">{s.eventName}</p>
          <p className="truncate text-[12px] text-text3">
            {s.organizerName}
            {s.payoutAccountMasked ? ` · ${s.payoutAccountMasked}` : " · No payout account"}
          </p>
        </div>
        <span className={`shrink-0 text-[12px] font-bold ${STATUS_COLOR[s.status] ?? "text-text3"}`}>{STATUS_LABEL[s.status] ?? s.status}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-text2">
        <span>Gross: {rupees(s.grossSalesPaise)}</span>
        {s.refundAmountPaise > 0 && <span>Refunds: {rupees(s.refundAmountPaise)}</span>}
        {s.platformFeePaise > 0 && <span>Platform fee: {rupees(s.platformFeePaise)}</span>}
        <span className="font-bold text-text">Net payable: {rupees(s.netPayablePaise)}</span>
      </div>
      {s.status === "failed" && s.failureReason && <p className="text-[12px] text-pink">{s.failureReason}</p>}
      {(s.status === "failed" || s.status === "eligible" || s.status === "processing") && (
        <div className="flex gap-2">
          {s.status === "failed" && (
            <button onClick={handleRetry} disabled={pending} className="btn-secondary px-3 py-1.5 text-[12px]">
              {pending ? "Retrying…" : "Retry payout"}
            </button>
          )}
          <button onClick={handleMarkPaid} disabled={pending} className="btn-secondary px-3 py-1.5 text-[12px]">
            {pending ? "Marking…" : "Mark paid manually"}
          </button>
        </div>
      )}
    </div>
  );
}
