"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
    return <p className="text-center text-text2">Check {email} for a sign-in link.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-card-sm border border-border2 bg-bg3 px-3 py-2 text-text placeholder:text-text3"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-full bg-green px-3 py-2 font-bold text-green-dark disabled:opacity-50"
      >
        {status === "sending" ? "Sending..." : "Send magic link"}
      </button>
      {error && <p className="text-sm text-pink">{error}</p>}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-heading text-2xl font-bold">Sign in to Close.Connect</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
