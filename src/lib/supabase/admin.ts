import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client -- bypasses RLS entirely. Two legitimate uses in this
// app: send-event-reminders (an Edge Function, looking up registrant
// emails to send reminders) and this one (looking up admin/community-owner
// emails to send notification emails). Both exist because `profiles` has
// no email column by design (see lib/email.ts) -- auth.users.email is only
// reachable via the admin API. Never import this into anything that
// executes client-side; SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_
// prefix so Next.js won't bundle it either way, but this file itself
// should only ever be called from Server Actions/Route Handlers.
export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
