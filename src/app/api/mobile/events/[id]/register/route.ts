import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { registerForEventCore } from "@/lib/eventRegistrationCore";
import type { EventRegistrationInput } from "@/lib/validation/event";

// Mobile counterpart of registerForEvent (app/actions/events.ts) -- same
// bearer-token pattern as every other mobile route. Mobile used to insert
// the registration (and, for this feature, would have had to insert
// form_response_addons) directly via its own RLS-scoped client -- fine for
// the registration row itself (RLS already restricts respondent_id to
// auth.uid()), but NOT fine for add-ons, since a client-supplied
// unit_price_paise would become the authoritative price the moment
// getRegistrationAddonTotalPaise reads it back for the Razorpay order.
// Routing registration through registerForEventCore instead means the
// price is always freshly read from event_addons server-side, exactly like
// the web app already does.
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

  let input: EventRegistrationInput;
  try {
    input = (await request.json()) as EventRegistrationInput;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await registerForEventCore(supabase, user.id, user.email, eventId, input);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
