"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCircleCheck, IconClockHour4, IconUsersGroup } from "@tabler/icons-react";
import { DynamicForm } from "@/components/forms/DynamicForm";
import { joinOpenCommunity, submitJoinRequest } from "@/app/actions/membership";
import type { FormField } from "@/lib/queries/membership";

export function JoinSection({
  communityId,
  joinMode,
  isMember,
  isOwner,
  isLoggedIn,
  isFull,
  pendingStatus,
  formFields,
  // Set when this is embedded somewhere other than the community's own
  // page (e.g. an event's detail page) -- "Join" alone is clear when the
  // whole page is already about that community, but ambiguous dropped into
  // an event page, so the button spells out which community it joins.
  communityName,
}: {
  communityId: string;
  joinMode: "open" | "request";
  isMember: boolean;
  isOwner: boolean;
  isLoggedIn: boolean;
  // member_limit reached (0057) -- checked again server-side by a DB
  // trigger regardless, this is just what stops the UI from offering an
  // action that would fail anyway.
  isFull: boolean;
  pendingStatus: "pending" | "approved" | "rejected" | null;
  formFields: FormField[];
  communityName?: string;
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

  if (isFull) {
    return (
      <p className="flex items-center gap-2 text-[14px] text-text2">
        <IconUsersGroup size={18} className="text-text3" />
        This community is full.
      </p>
    );
  }

  if (joinMode === "open") {
    return (
      <div>
        <button onClick={handleJoinOpen} disabled={pending} className="btn-join px-6 py-3 text-[14px]">
          {pending ? "Joining…" : communityName ? `Join ${communityName}` : "Join"}
        </button>
        {error && <p className="mt-2 text-[13px] text-pink">{error}</p>}
      </div>
    );
  }

  // request mode
  if (!showForm) {
    const label = communityName ? `Request to join ${communityName}` : "Request to join";
    return (
      <button
        onClick={() => requireLoginOrRun(() => setShowForm(true))}
        className="btn-secondary px-6 py-3 text-[14px]"
      >
        {pendingStatus === "rejected" ? `${label} again` : label}
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
          className="btn-join px-6 py-3 text-[14px]"
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
