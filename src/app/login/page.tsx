"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { IconMailCheck } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });

    if (error) {
      setError(error.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-tint">
          <IconMailCheck size={24} className="text-green" />
        </div>
        <p className="text-[14px] text-text2">Check {email} for a sign-in link.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] text-text transition placeholder:text-text3 focus:border-green"
      />
      <button type="submit" disabled={status === "sending"} className="btn-primary py-3 text-[14px]">
        {status === "sending" ? "Sending…" : "Send sign-in link"}
      </button>
      {error && <p className="text-[13px] text-pink">{error}</p>}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="card-elevated w-full max-w-sm rounded-card bg-bg2 p-8 text-center">
        <h1 className="mb-6 font-heading text-[24px] font-extrabold">Sign in to Close.Connect</h1>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
