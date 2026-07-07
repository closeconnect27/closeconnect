"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconStar } from "@tabler/icons-react";
import { RatingModal } from "@/components/communities/RatingModal";

export function RatingSection({
  communityId,
  isLoggedIn,
  isOwner,
  isMember,
  myRating,
}: {
  communityId: string;
  isLoggedIn: boolean;
  isOwner: boolean;
  isMember: boolean;
  myRating: { rating: number; review: string | null } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // A self-rating isn't a meaningful signal (it's not real social proof, and
  // an owner could inflate or deflate their own average either way) --
  // hidden here, and rejected server-side too (0013) so this isn't just a
  // UI-only gate a direct action call could bypass. Same reasoning for
  // non-members (0029): rating something you never joined isn't a
  // meaningful signal either, also rejected server-side. Not hidden for a
  // logged-out visitor, though -- we can't know their membership until they
  // sign in, same as the click-through-to-login pattern below.
  if (isOwner) return null;
  if (isLoggedIn && !isMember) return null;

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
