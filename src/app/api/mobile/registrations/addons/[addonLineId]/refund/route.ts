import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { refundAddonLineCore } from "@/lib/eventCancellationCore";

// Mobile counterpart of refundAddonLine (app/actions/eventCancellation.ts)
// -- same bearer-token pattern as the other mobile registration routes,
// delegating to the exact same core logic so a host refunding a single
// add-on line from the app can never disagree with the web action.
function clientFromBearer(token: string) {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ addonLineId: string }> }) {
  const { addonLineId } = await params;

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });

  const supabase = clientFromBearer(token);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });

  const result = await refundAddonLineCore(supabase, user.id, addonLineId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
