import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The Android/iOS app's actual entry point (capacitor.config.ts's
// server.url points here, not at "/") -- "/" is CloseConnect's public,
// unauthenticated marketing landing page, built to sell the product to a
// first-time web visitor ("Find your people. Host what you love.", browse
// buttons, no sign-in required). That's exactly wrong for someone who
// already installed the app: they've made the decision, there's nothing
// left to sell them, and a real app gates to sign-in first rather than
// showing a marketing splash. Signed-in users skip straight past this to
// the community feed; signed-out users land on /login -- middleware's
// own onboarding gate (0092/proxy.ts) takes it from there for first-time
// sign-ins.
export default async function AppEntryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/communities" : "/login");
}
