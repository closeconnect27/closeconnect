# Close.Connect

Community + events platform. Next.js 16 (App Router, TypeScript, Tailwind) + Supabase, deployed to Cloudflare Workers via OpenNext.

Reference mockups and the full build spec live in [`reference/`](reference/SPEC.md).

## Development

```bash
npm install
cp .env.example .env.local   # fill in Supabase project URL/anon key
npm run dev                  # http://localhost:3000
```

## Deploying to Cloudflare

Build uses webpack, not Turbopack — the OpenNext Cloudflare adapter doesn't yet support Turbopack's chunk output (see `package.json`'s `build` script).

```bash
npx wrangler login           # one-time, opens a browser
npm run preview              # build + serve the Workers bundle locally via wrangler dev
npm run deploy                # build + deploy to Cloudflare Workers
```

Environment variables/secrets for the deployed Worker are set via `wrangler secret put <NAME>` (server-only values) or in the Cloudflare dashboard, not in `wrangler.jsonc`.
