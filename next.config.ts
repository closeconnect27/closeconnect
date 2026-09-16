import type { NextConfig } from "next";

// Every user-uploaded photo (avatars, community/event cover photos, chat
// attachments -- from both this web app and the mobile app, same Supabase
// project) lives in Supabase Storage, not Unsplash. Without this host
// allowlisted too, next/image silently refuses to load those URLs (a
// blocked-by-Next request, not a broken/missing file) and renders blank --
// exactly why mobile-uploaded photos never appeared here. Derived from the
// same env var the Supabase client itself uses, so this can't drift from
// whichever project (dev/staging/prod) is actually configured.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      ...(supabaseHostname ? [{ protocol: "https" as const, hostname: supabaseHostname }] : []),
    ],
  },
};

export default nextConfig;

// Disabled for now: a wrangler/workerd local-persistence bug (unrelated to
// this app's code -- reported separately) crashes every request in `next
// dev` when this runs, even against a freshly-cleared .wrangler/state.
// Nothing in src/ currently calls getCloudflareContext(), so this has no
// effect on the app's actual behavior in dev; it only matters once real
// Cloudflare bindings (KV/D1/Images) are used locally, or in production
// where OpenNext's own worker entrypoint wires the context regardless of
// this line. Re-enable once the wrangler/workerd issue is resolved.
// import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
