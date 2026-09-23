import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { previewCancellationCore } from "@/lib/eventCancellationCore";

// Mobile counterpart of previewCancellationForRegistration
// (app/actions/eventCancellation.ts) -- read-only, same bearer-token
// pattern as every other mobile route. GET, not POST: this never writes
// anything, it only computes what a cancellation WOULD do right now.
function clientFromBearer(token: string) {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: registrationId } = await params;

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });

  const supabase = clientFromBearer(token);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });

  const result = await previewCancellationCore(supabase, user.id, registrationId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
