"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconInbox, IconUserCircle } from "@tabler/icons-react";
import { reviewJoinRequest } from "@/app/actions/membership";
import { EmptyState } from "@/components/ui/EmptyState";
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
    return <EmptyState icon={IconInbox} title="No pending requests" compact />;
  }

  return (
    <div className="flex flex-col gap-4">
      {requests.map((req) => (
        <div key={req.id} className="card-elevated rounded-card bg-bg2 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[14px] font-bold text-text">{req.profiles?.display_name ?? "Someone"}</span>
            {/* profile_details_select_staff_reviewing (0033) lets staff see
                this applicant's full profile while the request is pending,
                regardless of their profile_visibility setting -- the
                "judge quality before approving" case. */}
            <Link
              href={`/profile/${req.respondent_id}`}
              target="_blank"
              className="flex items-center gap-1 text-[12px] font-medium text-text3 transition hover:text-green"
            >
              <IconUserCircle size={14} />
              View full profile
            </Link>
          </div>
          {formFields.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              {formFields.map((field) => (
                <div key={field.id} className="text-[12px]">
                  <span className="text-text3">{field.label}: </span>
                  <span className="text-text2">{req.response_data[field.id] || "—"}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => handleReview(req.id, "approved")}
              disabled={pending}
              className="btn-primary px-4 py-2 text-[12px]"
            >
              Approve
            </button>
            <button
              onClick={() => handleReview(req.id, "rejected")}
              disabled={pending}
              className="btn-secondary px-4 py-2 text-[12px]"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
