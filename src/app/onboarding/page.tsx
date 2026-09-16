import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

// Only a same-origin relative path is ever honored -- a redirect param is
// attacker-shapeable (it round-trips through a URL), so anything else
// (protocol-relative "//evil.com", an absolute "https://...") falls back to
// home instead of being followed.
function safeRedirect(value: string | undefined): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ redirect?: string }> }) {
  const { redirect: redirectParam } = await searchParams;
  const redirectTo = safeRedirect(redirectParam);

  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("onboarding_completed_at").eq("id", user.id).maybeSingle();
  // Reachable directly (typed URL, back button) even once done -- send
  // straight to the intended page rather than showing a stale form.
  if (profile?.onboarding_completed_at) redirect(redirectTo);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="card-elevated w-full max-w-md rounded-card bg-bg2 p-8">
        <h1 className="mb-1 font-heading text-[16px] font-bold">Welcome to CloseConnect</h1>
        <p className="mb-6 text-[13px] text-text3">A few quick things before you dive in.</p>
        <OnboardingForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
