"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCash } from "@tabler/icons-react";
import { markEventPayoutPaidOut } from "@/app/actions/events";

// CloseConnect runs one platform-wide Razorpay account -- every payment
// lands there regardless of host, and forwarding a host their share
// happens entirely outside the app (bank transfer/UPI, by hand). This is
// a ledger, not a payment rail: "Mark as paid out" only records that the
// transfer already happened elsewhere, it doesn't move any money itself.
export function PayoutSummary({
  eventId,
  owedAmount,
  paidOutAmount,
}: {
  eventId: string;
  owedAmount: number;
  paidOutAmount: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleMarkPaidOut() {
    setError("");
    startTransition(async () => {
      const result = await markEventPayoutPaidOut(eventId);
      if (result?.error) setError(result.error);
      else {
        setConfirming(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-card border border-border bg-bg2 p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">
        <IconCash size={14} />
        Payout to you
      </h2>
      <p className="text-[13px] text-text3">
        All ticket payments settle to CloseConnect&apos;s account first -- this just tracks what&apos;s still owed to you
        for this event, not an automatic transfer.
      </p>
      <div className="flex gap-6">
        <div>
          <p className="font-heading text-[20px] font-bold text-text">₹{owedAmount.toLocaleString("en-IN")}</p>
          <p className="text-[11px] text-text3">Owed to you</p>
        </div>
        <div>
          <p className="font-heading text-[20px] font-bold text-text2">₹{paidOutAmount.toLocaleString("en-IN")}</p>
          <p className="text-[11px] text-text3">Already paid out</p>
        </div>
      </div>

      {owedAmount > 0 &&
        (confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-text3">Confirm you&apos;ve received this transfer already?</span>
            <button onClick={handleMarkPaidOut} disabled={pending} className="btn-primary px-4 py-2 text-[12px]">
              {pending ? "Saving…" : "Yes, mark as paid out"}
            </button>
            <button onClick={() => setConfirming(false)} className="text-[12px] text-text3 transition hover:text-text2">
              Never mind
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="btn-secondary w-fit px-4 py-2 text-[13px]">
            Mark as paid out
          </button>
        ))}

      {error && <p className="text-[12px] text-pink">{error}</p>}
    </div>
  );
}
