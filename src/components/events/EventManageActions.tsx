"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCopy, IconBan } from "@tabler/icons-react";
import { cancelEvent, duplicateEvent } from "@/app/actions/events";

export function EventManageActions({ eventId, status }: { eventId: string; status: "active" | "cancelled" }) {
  const router = useRouter();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleCancel() {
    setError("");
    startTransition(async () => {
      const result = await cancelEvent(eventId);
      if (result?.error) setError(result.error);
      else {
        setConfirmingCancel(false);
        router.refresh();
      }
    });
  }

  function handleDuplicate() {
    setError("");
    startTransition(async () => {
      const result = await duplicateEvent(eventId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button onClick={handleDuplicate} disabled={pending} className="btn-secondary px-3 py-1.5 text-[12px]">
          <IconCopy size={13} />
          Duplicate
        </button>
        {status === "active" &&
          (confirmingCancel ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text3">Cancel this event?</span>
              <button
                onClick={handleCancel}
                disabled={pending}
                className="rounded-full bg-pink px-3 py-1.5 text-[12px] font-bold text-white transition hover:brightness-110"
              >
                {pending ? "Cancelling…" : "Yes, cancel"}
              </button>
              <button
                onClick={() => setConfirmingCancel(false)}
                className="text-[12px] text-text3 transition hover:text-text2"
              >
                Never mind
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingCancel(true)}
              className="btn-secondary px-3 py-1.5 text-[12px] text-pink"
            >
              <IconBan size={13} />
              Cancel event
            </button>
          ))}
      </div>
      {error && <p className="text-[12px] text-pink">{error}</p>}
    </div>
  );
}
