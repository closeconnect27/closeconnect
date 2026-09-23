"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconX } from "@tabler/icons-react";
import { previewCancellationForRegistration, cancelMyRegistration } from "@/app/actions/eventCancellation";

type AddonLine = { id: string; nameSnapshot: string; amountPaise: number; refundAmountPaise: number; refundable: boolean };

type Preview = {
  eligible: boolean;
  refundPercentage: number;
  refundAmountPaise: number;
  cancellationChargePaise: number;
  amountPaidPaise: number;
  ticketAmountPaise: number;
  ticketRefundAmountPaise: number;
  addonLines: AddonLine[];
  addonRefundAmountPaise: number;
};

/** Section 10 of the spec this was built from: a two-step "preview the
 * exact refund, then confirm" flow, both numbers computed server-side by
 * the SAME calculateCancellationRefund the actual cancellation uses --
 * never a frontend guess, so what's shown here is guaranteed to match what
 * actually happens on confirm. */
export function CancelBookingButton({ registrationId }: { registrationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  async function openConfirm() {
    setError("");
    setPreview(null);
    setOpen(true);
    setLoadingPreview(true);
    const result = await previewCancellationForRegistration(registrationId);
    setLoadingPreview(false);
    if (result.error || !result.result) {
      setError(result.error ?? "Could not load cancellation details.");
      return;
    }
    setPreview(result.result);
  }

  function confirmCancel() {
    setError("");
    startTransition(async () => {
      const result = await cancelMyRegistration(registrationId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={openConfirm} className="text-[13px] font-medium text-pink transition hover:underline">
        Cancel booking
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setOpen(false)} role="dialog" aria-modal="true">
          <div className="w-full max-w-[420px] rounded-card bg-bg2 p-6 shadow-card-hover">
            <div className="mb-4 flex items-start justify-between">
              <div className="font-heading text-[14px] font-bold">Cancel this booking?</div>
              <button onClick={() => setOpen(false)} className="text-text2 transition hover:text-text">
                <IconX size={18} />
              </button>
            </div>

            {loadingPreview ? (
              <p className="text-[13px] text-text2">Checking your refund eligibility…</p>
            ) : preview ? (
              <div className="flex flex-col gap-3">
                {preview.amountPaidPaise === 0 ? (
                  <p className="text-[13px] text-text2">This was a free registration -- there&apos;s nothing to refund.</p>
                ) : preview.refundAmountPaise > 0 ? (
                  <div className="rounded-card-sm bg-bg3 p-4 text-[13px]">
                    {preview.addonLines.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between">
                          <span className="text-text2">Ticket refund</span>
                          <span className="font-bold text-text">₹{(preview.ticketRefundAmountPaise / 100).toLocaleString("en-IN")}</span>
                        </div>
                        {preview.addonLines.map((a) => (
                          <div key={a.id} className="flex justify-between">
                            <span className="text-text2">
                              {a.nameSnapshot}
                              {!a.refundable && <span className="text-text3"> (non-refundable)</span>}
                            </span>
                            <span className="text-text">₹{(a.refundAmountPaise / 100).toLocaleString("en-IN")}</span>
                          </div>
                        ))}
                        <div className="mt-1 flex justify-between border-t border-border pt-1.5">
                          <span className="font-bold text-text">Total refund</span>
                          <span className="font-bold text-green">₹{(preview.refundAmountPaise / 100).toLocaleString("en-IN")}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between">
                        <span className="text-text2">Refund</span>
                        <span className="font-bold text-green">₹{(preview.refundAmountPaise / 100).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {preview.cancellationChargePaise > 0 && (
                      <div className="mt-1.5 flex justify-between">
                        <span className="text-text2">Cancellation charge</span>
                        <span className="text-text">₹{(preview.cancellationChargePaise / 100).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    <p className="mt-2 text-[11px] text-text3">Refunded to your original payment method, typically within 5–7 business days.</p>
                  </div>
                ) : (
                  <p className="text-[13px] text-text2">Per this event&apos;s cancellation policy, this booking isn&apos;t eligible for a refund at this point.</p>
                )}
                <p className="text-[12px] text-text3">This action cannot be undone.</p>
              </div>
            ) : null}

            {error && <p className="mt-3 text-[13px] text-pink">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center py-2.5 text-[13px]">
                Keep booking
              </button>
              <button
                onClick={confirmCancel}
                disabled={pending || loadingPreview || !!error}
                className="flex flex-1 items-center justify-center rounded-full bg-pink py-2.5 text-[13px] font-bold text-white transition disabled:opacity-40"
              >
                {pending ? "Cancelling…" : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
