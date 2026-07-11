"use client";

import { useState, useTransition } from "react";
import { requestCommunityVerification } from "@/app/actions/verification";
import type { VerificationRequestStatus } from "@/lib/queries/verification";

// Community verification only now -- organizer verification is automatic
// (owning a community or hosting an event sets it directly, see 0060),
// so there's no button/request flow left for that target type.
export function RequestVerificationButton({
  targetId,
  isVerified,
  initialStatus,
}: {
  targetId: string;
  isVerified: boolean;
  initialStatus: VerificationRequestStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState("");
  const [showNoteField, setShowNoteField] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (isVerified) return null;

  function handleSubmit() {
    setError("");
    startTransition(async () => {
      const result = await requestCommunityVerification(targetId, { note: note || undefined });
      if (result.error) setError(result.error);
      else {
        setStatus("pending");
        setShowNoteField(false);
      }
    });
  }

  if (status === "pending") {
    return <p className="text-[12px] text-text3">Verification request pending review.</p>;
  }

  if (!showNoteField) {
    return (
      <button type="button" onClick={() => setShowNoteField(true)} className="btn-secondary px-4 py-2 text-[13px]">
        {status === "rejected" ? "Request verification again" : "Request verification"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything that helps us verify this (optional)"
        rows={2}
        maxLength={500}
        className="w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[13px] transition focus:border-green"
      />
      {error && <p className="text-[12px] text-pink">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={handleSubmit} disabled={pending} className="btn-primary px-4 py-2 text-[13px]">
          {pending ? "Sending…" : "Submit request"}
        </button>
        <button type="button" onClick={() => setShowNoteField(false)} className="btn-secondary px-4 py-2 text-[13px]">
          Cancel
        </button>
      </div>
    </div>
  );
}
