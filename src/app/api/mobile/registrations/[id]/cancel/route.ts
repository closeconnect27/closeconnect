import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cancelMyRegistrationCore } from "@/lib/eventCancellationCore";

// Mobile counterpart of cancelMyRegistration (app/actions/eventCancellation.ts)
// -- same bearer-token pattern as the other mobile routes (e.g.
// api/mobile/events/[id]/cancel), delegating to the exact same core logic
// so web and mobile can never calculate or apply a refund differently.
function clientFromBearer(token: string) {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: registrationId } = await params;

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });

  const supabase = clientFromBearer(token);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });

  let reason: string | undefined;
  try {
    const body = (await request.json()) as { reason?: string };
    reason = body.reason;
  } catch {
    // No/invalid JSON body -- reason is optional, not a request error.
  }

  const result = await cancelMyRegistrationCore(supabase, user.id, registrationId, reason);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
