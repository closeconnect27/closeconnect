"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconChevronDown, IconMail } from "@tabler/icons-react";
import { markPayoutsSettled } from "@/app/actions/payouts";
import type { OrganizerPayout } from "@/lib/queries/payouts";

export function PayoutSummarySection({ organizers }: { organizers: OrganizerPayout[] }) {
  if (organizers.length === 0) {
    return <p className="mt-8 text-center text-[13px] text-text3">Nothing owed right now -- every paid registration has been marked forwarded.</p>;
  }

  return (
    <div className="mt-8 flex flex-col gap-3">
      {organizers.map((o) => (
        <OrganizerRow key={o.hostId} organizer={o} />
      ))}
    </div>
  );
}

function OrganizerRow({ organizer }: { organizer: OrganizerPayout }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleMarkSettled() {
    setError("");
    startTransition(async () => {
      const result = await markPayoutsSettled(organizer.lines.map((l) => l.registrationId));
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="card-elevated rounded-card bg-bg2 p-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setExpanded((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <IconChevronDown size={16} className={`shrink-0 text-text3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold text-text">{organizer.hostName}</p>
            {organizer.hostEmail && (
              <p className="flex items-center gap-1 truncate text-[12px] text-text3">
                <IconMail size={12} />
                {organizer.hostEmail}
              </p>
            )}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-heading text-[16px] font-bold text-green">₹{organizer.totalOwedRupees.toLocaleString("en-IN")}</span>
          <button onClick={handleMarkSettled} disabled={pending} className="btn-secondary px-3 py-1.5 text-[12px]">
            {pending ? "Marking…" : "Mark paid out"}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-[12px] text-pink">{error}</p>}

      {expanded && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
          {organizer.lines.map((line) => (
            <div key={line.registrationId} className="flex items-center justify-between text-[13px]">
              <span className="text-text2">
                {line.eventName}
                {line.quantity > 1 && <span className="text-text3"> ×{line.quantity}</span>}
              </span>
              <span className="font-medium text-text">₹{line.amountRupees.toLocaleString("en-IN")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
