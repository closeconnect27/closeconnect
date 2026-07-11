"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconSeeding } from "@tabler/icons-react";

// Admin-only -- rendered conditionally by the page, and the server action
// it calls re-checks is_admin() itself regardless (SPEC.md Section 11).
// One component for both targets (community/host) since the action is the
// only thing that differs.
export function FoundingToggle({
  founding,
  onToggle,
}: {
  founding: boolean;
  onToggle: (next: boolean) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    setError("");
    startTransition(async () => {
      const result = await onToggle(!founding);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-60 ${
          founding ? "border-purple bg-purple/10 text-purple" : "border-border2 text-text2 hover:border-purple hover:text-purple"
        }`}
      >
        <IconSeeding size={14} />
        {founding ? "Founding -- click to unmark" : "Mark as founding member"}
      </button>
      {error && <p className="text-[12px] text-pink">{error}</p>}
    </div>
  );
}
