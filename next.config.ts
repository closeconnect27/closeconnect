import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
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
