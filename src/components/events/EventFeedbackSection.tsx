"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconStar } from "@tabler/icons-react";
import { EventFeedbackModal } from "@/components/events/EventFeedbackModal";

export function EventFeedbackSection({
  eventId,
  isLoggedIn,
  hasCheckedIn,
  myFeedback,
}: {
  eventId: string;
  isLoggedIn: boolean;
  hasCheckedIn: boolean;
  myFeedback: { rating: number; comment: string | null } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Feedback is only a meaningful signal from someone who actually showed
  // up -- gated the same way server-side (is_checked_in_attendee), so this
  // is a UI convenience, not the real enforcement. Not hidden for a
  // logged-out visitor since we can't know their attendance until they sign
  // in, same as the click-through-to-login pattern used for ratings.
  if (isLoggedIn && !hasCheckedIn) return null;

  function handleClick() {
    if (!isLoggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(`/events/${eventId}`)}`);
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <button onClick={handleClick} className="btn-secondary px-6 py-3 text-[14px]">
        <IconStar size={16} className={myFeedback ? "fill-green text-green" : ""} />
        {myFeedback ? `Your rating: ${myFeedback.rating}/5` : "Rate this event"}
      </button>

      {open && (
        <EventFeedbackModal
          eventId={eventId}
          initialRating={myFeedback?.rating ?? 0}
          initialComment={myFeedback?.comment ?? ""}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
