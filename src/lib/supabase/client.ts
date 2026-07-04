import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Realtime's RLS enforcement needs the current user's JWT on the socket,
  // not just the anon key -- without this, postgres_changes subscriptions
  // silently receive nothing for RLS-protected tables (auth.uid() resolves
  // to null on the realtime connection, so is_group_member() etc. all fail
  // closed). supabase-js is supposed to wire this via its own internal
  // auth-state listener, but that only fires on auth *events* -- a fresh
  // page load that starts already-signed-in (our case: session lives in a
  // cookie, not established via a client-side sign-in call on this page)
  // may reach realtime.setAuth() too late relative to a channel's first
  // subscribe(). Sync explicitly and immediately so it's never lagging.
  client.auth.getSession().then(({ data: { session } }) => {
    if (session) client.realtime.setAuth(session.access_token);
  });

  return client;
}
