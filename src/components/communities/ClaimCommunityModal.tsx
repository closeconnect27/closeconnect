"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconX } from "@tabler/icons-react";
import { claimCommunitySchema } from "@/lib/validation/community";
import { submitCommunityClaim } from "@/app/actions/communities";

export function ClaimCommunityModal({ communityId, onClose }: { communityId: string; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [proof, setProof] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const parsed = claimCommunitySchema.safeParse({ name, phone, email, proof: proof || undefined });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setStatus("submitting");
    startTransition(async () => {
      const result = await submitCommunityClaim(communityId, parsed.data);
      if (result?.error) {
        setError(result.error);
        setStatus("error");
      } else {
        setStatus("done");
        router.refresh();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[420px] rounded-card bg-bg2 p-6 shadow-card-hover">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="font-heading text-[20px] font-bold">Claim this community</div>
            <div className="text-[13px] text-text2">We&apos;ll review and follow up</div>
          </div>
          <button onClick={onClose} className="text-text2 transition hover:text-text">
            <IconX size={18} />
          </button>
        </div>

        {status === "done" ? (
          <p className="py-4 text-center text-[14px] text-text2">
            Claim submitted -- an admin will review it shortly.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              required
              className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
            />
            <textarea
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              placeholder="Proof you run this community (optional) -- a link, screenshot URL, etc."
              rows={3}
              className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
            />

            {error && <p className="text-[13px] text-pink">{error}</p>}

            <button type="submit" disabled={status === "submitting"} className="btn-primary mt-1 py-3 text-[14px]">
              {status === "submitting" ? "Submitting…" : "Submit claim"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
