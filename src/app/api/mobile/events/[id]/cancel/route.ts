import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cancelEventForHost } from "@/lib/cancelEvent";

// Mobile counterpart of cancelEvent (src/app/actions/events.ts) -- mobile's
// event-edit screen used to flip status to 'cancelled' via the same plain
// client update as any other detail edit, which could never notify other
// registrants anyway (notifications_insert_self only allows user_id =
// auth.uid(), and mobile has no service-role client to write into someone
// else's row). Same bearer-token pattern as the other mobile routes.
function clientFromBearer(token: string) {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
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

  const { error } = await cancelEventForHost(supabase, eventId, user.id);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ error: null });
}
