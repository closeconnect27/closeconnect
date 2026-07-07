"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { IconMailCheck, IconBrandGoogle } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";

// Google Sign-In is now the primary, required path everywhere an account is
// needed (SPEC.md Section 9) -- the email magic-link infra stays in place
// (not ripped out) as a visible fallback rather than dead code, specifically
// so a Google OAuth misconfiguration doesn't take the whole app's sign-in
// down with it.
function GoogleSignInButton({ redirect }: { redirect: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });
    // No further state update needed on success -- signInWithOAuth navigates
    // the whole page to Google, so this component unmounts. `pending` only
    // matters for the (rare) case the call rejects before that happens.
  }

  return (
    <button onClick={handleClick} disabled={pending} className="btn-primary w-full py-3 text-[14px]">
      <IconBrandGoogle size={16} />
      {pending ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}

function EmailSignInForm({ redirect }: { redirect: string }) {
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
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] text-text transition placeholder:text-text3 focus:border-green"
      />
      <button type="submit" disabled={status === "sending"} className="btn-secondary py-3 text-[14px]">
        {status === "sending" ? "Sending…" : "Send sign-in link"}
      </button>
      {error && <p className="text-[13px] text-pink">{error}</p>}
    </form>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";
  const [showEmail, setShowEmail] = useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <GoogleSignInButton redirect={redirect} />

      {showEmail ? (
        <EmailSignInForm redirect={redirect} />
      ) : (
        <button
          onClick={() => setShowEmail(true)}
          className="text-[13px] text-text3 transition hover:text-text2"
        >
          Or continue with email
        </button>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="card-elevated w-full max-w-sm rounded-card bg-bg2 p-8 text-center">
        <h1 className="mb-6 font-heading text-[14px] font-bold">Sign in to Closeconnect</h1>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
