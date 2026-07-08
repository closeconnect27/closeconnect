import { requireUser } from "@/lib/supabase/auth";
import { NewCommunityForm } from "@/components/communities/NewCommunityForm";

// Server-gated shell, same pattern as /profile and /host/dashboard --
// requireUser() redirects to /login before the form ever renders. Used to
// rely on proxy.ts (global middleware) for this instead; that stopped being
// an option once Next.js 16 made Proxy always run on the Node.js runtime
// (no edge-runtime opt-out) and @opennextjs/cloudflare refused to build
// Node.js middleware at all. The form itself is a client component (all the
// interactive state), so the auth check has to live in a server wrapper
// around it, not inside it.
export default async function NewCommunityPage() {
  await requireUser();
  return <NewCommunityForm />;
}
