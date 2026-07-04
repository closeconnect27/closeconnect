"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconX, IconStar } from "@tabler/icons-react";
import { submitRating } from "@/app/actions/ratings";

export function RatingModal({
  communityId,
  initialRating,
  initialReview,
  onClose,
}: {
  communityId: string;
  initialRating: number;
  initialReview: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(initialRating);
  const [hovered, setHovered] = useState(0);
  const [review, setReview] = useState(initialReview);
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  async function submit() {
    if (rating < 1) return;
    setStatus("submitting");
    const result = await submitRating(communityId, rating, review);
    if (result.error) {
      setError(result.error);
      setStatus("error");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[420px] rounded-card bg-bg2 p-6 shadow-card-hover">
        <div className="mb-4 flex items-start justify-between">
          <div className="font-heading text-[17px] font-bold">
            {initialRating > 0 ? "Update your rating" : "Rate this community"}
          </div>
          <button onClick={onClose} className="text-text2 transition hover:text-text">
            <IconX size={18} />
          </button>
        </div>

        <div className="mb-4 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(n)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              className="transition hover:scale-110"
            >
              <IconStar
                size={32}
                className={(hovered || rating) >= n ? "fill-green text-green" : "text-border2"}
              />
            </button>
          ))}
        </div>

        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="Optional review…"
          rows={3}
          maxLength={500}
          className="w-full rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
        />

        {error && <p className="mt-2 text-[13px] text-pink">{error}</p>}

        <button
          onClick={submit}
          disabled={rating < 1 || status === "submitting"}
          className="btn-primary mt-4 w-full py-3 text-[13px]"
        >
          {status === "submitting" ? "Saving…" : "Submit rating"}
        </button>
      </div>
    </div>
  );
}
