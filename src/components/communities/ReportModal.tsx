"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconX, IconLinkOff, IconAlertTriangle, IconBan, IconCopy } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";

// Ported from reference/reference_current_index.html's report flow: a fixed
// single-select list of 4 reasons, submit disabled until one is picked.
// One deliberate deviation from the reference (which allowed anonymous
// reports): SPEC.md Section 5's RLS makes `reports` insert authenticated-only,
// so an anonymous visitor gets sent to sign in instead of silently failing.
//
// Pink here is a deliberate exception to "one accent color everywhere":
// report/destructive contexts are the one place a second color is
// warranted, precisely so it reads as different-in-kind from the app's
// normal (green) actions.
const REASONS = [
  { value: "dead_link", label: "Link no longer works", icon: IconLinkOff },
  { value: "spam", label: "Spam or fake community", icon: IconAlertTriangle },
  { value: "inappropriate", label: "Inappropriate content", icon: IconBan },
  { value: "duplicate", label: "Duplicate listing", icon: IconCopy },
] as const;

export function ReportModal({
  targetType,
  targetId,
  isLoggedIn,
  onClose,
}: {
  targetType: "community" | "event";
  targetId: string;
  isLoggedIn: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const backPath = targetType === "community" ? `/communities/${targetId}` : `/events/${targetId}`;

  async function submit() {
    if (!reason) return;
    if (!isLoggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(backPath)}`);
      return;
    }
    setStatus("submitting");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("reports").insert({
      target_type: targetType,
      target_id: targetId,
      reporter_id: user!.id,
      reason,
    });
    setStatus(error ? "error" : "done");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[420px] rounded-card bg-bg2 p-6 shadow-card-hover">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="font-heading text-[17px] font-bold">Report {targetType}</div>
            <div className="text-[13px] text-text2">Help us keep the directory clean</div>
          </div>
          <button onClick={onClose} className="text-text2 transition hover:text-text">
            <IconX size={18} />
          </button>
        </div>

        {status === "done" ? (
          <p className="py-4 text-center text-[14px] text-text2">
            Thanks for reporting — we&apos;ll review it shortly.
          </p>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-2">
              {REASONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setReason(value)}
                  className="flex items-center gap-3 rounded-card-sm border px-4 py-3 text-left text-[13px] transition hover:border-pink"
                  style={
                    reason === value
                      ? { borderColor: "var(--pink)", color: "var(--pink)", background: "var(--pink-tint)" }
                      : { borderColor: "var(--border)", color: "var(--text2)" }
                  }
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            {status === "error" && (
              <p className="mb-2 text-[12px] text-pink">Could not submit report — try again.</p>
            )}
            <button
              onClick={submit}
              disabled={!reason || status === "submitting"}
              className="w-full rounded-full bg-pink py-3 text-[13px] font-bold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
            >
              {status === "submitting" ? "Submitting…" : isLoggedIn ? "Submit report" : "Sign in to report"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
