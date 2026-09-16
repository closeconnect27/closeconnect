"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconDoorExit } from "@tabler/icons-react";
import { leaveCommunity } from "@/app/actions/membership";

// Its own section at the bottom of the community page (not part of
// JoinSection) for two reasons: JoinSection is also embedded on an event's
// detail page (0086) when the event belongs to a community, and leaving
// isn't a decision that belongs there; and a destructive-ish account
// action reads better as its own "danger zone" at the end of the page than
// competing for attention with the Join button up top.
//
// The owner can't just leave -- "message the host"-style features need
// owner_id to always point at someone still in the community, so leaving
// as the owner means picking a successor first (transferCommunityOwnership,
// 0109). isOwner decides which of the two flows below renders; otherMembers
// is who they can hand off to (already-loaded first page of the roster,
// reused rather than a fresh fetch).
export function LeaveCommunitySection({
  communityId,
  communityName,
  isOwner,
  otherMembers,
}: {
  communityId: string;
  communityName: string;
  isOwner: boolean;
  otherMembers: { user_id: string; display_name: string }[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pickingSuccessor, setPickingSuccessor] = useState(false);
  const [successorId, setSuccessorId] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleLeave(newOwnerUserId?: string) {
    setError("");
    startTransition(async () => {
      const result = await leaveCommunity(communityId, newOwnerUserId);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
      } else {
        router.push("/communities");
        router.refresh();
      }
    });
  }

  if (isOwner) {
    return (
      <div className="mt-10 border-t border-border pt-6">
        {pickingSuccessor ? (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
            <p className="text-[13px] text-text2">
              Choose who takes over as owner of {communityName} -- you&apos;ll become a regular admin, then leave.
            </p>
            {otherMembers.length === 0 ? (
              <p className="text-[13px] text-text3">There&apos;s no one else here to hand ownership to yet.</p>
            ) : (
              <select
                value={successorId}
                onChange={(e) => setSuccessorId(e.target.value)}
                className="w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-2.5 text-[13px] focus:border-green"
              >
                <option value="">Choose a member…</option>
                {otherMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleLeave(successorId)}
                disabled={pending || !successorId}
                className="text-[14px] font-bold text-pink hover:underline disabled:opacity-40"
              >
                {pending ? "Transferring…" : "Transfer & leave"}
              </button>
              <button onClick={() => setPickingSuccessor(false)} className="text-[14px] text-text2 hover:text-text">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setPickingSuccessor(true)}
            className="mx-auto flex items-center gap-1.5 text-[13px] font-medium text-pink transition hover:underline"
          >
            <IconDoorExit size={14} />
            Leave community
          </button>
        )}
        {error && <p className="mt-2 text-center text-[13px] text-pink">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-10 border-t border-border pt-6">
      {confirming ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[13px] text-text2">Leave {communityName}? You&apos;ll lose access to its groups and chat.</p>
          <div className="flex items-center gap-4">
            <button onClick={() => handleLeave()} disabled={pending} className="text-[14px] font-bold text-pink hover:underline">
              {pending ? "Leaving…" : "Yes, leave"}
            </button>
            <button onClick={() => setConfirming(false)} className="text-[14px] text-text2 hover:text-text">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="mx-auto flex items-center gap-1.5 text-[13px] font-medium text-pink transition hover:underline"
        >
          <IconDoorExit size={14} />
          Leave community
        </button>
      )}
      {error && <p className="mt-2 text-center text-[13px] text-pink">{error}</p>}
    </div>
  );
}
