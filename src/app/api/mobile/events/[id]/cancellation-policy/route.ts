import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { saveCancellationPolicyCore, type SaveCancellationPolicyInput } from "@/lib/eventCancellationCore";
import { DEFAULT_CANCELLATION_POLICY, type CancellationPolicyRule, type CancellationPolicySnapshot } from "@/lib/eventCancellation";

// Mobile counterpart of getCancellationPolicyForEvent/saveCancellationPolicy
// (app/actions/eventCancellation.ts) -- GET is public (no auth required,
// same RLS-permitted read mobile's event detail screen already does
// directly against event_cancellation_policies), POST is host-only via
// saveCancellationPolicyCore, same bearer-token pattern as every other
// mobile route.
function clientFromBearer(token: string | null) {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = clientFromBearer(null);
  const { data } = await supabase.from("event_cancellation_policies").select("enabled, rules").eq("event_id", eventId).maybeSingle();
  if (!data) {
    return NextResponse.json({ policy: DEFAULT_CANCELLATION_POLICY, usingDefault: true });
  }
  const policy: CancellationPolicySnapshot = { enabled: data.enabled, rules: data.rules as unknown as CancellationPolicyRule[] };
  return NextResponse.json({ policy, usingDefault: false });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });

  const supabase = clientFromBearer(token);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });

  let input: SaveCancellationPolicyInput;
  try {
    input = (await request.json()) as SaveCancellationPolicyInput;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await saveCancellationPolicyCore(supabase, user.id, eventId, input);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ error: null });
}
