import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRazorpaySignature, getRazorpayPaymentFee } from "@/lib/razorpay";
import { sendRegistrationConfirmationEmail } from "@/lib/eventRegistrationEmails";
import { getEventTicketTypes } from "@/lib/queries/events";
import { getRegistrationAddonTotalPaise } from "@/lib/eventAddonBilling";

// Mobile-only counterpart of verifyRazorpayPayment (src/app/actions/events.ts)
// -- identical verification logic (HMAC check, order_id match against what
// create-order stored, admin-client write since RLS can't express "only if
// the signature checked out"), just reachable over HTTP with a bearer token
// instead of a same-origin Server Action call.
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

  const body = (await request.json().catch(() => null)) as {
    eventId?: string;
    registrationId?: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  } | null;
  const { eventId, registrationId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body ?? {};
  if (!eventId || !registrationId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
  }

  const { data: reg, error: fetchError } = await supabase
    .from("form_responses")
    .select("respondent_id, payment_status, razorpay_order_id, response_data, ticket_type_id, quantity")
    .eq("id", registrationId)
    .eq("owner_type", "event")
    .eq("owner_id", eventId)
    .single();
  if (fetchError || !reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  if (reg.respondent_id !== user.id) return NextResponse.json({ error: "Not allowed to update this registration" }, { status: 403 });
  // Already paid -- the server-to-server webhook may have won the race
  // against this client-driven callback. The payment genuinely succeeded,
  // so this resolves as success too, matching the web action's own posture.
  if (reg.payment_status === "paid") return NextResponse.json({ ok: true });
  if (reg.payment_status !== "unpaid") return NextResponse.json({ error: "This registration isn't awaiting payment" }, { status: 409 });
  if (reg.razorpay_order_id !== razorpay_order_id) return NextResponse.json({ error: "Order mismatch -- please try again" }, { status: 409 });

  let valid: boolean;
  try {
    valid = await verifyRazorpaySignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature });
  } catch (e) {
    console.error("Razorpay signature verification failed (mobile):", e);
    return NextResponse.json({ error: "Could not verify payment -- please try again" }, { status: 502 });
  }
  if (!valid) return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });

  // Recomputed the exact same way create-order priced this order -- never
  // re-read from Razorpay's own response. Missing this (the mobile route's
  // original form) meant a mobile-paid registration's amount_paid_paise
  // stayed null forever, which organizerSettlement.ts reads as ₹0 owed --
  // silently excluding every mobile-originated sale from an organizer's
  // payout.
  const ticketTypes = await getEventTicketTypes(supabase, eventId);
  const ticketType = ticketTypes.find((t) => t.id === reg.ticket_type_id);
  const addonTotalPaise = await getRegistrationAddonTotalPaise(supabase, registrationId);
  const amountPaidPaise = ticketType ? Math.round(ticketType.price * reg.quantity * 100) + addonTotalPaise : null;

  let gatewayFeePaise: number | null = null;
  try {
    gatewayFeePaise = (await getRazorpayPaymentFee(razorpay_payment_id)).feePaise;
  } catch (e) {
    console.error("Failed to fetch Razorpay payment fee (mobile):", e);
  }

  // .eq("payment_status", "unpaid") makes this write atomic: if a
  // concurrent call (e.g. a flaky-network retry, or a race against the
  // webhook) already flipped this row to 'paid' between the read above and
  // this write, that "unpaid" condition no longer matches and .select()
  // returns zero rows -- caught below to skip sending a second confirmation
  // email/notification for the same payment.
  const admin = createAdminClient();
  const { data: updated, error: updateError } = await admin
    .from("form_responses")
    .update({ payment_status: "paid", razorpay_payment_id, amount_paid_paise: amountPaidPaise, gateway_fee_paise: gatewayFeePaise })
    .eq("id", registrationId)
    .eq("payment_status", "unpaid")
    .select("id");
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated || updated.length === 0) return NextResponse.json({ ok: true });

  const responseData = reg.response_data as unknown as { name?: string; email?: string } | null;
  if (responseData?.email) {
    try {
      await sendRegistrationConfirmationEmail(supabase, {
        email: responseData.email,
        eventId,
        registrantName: responseData.name ?? "there",
      });
    } catch (e) {
      console.error("Failed to send post-payment confirmation email (mobile):", e);
    }
  }
  await supabase.from("notifications").insert({
    user_id: user.id,
    type: "event_registered",
    title: "You're registered!",
    body: "Payment confirmed",
    link: `/events/${eventId}`,
  });

  return NextResponse.json({ ok: true });
}
