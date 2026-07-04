import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Section 1: hosting/joining/registering are three separate login-gated
// actions kept distinct on purpose. Event browsing, event detail, and guest
// registration must stay open -- only page-level routes that always require
// an account are listed here. Join/rate/chat actions live on pages that
// don't exist yet (Phase 4+); protect those with the same requireUser()
// pattern (src/lib/supabase/server.ts) inside their own Server Actions, since
// a proxy matcher change can silently stop covering a route (see Next.js
// proxy docs) -- don't rely on this list alone for those.
const PROTECTED_PREFIXES = ["/profile", "/host"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not remove: getUser() revalidates the token against Supabase Auth on
  // every request, which is what actually keeps the session refreshed.
  // getSession() alone would just trust a possibly-stale cookie.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
