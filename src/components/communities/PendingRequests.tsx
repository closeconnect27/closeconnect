"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewJoinRequest } from "@/app/actions/membership";
import type { FormField } from "@/lib/queries/membership";

type PendingRequest = {
  id: string;
  respondent_id: string;
  response_data: Record<string, string>;
  created_at: string;
  profiles: { display_name: string } | null;
};

export function PendingRequests({
  communityId,
  requests,
  formFields,
}: {
  communityId: string;
  requests: PendingRequest[];
  formFields: FormField[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleReview(responseId: string, decision: "approved" | "rejected") {
    startTransition(async () => {
      await reviewJoinRequest(communityId, responseId, decision);
      router.refresh();
    });
  }

  if (requests.length === 0) {
    return <p className="text-[13px] text-text3">No pending requests.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((req) => (
        <div key={req.id} className="rounded-card border border-border bg-bg2 p-4">
          <div className="mb-2 text-[13px] font-bold text-text">
            {req.profiles?.display_name ?? "Someone"}
          </div>
          {formFields.length > 0 && (
            <div className="mb-3 flex flex-col gap-1.5">
              {formFields.map((field) => (
                <div key={field.id} className="text-[12px]">
                  <span className="text-text3">{field.label}: </span>
                  <span className="text-text2">{req.response_data[field.id] || "—"}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => handleReview(req.id, "approved")}
              disabled={pending}
              className="rounded-full bg-green px-4 py-1.5 text-[12px] font-bold text-green-dark disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => handleReview(req.id, "rejected")}
              disabled={pending}
              className="rounded-full border border-border2 px-4 py-1.5 text-[12px] font-medium text-text2 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
