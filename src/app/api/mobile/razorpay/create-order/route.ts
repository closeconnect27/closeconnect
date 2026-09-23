import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getEventTicketTypes } from "@/lib/queries/events";
import { createRazorpayOrder } from "@/lib/razorpay";
import { getRegistrationAddonTotalPaise } from "@/lib/eventAddonBilling";

// Mobile-only counterpart of createRazorpayOrderForRegistration
// (src/app/actions/events.ts) -- same logic verbatim, just authenticated via
// a bearer token instead of cookies, since the RN app has no cookie jar to
// share with this origin. The web app keeps using the Server Action
// directly; this route exists purely so the mobile client has a stable,
// callable contract for the same operation.
function clientFromBearer(token: string) {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });

  const supabase = clientFromBearer(token);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { eventId?: string; registrationId?: string } | null;
  const eventId = body?.eventId;
  const registrationId = body?.registrationId;
  if (!eventId || !registrationId) return NextResponse.json({ error: "Missing eventId or registrationId" }, { status: 400 });

  const { data: reg, error: fetchError } = await supabase
    .from("form_responses")
    .select("respondent_id, payment_status, quantity, ticket_type_id, last_order_attempt_at")
    .eq("id", registrationId)
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .single();
  if (fetchError || !reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  if (reg.respondent_id !== user.id) return NextResponse.json({ error: "Not allowed to pay for this registration" }, { status: 403 });
  if (reg.payment_status !== "unpaid") return NextResponse.json({ error: "This registration isn't awaiting payment" }, { status: 409 });

  // Checked (and set below) BEFORE calling Razorpay's API, not after --
  // this actually prevents a tight retry loop from hitting Razorpay's own
  // API repeatedly, not just from writing to our own DB repeatedly.
  if (reg.last_order_attempt_at && Date.now() - new Date(reg.last_order_attempt_at).getTime() < 3000) {
    return NextResponse.json({ error: "Please wait a moment before trying again" }, { status: 429 });
  }

  const ticketTypes = await getEventTicketTypes(supabase, eventId);
  const ticketType = ticketTypes.find((t) => t.id === reg.ticket_type_id);
  if (!ticketType) return NextResponse.json({ error: "That ticket type no longer exists" }, { status: 400 });

  // Ticket price plus this registration's own snapshotted add-on total --
  // same computation as web's createRazorpayOrderForRegistration, so a
  // mobile-originated order can never disagree with a web-originated one.
  const addonTotalPaise = await getRegistrationAddonTotalPaise(supabase, registrationId);
  const amountPaise = Math.round(ticketType.price * reg.quantity * 100) + addonTotalPaise;
  if (amountPaise <= 0) return NextResponse.json({ error: "This ticket doesn't require payment" }, { status: 400 });
  if (amountPaise < 100) return NextResponse.json({ error: "This amount is below Razorpay's minimum payable amount" }, { status: 400 });

  const { error: throttleError } = await supabase
    .from("form_responses")
    .update({ last_order_attempt_at: new Date().toISOString() })
    .eq("id", registrationId);
  if (throttleError) return NextResponse.json({ error: throttleError.message }, { status: 500 });

  let order;
  try {
    order = await createRazorpayOrder({ amountPaise, currency: "INR", receipt: registrationId });
  } catch (e) {
    console.error("Razorpay order creation failed (mobile):", e);
    return NextResponse.json({ error: "Could not start payment -- please try again" }, { status: 502 });
  }

  const { error: updateError } = await supabase.from("form_responses").update({ razorpay_order_id: order.id }).eq("id", registrationId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
  });
}
