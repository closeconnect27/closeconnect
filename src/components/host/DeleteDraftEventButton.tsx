"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "@tabler/icons-react";
import { deleteDraftEvent } from "@/app/actions/events";

// Its own client component, same reason as EventHostLink/JoinBadge --
// HostEventRow's whole row is a ClickableCard, and stopPropagation has to
// live in this component's own onClick, not be passed in as a prop from
// the Server Component that renders it.
export function DeleteDraftEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setError("");
    startTransition(async () => {
      const result = await deleteDraftEvent(eventId);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-[11px] text-text3">Delete?</span>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="rounded-full bg-pink px-2.5 py-1 text-[11px] font-bold text-white transition hover:brightness-110"
        >
          {pending ? "…" : "Yes"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(false);
          }}
          className="text-[11px] text-text3 transition hover:text-text2"
        >
          No
        </button>
        {error && <span className="text-[11px] text-pink">{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setConfirming(true);
      }}
      aria-label="Delete draft"
      className="rounded-full p-1.5 text-text3 transition hover:bg-pink-tint hover:text-pink"
    >
      <IconTrash size={14} />
    </button>
  );
}
