"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCircleCheck, IconClockHour4 } from "@tabler/icons-react";
import { DynamicForm } from "@/components/forms/DynamicForm";
import { joinOpenCommunity, submitJoinRequest } from "@/app/actions/membership";
import type { FormField } from "@/lib/queries/membership";

export function JoinSection({
  communityId,
  joinMode,
  isMember,
  isOwner,
  isLoggedIn,
  pendingStatus,
  formFields,
}: {
  communityId: string;
  joinMode: "open" | "request";
  isMember: boolean;
  isOwner: boolean;
  isLoggedIn: boolean;
  pendingStatus: "pending" | "approved" | "rejected" | null;
  formFields: FormField[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function requireLoginOrRun(fn: () => void) {
    if (!isLoggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(`/communities/${communityId}`)}`);
      return;
    }
    fn();
  }

  function handleJoinOpen() {
    requireLoginOrRun(() => {
      setError("");
      startTransition(async () => {
        const result = await joinOpenCommunity(communityId);
        if (result.error) setError(result.error);
        else router.refresh();
      });
    });
  }

  function handleSubmitRequest() {
    requireLoginOrRun(() => {
      setError("");
      startTransition(async () => {
        const result = await submitJoinRequest(communityId, answers);
        if (result.error) setError(result.error);
        else router.refresh();
      });
    });
  }

  if (isMember) {
    return (
      <p className="flex items-center gap-2 text-[14px] font-bold text-green">
        <IconCircleCheck size={18} />
        {isOwner ? "You're the owner" : "You're a member"}
      </p>
    );
  }

  if (pendingStatus === "pending") {
    return (
      <p className="flex items-center gap-2 text-[14px] text-text2">
        <IconClockHour4 size={18} className="text-text3" />
        Your request to join is awaiting approval.
      </p>
    );
  }

  if (joinMode === "open") {
    return (
      <div>
        <button onClick={handleJoinOpen} disabled={pending} className="btn-primary px-6 py-3 text-[14px]">
          {pending ? "Joining…" : "Join"}
        </button>
        {error && <p className="mt-2 text-[13px] text-pink">{error}</p>}
      </div>
    );
  }

  // request mode
  if (!showForm) {
    return (
      <button
        onClick={() => requireLoginOrRun(() => setShowForm(true))}
        className="btn-secondary px-6 py-3 text-[14px]"
      >
        {pendingStatus === "rejected" ? "Request to join again" : "Request to join"}
      </button>
    );
  }

  return (
    <div className="card-elevated rounded-card bg-bg2 p-4">
      {formFields.length > 0 && (
        <div className="mb-4">
          <DynamicForm fields={formFields} values={answers} onChange={setAnswers} />
        </div>
      )}
      {error && <p className="mb-2 text-[13px] text-pink">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={handleSubmitRequest}
          disabled={pending}
          className="btn-primary px-6 py-3 text-[14px]"
        >
          {pending ? "Submitting…" : "Submit request"}
        </button>
        <button onClick={() => setShowForm(false)} className="btn-secondary px-6 py-3 text-[14px]">
          Cancel
        </button>
      </div>
    </div>
  );
}
