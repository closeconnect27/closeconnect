"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconHeart, IconHeartFilled } from "@tabler/icons-react";
import { markInterested, unmarkInterested } from "@/app/actions/interests";

export function InterestedButton({
  eventId,
  initiallyInterested,
  isLoggedIn,
}: {
  eventId: string;
  initiallyInterested: boolean;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [interested, setInterested] = useState(initiallyInterested);
  const [showConsent, setShowConsent] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!isLoggedIn) {
      router.push(`/login?redirect=/events/${eventId}`);
      return;
    }
    if (interested) {
      startTransition(async () => {
        await unmarkInterested(eventId);
        setInterested(false);
      });
    } else {
      setShowConsent(true);
    }
  }

  function confirm(visibleToHost: boolean) {
    setShowConsent(false);
    startTransition(async () => {
      await markInterested(eventId, visibleToHost);
      setInterested(true);
    });
  }

  if (showConsent) {
    return (
      <div className="flex flex-col gap-2 rounded-card-sm border border-border2 p-3">
        <p className="text-[12px] text-text3">Let the host see that you&apos;re interested (not just a total count)?</p>
        <div className="flex gap-2">
          <button onClick={() => confirm(true)} disabled={pending} className="btn-primary px-3 py-1.5 text-[12px]">
            Yes, show my name
          </button>
          <button onClick={() => confirm(false)} disabled={pending} className="btn-secondary px-3 py-1.5 text-[12px]">
            No, keep me anonymous
          </button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={handleClick} disabled={pending} className="btn-secondary px-4 py-2 text-[13px]">
      {interested ? <IconHeartFilled size={14} className="text-pink" /> : <IconHeart size={14} />}
      {interested ? "Interested" : "I'm interested"}
    </button>
  );
}
