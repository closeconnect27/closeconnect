"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconSparkles, IconX } from "@tabler/icons-react";
import { switchCommunityToNative } from "@/app/actions/communities";

// Owner-only, shown on the detail page only once a claim has actually been
// approved (server action re-checks both -- see switchCommunityToNative's
// comment for why this needs no new rows, just the kind flip). Confirmation
// modal follows the same shell as ReportModal rather than a bare
// window.confirm() -- this is a one-way switch (no "go back to external"
// path exists), so it gets an explanation, not just a yes/no.
export function GoNativeButton({ communityId }: { communityId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function confirmSwitch() {
    setError("");
    startTransition(async () => {
      const result = await switchCommunityToNative(communityId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary px-4 py-2 text-[13px]">
        <IconSparkles size={14} />
        Go Native
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-[420px] rounded-card bg-bg2 p-6 shadow-card-hover">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="font-heading text-[14px] font-bold">Go Native</div>
                <div className="text-[13px] text-text2">Unlock the full Closeconnect toolkit</div>
              </div>
              <button onClick={() => setOpen(false)} className="text-text2 transition hover:text-text">
                <IconX size={18} />
              </button>
            </div>
            <p className="mb-4 text-[13px] leading-relaxed text-text2">
              Your community gets groups with chat, a member list, join settings, and analytics — everything a
              native Closeconnect community has. Your WhatsApp/Instagram link stays right where it is.
            </p>
            {error && <p className="mb-2 text-[12px] text-pink">{error}</p>}
            <button onClick={confirmSwitch} disabled={pending} className="btn-primary w-full py-3 text-[13px]">
              {pending ? "Switching…" : "Go Native"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
