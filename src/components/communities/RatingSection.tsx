"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconStar } from "@tabler/icons-react";
import { RatingModal } from "@/components/communities/RatingModal";

export function RatingSection({
  communityId,
  isLoggedIn,
  myRating,
}: {
  communityId: string;
  isLoggedIn: boolean;
  myRating: { rating: number; review: string | null } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function handleClick() {
    if (!isLoggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(`/communities/${communityId}`)}`);
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <button onClick={handleClick} className="btn-secondary px-6 py-3 text-[14px]">
        <IconStar size={16} className={myRating ? "fill-green text-green" : ""} />
        {myRating ? `Your rating: ${myRating.rating}/5` : "Rate this community"}
      </button>

      {open && (
        <RatingModal
          communityId={communityId}
          initialRating={myRating?.rating ?? 0}
          initialReview={myRating?.review ?? ""}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
