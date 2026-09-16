import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// This app has never had a middleware.ts (src/lib/supabase/server.ts's
// setAll has carried a "per @supabase/ssr guidance" comment about one
// existing purely to refresh the session cookie -- this is the first thing
// that actually needed one). Two jobs, both from the standard @supabase/ssr
// middleware pattern: refresh the auth cookie on every request, and now
// also gate first-time users into /onboarding before anything else.
//
// Deliberately NOT renamed to this Next.js fork's proxy.ts convention
// (node_modules/next/dist/docs/.../proxy.md) despite the build's own
// deprecation warning -- proxy.ts defaults to the Node.js runtime, and
// OpenNext's Cloudflare adapter hard-rejects that at deploy time ("Node.js
// middleware is not currently supported"). The legacy middleware.ts name
// still runs on the Edge runtime this deployment target actually needs;
// revisit this once OpenNext Cloudflare supports Node-runtime proxy.
const EXEMPT_PREFIXES = [
  "/onboarding",
  "/auth",
  "/login",
  "/api",
  "/_next",
  "/.well-known",
  "/terms",
  "/privacy",
  "/cancellation-refund",
  "/favicon.ico",
  "/manifest.webmanifest",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return response;

  // One extra indexed lookup per request for signed-in users -- accepted
  // for now rather than caching completion in a cookie, since this app has
  // no other cross-request cache mechanism to piggyback on and premature
  // caching here risks a stale "still onboarding" cookie outliving the
  // real DB state.
  const { data: profile } = await supabase.from("profiles").select("onboarding_completed_at").eq("id", user.id).maybeSingle();
  if (profile && profile.onboarding_completed_at === null) {
    // Carries the page the user was actually headed to through the detour --
    // without this, every first-time sign-in would land on "/" once
    // onboarding finishes, regardless of where the sign-in was initiated
    // (the same class of bug already fixed once for Header/BottomNav's own
    // /login?redirect= links).
    const onboardingUrl = new URL("/onboarding", request.url);
    onboardingUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(onboardingUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
