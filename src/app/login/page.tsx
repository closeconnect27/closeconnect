"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import { IconMailCheck, IconBrandGoogle } from "@tabler/icons-react";
import { Capacitor } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import { AppLaunchIntro } from "@/components/system/AppLaunchIntro";

// `window.google` already has a global type from @types/google.maps (the
// venue autocomplete elsewhere in this app) -- augmenting Window.google
// again here would conflict with it, so Identity Services' shape is kept
// as a local type and read via a cast at each access site instead.
type GoogleIdentityServices = {
  accounts: {
    id: {
      initialize: (config: { client_id: string; nonce: string; callback: (response: { credential: string }) => void }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
};
function getGoogleIdentityServices(): GoogleIdentityServices | undefined {
  return (window as unknown as { google?: GoogleIdentityServices }).google;
}

// SHA-256 hash of a random nonce, per Supabase's documented Google Identity
// Services flow: the HASH goes to Google's initialize() (embedded in the
// returned ID token's own nonce claim), the RAW value goes to
// signInWithIdToken, which hashes it again to verify a match -- this is
// what stops a captured/replayed ID token from being reusable.
async function generateNonce(): Promise<[raw: string, hashed: string]> {
  const raw = crypto.randomUUID();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [raw, hashed];
}

// Google Sign-In is the primary, required path everywhere an account is
// needed (SPEC.md Section 9) -- the email magic-link infra stays in place
// as a visible fallback rather than dead code, specifically so a Google
// misconfiguration doesn't take the whole app's sign-in down with it.
//
// Uses Google Identity Services' ID-token flow (renders Google's own
// button, mints a token client-side) instead of the old signInWithOAuth
// redirect -- two reasons: (1) the redirect flow's callback URL is
// Supabase's own *.supabase.co domain, which surfaced in Google's consent
// screen instead of CloseConnect's; ID tokens never touch that domain.
// (2) Google blocks its redirect-based OAuth entirely inside an embedded
// WebView ("disallowed_useragent"), which is exactly how the Capacitor
// Android app would otherwise have to sign in -- the ID-token flow has no
// such restriction.
function GoogleSignInButton({ redirect }: { redirect: string }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const gis = getGoogleIdentityServices();
    if (!scriptLoaded || !buttonRef.current || !gis) return;
    const container = buttonRef.current;
    let cancelled = false;

    generateNonce().then(([rawNonce, hashedNonce]) => {
      if (cancelled) return;
      gis.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        nonce: hashedNonce,
        callback: async (response: { credential: string }) => {
          const supabase = createClient();
          const { error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: response.credential,
            nonce: rawNonce,
          });
          if (error) {
            setError(error.message);
            return;
          }
          window.location.href = redirect;
        },
      });
      gis.accounts.id.renderButton(container, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 320,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [scriptLoaded, redirect]);

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setScriptLoaded(true)} />
      <div ref={buttonRef} className="flex w-full justify-center" />
      {error && <p className="mt-2 text-[13px] text-pink">{error}</p>}
    </>
  );
}

// Android/iOS counterpart to GoogleSignInButton above -- Google Identity
// Services' rendered button (and its underlying account-picker flow) is
// silently a no-op inside a Capacitor WebView, confirmed by testing this
// build directly (no button rendered, no console error either). Firebase's
// native SDK talks to Google Play Services/Credential Manager outside the
// WebView entirely, so it isn't subject to that restriction. Firebase's own
// nonce (returned on the credential) is reused as-is for signInWithIdToken
// rather than generating a second one -- there's only ever one token to
// verify here.
//
// @capacitor-firebase/authentication is dynamically imported (not a
// top-level import) purely to keep its web fallback -- which statically
// pulls in the full firebase/auth JS SDK -- out of the web bundle entirely;
// this branch never runs in a browser, only inside the native app.
function NativeGoogleSignInButton({ redirect }: { redirect: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setPending(true);
    setError("");
    try {
      const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
      const result = await FirebaseAuthentication.signInWithGoogle();
      const idToken = result.credential?.idToken;
      if (!idToken) {
        setError("Google sign-in didn't return a token. Please try again.");
        setPending(false);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
        nonce: result.credential?.nonce,
      });
      if (error) {
        setError(error.message);
        setPending(false);
        return;
      }
      window.location.href = redirect;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed. Please try again.");
      setPending(false);
    }
  }

  return (
    <>
      <button onClick={handleClick} disabled={pending} className="btn-primary w-full py-3 text-[14px]">
        <IconBrandGoogle size={16} />
        {pending ? "Signing in…" : "Continue with Google"}
      </button>
      {error && <p className="mt-2 text-[13px] text-pink">{error}</p>}
    </>
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
      {Capacitor.isNativePlatform() ? <NativeGoogleSignInButton redirect={redirect} /> : <GoogleSignInButton redirect={redirect} />}

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
      <AppLaunchIntro>
        <div className="card-elevated w-full max-w-sm rounded-card bg-bg2 p-8 text-center">
          <h1 className="mb-6 font-heading text-[14px] font-bold">Sign in to CloseConnect</h1>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </AppLaunchIntro>
    </div>
  );
}
