"use client";

import { useState, useTransition } from "react";
import { IconCircleCheck, IconClock, IconAlertTriangle, IconBuildingBank } from "@tabler/icons-react";
import { savePayoutAccount, type PayoutAccountView } from "@/app/actions/organizerPayouts";

const inputClass = "w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

const STATUS_META: Record<PayoutAccountView["verificationStatus"], { label: string; color: string; icon: typeof IconCircleCheck }> = {
  verified: { label: "Verified", color: "text-green", icon: IconCircleCheck },
  verification_pending: { label: "Verification pending", color: "text-purple", icon: IconClock },
  verification_failed: { label: "Verification failed", color: "text-pink", icon: IconAlertTriangle },
  not_verified: { label: "Not verified", color: "text-text3", icon: IconAlertTriangle },
};

/** "Payments & Payouts" -> "Payout Account" section (spec section 4/5/6).
 * Shows the current masked account if one exists, or the add-account form
 * otherwise/underneath -- adding a new one always supersedes the old
 * rather than editing it in place (section 13). */
export function PayoutAccountForm({ account }: { account: PayoutAccountView | null }) {
  const [showForm, setShowForm] = useState(!account);
  const [accountHolderName, setAccountHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await savePayoutAccount({ accountHolderName, accountNumber, confirmAccountNumber, ifsc });
      if (result.error) {
        setError(result.error);
        return;
      }
      setAccountHolderName("");
      setAccountNumber("");
      setConfirmAccountNumber("");
      setIfsc("");
      setShowForm(false);
    });
  }

  const meta = account ? STATUS_META[account.verificationStatus] : null;
  const StatusIcon = meta?.icon;

  return (
    <div className="flex flex-col gap-4">
      {account && (
        <div className="flex items-center gap-3 rounded-card border border-border bg-bg2 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg3">
            <IconBuildingBank size={18} className="text-text2" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold text-text">{account.bankName ?? "Bank account"}</p>
            <p className="text-[12px] text-text3">
              A/C ending ****{account.last4} · {account.accountHolderName}
            </p>
            {account.verificationStatus === "verification_failed" && account.verificationFailureReason && (
              <p className="mt-1 text-[12px] text-pink">{account.verificationFailureReason}</p>
            )}
          </div>
          {meta && StatusIcon && (
            <span className={`flex shrink-0 items-center gap-1.5 text-[12px] font-bold ${meta.color}`}>
              <StatusIcon size={14} />
              {meta.label}
            </span>
          )}
        </div>
      )}

      {!showForm ? (
        <button type="button" onClick={() => setShowForm(true)} className="btn-secondary self-start px-4 py-2.5 text-[13px]">
          {account ? "Add a different account" : "Add bank account"}
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-card border border-border bg-bg2 p-4">
          <p className="mb-1 text-[13px] font-bold text-text">Add bank account</p>
          <input
            type="text"
            value={accountHolderName}
            onChange={(e) => setAccountHolderName(e.target.value)}
            placeholder="Account holder name"
            className={inputClass}
          />
          <input
            type="text"
            inputMode="numeric"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
            placeholder="Bank account number"
            className={inputClass}
          />
          <input
            type="text"
            inputMode="numeric"
            value={confirmAccountNumber}
            onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/\D/g, ""))}
            placeholder="Confirm bank account number"
            className={inputClass}
          />
          <input
            type="text"
            value={ifsc}
            onChange={(e) => setIfsc(e.target.value.toUpperCase())}
            placeholder="IFSC code"
            maxLength={11}
            className={inputClass}
          />
          {error && <p className="text-[13px] text-pink">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary px-6 py-2.5 text-[14px]">
              {pending ? "Saving…" : "Save & verify"}
            </button>
            {account && (
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-4 py-2.5 text-[13px]">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
